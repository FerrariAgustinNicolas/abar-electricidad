import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
const apiUrl = new URL(args.get('api-url') ?? 'http://127.0.0.1:3000');
const mailpitUrl = new URL(args.get('mailpit-url') ?? 'http://127.0.0.1:8025');
const smtpPort = Number(args.get('smtp-port') ?? 1025);
const isLoopback = (url) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

if (apiUrl.protocol !== 'http:' || !isLoopback(apiUrl) || mailpitUrl.protocol !== 'http:' || !isLoopback(mailpitUrl)) {
  throw new Error('Smoke checks are restricted to loopback HTTP endpoints.');
}
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
  throw new Error('SMTP port must be an integer between 1 and 65535.');
}

let managedBackend;
function launchBackend(port, databaseUrl) {
  return spawn(process.execPath, [fileURLToPath(new URL('../backend/dist/main.js', import.meta.url))], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'ignore',
    env: {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: databaseUrl,
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: String(port),
    },
  });
}

async function ensureBackend() {
  try {
    const response = await fetch(new URL('/health', apiUrl), { signal: AbortSignal.timeout(500) });
    if (response.status === 200) return;
    throw new Error(`A service already listening at ${apiUrl.origin} returned HTTP ${response.status}.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A service already listening')) throw error;
  }

  const port = Number(apiUrl.port || 80);
  managedBackend = launchBackend(port, 'postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (managedBackend.exitCode !== null) throw new Error('The locally started backend exited before becoming ready.');
    try {
      const response = await fetch(new URL('/health', apiUrl), { signal: AbortSignal.timeout(500) });
      if (response.status === 200) return;
      throw new Error(`The locally started backend returned HTTP ${response.status} from /health.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('locally started backend')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The locally started backend did not become ready within 15 seconds.');
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      timer.unref();
    }),
  ]);
}

async function freeLoopbackPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function verifyUnavailableDatabase() {
  const port = await freeLoopbackPort();
  const child = launchBackend(port, 'postgresql://abar_demo:fake-local-password@127.0.0.1:1/abar_unavailable');
  const url = new URL(`http://127.0.0.1:${port}`);
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (child.exitCode !== null) throw new Error('Backend failed to start with PostgreSQL unavailable.');
      try {
        const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(500) });
        const body = await response.json();
        if (response.status !== 503 || body.code !== 'SERVICE_UNAVAILABLE' || body.message !== 'Servicio temporalmente no disponible' || !/^[0-9a-f-]{36}$/i.test(body.requestId ?? '')) {
          throw new Error('Unavailable PostgreSQL did not produce the safe health 503 contract.');
        }
        if (/password|secret|database|stack|path/i.test(JSON.stringify(body))) {
          throw new Error('Unavailable PostgreSQL error leaked internal details.');
        }
        console.log('PASS unavailable PostgreSQL: real HTTP 503 uses the safe UUID error contract.');
        return;
      } catch (error) {
        if (error instanceof Error && error.message.includes('did not produce')) throw error;
        if (error instanceof Error && error.message.includes('leaked internal')) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Backend did not answer the unavailable-PostgreSQL health check within 15 seconds.');
  } finally {
    await stopBackend(child);
  }
}

