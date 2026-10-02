import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendEntrypoint = fileURLToPath(new URL('../backend/dist/main.js', import.meta.url));
const ngEntrypoint = fileURLToPath(new URL('../frontend/node_modules/@angular/cli/bin/ng.js', import.meta.url));
const frontendDirectory = fileURLToPath(new URL('../frontend/', import.meta.url));
const backendPort = 3000;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const databaseUrl = 'postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public';
const maxStderrBytes = 64 * 1024;

export function angularServeArguments(port) {
  return ['serve', '--host', '127.0.0.1', '--port', String(port), '--proxy-config', 'proxy.conf.json'];
}

function sanitizeDiagnostic(text) {
  return text
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s"'`]+/gi, '[redacted-url]')
    .replace(/\b(password|secret|token|credential|database_url|api_key)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .slice(-maxStderrBytes);
}

async function isPortAvailable(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    return true;
  } catch (error) {
    if (error?.code === 'EADDRINUSE') return false;
    throw error;
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
  }
}

async function findFrontendPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function start(entrypoint, args, cwd, env, { captureStderr = false } = {}) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd,
    env,
    stdio: captureStderr ? ['ignore', 'ignore', 'pipe'] : 'ignore',
  });
  let stderrBuffer = Buffer.alloc(0);
  child.stderr?.on('data', (chunk) => {
    const next = Buffer.concat([stderrBuffer, Buffer.from(chunk)]);
    stderrBuffer = next.subarray(Math.max(0, next.length - maxStderrBytes));
  });
  child.stderrDiagnostic = () => sanitizeDiagnostic(stderrBuffer.toString('utf8'));
  child.spawnError = undefined;
  child.on('error', (error) => {
    child.spawnError = error;
  });
  return child;
}

function startupError(child, label) {
  const diagnostic = child.stderrDiagnostic?.();
  const details = diagnostic ? `\nAngular CLI stderr (sanitized, max 64 KiB):\n${diagnostic}` : '';
  if (child.spawnError) return new Error(`${label} could not start: ${child.spawnError.message}${details}`);
  if (child.exitCode !== null) return new Error(`${label} exited before becoming ready (code ${child.exitCode}).${details}`);
  return undefined;
}

async function waitFor(child, url, label, accept) {
  let lastStatus;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const failed = startupError(child, label);
    if (failed) throw failed;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      lastStatus = response.status;
      if (accept(response)) return response;
    } catch {
      // A not-yet-listening child is expected during startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const diagnostic = child.stderrDiagnostic?.();
  const details = diagnostic ? `\nAngular CLI stderr (sanitized, max 64 KiB):\n${diagnostic}` : '';
  throw new Error(`${label} did not become ready within 30 seconds${lastStatus === undefined ? '.' : `; last HTTP status was ${lastStatus}.`}${details}`);
}

async function stopOwned(child, label) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
  ]);
  if (!exited) throw new Error(`Owned ${label} process did not stop after SIGTERM.`);
}

async function main() {
  let backend;
  let frontend;
  try {
    if (!(await isPortAvailable(backendPort))) {
      throw new Error('Loopback port 3000 is occupied; the documented /health proxy target is fixed at 127.0.0.1:3000. Smoke did not contact or stop the existing process.');
    }
    const frontendPort = await findFrontendPort();
    backend = start(backendEntrypoint, [], root, {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: databaseUrl,
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: String(backendPort),
    });
    await waitFor(backend, `${backendUrl}/health`, 'Owned backend', (response) => response.status === 200);
    console.log('PASS owned backend: PostgreSQL-backed GET /health returned HTTP 200.');

    frontend = start(ngEntrypoint, angularServeArguments(frontendPort), frontendDirectory, {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'development',
      NG_CLI_ANALYTICS: 'false',
      CI: 'true',
    }, { captureStderr: true });
    const pageResponse = await waitFor(frontend, `http://127.0.0.1:${frontendPort}/`, 'Owned Angular dev server', (response) => response.status === 200);
    const page = await pageResponse.text();
    if (!page.includes('<abar-root') || !page.includes('ABAR Electricidad')) {
      throw new Error('Angular dev server landing response did not include the application root and title.');
    }
    console.log(`PASS owned Angular dev server: landing page served on loopback port ${frontendPort}.`);

    const healthResponse = await fetch(`http://127.0.0.1:${frontendPort}/health`, { signal: AbortSignal.timeout(5000) });
    const health = await healthResponse.json();
    if (healthResponse.status !== 200 || health.status !== 'ok') {
      throw new Error('Angular same-origin /health proxy did not return the PostgreSQL-backed HealthOk contract.');
    }
    console.log('PASS frontend proxy: GET /health returned the real backend contract through the Angular dev server.');
  } finally {
    await Promise.all([
      stopOwned(frontend, 'Angular dev server'),
      stopOwned(backend, 'backend'),
    ]);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(sanitizeDiagnostic(message));
    process.exitCode = 1;
  });
}