try {
await ensureBackend();
async function requireResponse(response, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response;
}

const healthResponse = await requireResponse(await fetch(new URL('/health', apiUrl)), 'GET /health');
const health = await healthResponse.json();
if (healthResponse.status !== 200 || health.status !== 'ok') throw new Error('GET /health did not return {"status":"ok"}.');
console.log('PASS GET /health: PostgreSQL-backed health returned 200.');

const docsResponse = await requireResponse(await fetch(new URL('/api/docs', apiUrl)), 'GET /api/docs');
if (!(await docsResponse.text()).includes('swagger-ui')) throw new Error('Swagger UI document was not served.');
const openApiResponse = await requireResponse(await fetch(new URL('/api/docs-json', apiUrl)), 'GET /api/docs-json');
const openApi = await openApiResponse.json();
if (openApi.openapi !== '3.0.3' || Object.keys(openApi.paths ?? {}).join(',') !== '/health') {
  throw new Error('Swagger must use OpenAPI 3.0.3 and document only GET /health.');
}
console.log('PASS GET /api/docs: Swagger UI and OpenAPI 3.0.3 expose only the implemented health route.');

const errorResponse = await fetch(new URL('/api/v1/h0-smoke-not-implemented', apiUrl));
const error = await errorResponse.json();
if (errorResponse.status !== 404 || error.code !== 'NOT_FOUND' || !/^[0-9a-f-]{36}$/i.test(error.requestId ?? '')) {
  throw new Error('Unknown routes must return a safe error envelope with a UUID requestId.');
}
if (/password|secret|database|stack|path/i.test(JSON.stringify(error))) {
  throw new Error('Error response contains unsafe implementation details.');
}
console.log('PASS unknown API route: uniform safe 404 error envelope with requestId.');

async function smtpReply(iterator) {
  const lines = [];
  while (true) {
    const item = await iterator.next();
    if (item.done) throw new Error('Mailpit closed the local SMTP connection unexpectedly.');
    lines.push(item.value);
    if (/^\d{3} /.test(item.value)) break;
  }
  const code = Number(lines.at(-1).slice(0, 3));
  return { code, lines };
}

async function smtpCommand(socket, iterator, command, acceptedCodes) {
  socket.write(`${command}\r\n`);
  const reply = await smtpReply(iterator);
  if (!acceptedCodes.includes(reply.code)) {
    throw new Error(`Local SMTP command failed with code ${reply.code}.`);
  }
  return reply;
}

async function sendFictitiousMail() {
  const socket = createConnection({ host: '127.0.0.1', port: smtpPort });
  socket.setEncoding('utf8');
  socket.setTimeout(5000);
  socket.on('timeout', () => socket.destroy(new Error('Local Mailpit SMTP timed out.')));
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  try {
    await once(socket, 'connect');
    const iterator = lines[Symbol.asyncIterator]();
    const greeting = await smtpReply(iterator);
    if (greeting.code !== 220) throw new Error('Local Mailpit SMTP did not send its greeting.');
    await smtpCommand(socket, iterator, 'EHLO abar-h0-smoke.local', [250]);
    await smtpCommand(socket, iterator, 'MAIL FROM:<h0-smoke@example.test>', [250]);
    await smtpCommand(socket, iterator, 'RCPT TO:<h0-customer@example.test>', [250, 251]);
    await smtpCommand(socket, iterator, 'DATA', [354]);
    const subject = `ABAR H0 local smoke ${Date.now()}`;
    const message = [
      'From: ABAR H0 Smoke <h0-smoke@example.test>',
      'To: H0 Test Recipient <h0-customer@example.test>',
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Mensaje ficticio de verificacion local; no enviar externamente.',
      '.',
    ].join('\r\n') + '\r\n';
    socket.write(message);
    await smtpReply(iterator).then((reply) => {
      if (reply.code !== 250) throw new Error('Mailpit did not accept the local test message.');
    });
    await smtpCommand(socket, iterator, 'QUIT', [221]);
    lines.close();
    socket.end();
    return subject;
  } catch (error) {
    lines.close();
    socket.destroy();
    throw error;
  }
}

const subject = await sendFictitiousMail();
let captured = false;
for (let attempt = 0; attempt < 15; attempt += 1) {
  const response = await requireResponse(
    await fetch(new URL('/api/v1/messages?limit=50', mailpitUrl)),
    'Mailpit messages API',
  );
  const result = await response.json();
  captured = (result.messages ?? []).some((message) =>
    message.Subject === subject && message.To?.some((recipient) => recipient.Address === 'h0-customer@example.test'),
  );
  if (captured) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!captured) throw new Error('Mailpit did not capture the fictitious @example.test SMTP message.');
console.log('PASS local SMTP: fictitious @example.test message captured by Mailpit HTTP API.');
await verifyUnavailableDatabase();
} finally {
  await stopBackend(managedBackend);
}
