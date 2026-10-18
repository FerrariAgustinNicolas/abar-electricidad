#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { captureChild } from '../../backend/scripts/h1-real-e2e-runner.mjs';

export async function captureOperation(child, { timeout = 30000, maxOutput = 2_000_000, capture = captureChild } = {}) {
  const result = await capture(child, { totalBudgetMs: timeout + 3000, termGraceMs: 2000,
    finalDrainMs: 1000, maxOutputBytes: maxOutput });
  return { code: result.publicCheckExitStatus, signal: result.childSignal,
    stdout: result.stdout.toString('utf8'), stderr: result.stderr.toString('utf8'),
    log: JSON.stringify({ stdoutBytes: result.stdoutBytes, stderrBytes: result.stderrBytes,
      exitCode: result.publicCheckExitStatus, captureComplete: result.captureComplete, timedOut: result.timedOut }) + '\n' };
}
export function closeProxyBounded(server, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise(resolveClose => {
    let settled = false;
    const finish = closed => { if (!settled) { settled = true; clearTimer(timer); resolveClose(closed); } };
    const timer = setTimer(() => { server.unref?.(); finish(false); }, 2000);
    try { server.closeAllConnections?.(); server.close(() => finish(true)); }
    catch { finish(false); }
  });
}
export async function observeBrowserZoom(client, sample, pause = () => new Promise(resolvePause => setTimeout(resolvePause, 150))) {
  const key = async (key, code, virtualKey) => {
    for (const type of ['rawKeyDown', 'keyUp']) await client.call('Input.dispatchKeyEvent', {
      type, key, code, modifiers: 4, windowsVirtualKeyCode: virtualKey,
    });
    await pause();
  };
  await key('0', 'Digit0', 48);
  const before = await sample();
  for (let index = 0; index < 5; index++) await key('+', 'Equal', 187);
  const after = await sample();
  await key('0', 'Digit0', 48);
  const observed = [before.ratio, before.width, after.ratio, after.width, after.scale].every(Number.isFinite) &&
    Math.abs(after.ratio / before.ratio - 2) < 0.02 && Math.abs(before.width / after.width - 2) < 0.05 && Math.abs(after.scale - 1) < 0.02;
  return { method: 'target-bound Chrome keyboard zoom, verified against pixel ratio and layout width',
    observed, noOverflow: observed && after.layout <= after.client, before, after };
}

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend/dist/abar-frontend/browser');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOCKER = '/usr/local/bin/docker';
const PG_IMAGE = 'postgres:17.11-bookworm';
const PINNED_IMAGE_ID = 'sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652';
const ID = randomBytes(16).toString('hex');
const BROWSER_ONLY = process.argv.length === 3 && process.argv[2] === '--browser-only';
const LABEL_KEY = 'gentle-ai.h1-browser-run';
const EVIDENCE_ROOT = join(ROOT, 'odd/probes/h1-completion/browser');
const RUN_DIR = join(EVIDENCE_ROOT, `h1-browser-${ID}`);
const USER_DATA = join(RUN_DIR, 'chrome-profile');
const DOCKER_CONFIG = join(RUN_DIR, 'docker-config');
const DOCKER_CONTEXT = ['--config', DOCKER_CONFIG, '--host', 'unix:///Users/agustin/.docker/run/docker.sock'];
const UI_DIST = FRONTEND;
const scopes = Object.freeze([
  'browser.real-chrome', 'browser.real-api-postgres', 'browser.login-restore-logout', 'auth.safe-return',
  'auth.must-change-and-clearing', 'admin.create-edit-deactivate-reset', 'admin.version-conflict',
  'csrf.explicit-stale-retry', 'database.last-active-concurrency', 'responsive.360-768-1440', 'a11y.keyboard-focus', 'responsive.native-zoom-200',
]);
export const REQUIRED_SCOPES = scopes;

const fixed = (condition, message = 'invalid browser evidence') => { if (!condition) throw new Error(message); };
export function buildReport(runId, observations) {
  fixed(typeof runId === 'string' && /^[a-f0-9]{32}$/.test(runId));
  fixed(observations && Object.getPrototypeOf(observations) === Object.prototype);
  const keys = Reflect.ownKeys(observations);
  fixed(keys.length === REQUIRED_SCOPES.length && keys.every((key) => typeof key === 'string' && REQUIRED_SCOPES.includes(key)));
  fixed(REQUIRED_SCOPES.every((key) => observations[key] === true || observations[key] === false || observations[key] === 'SKIP'));
  const reportScopes = REQUIRED_SCOPES.map((name) => Object.freeze({ name, status: observations[name] === true ? 'PASS' : observations[name] === false ? 'FAIL' : 'SKIP' }));
  return Object.freeze({ version: 1, runId, passed: reportScopes.every(({ status }) => status === 'PASS'), scopes: Object.freeze(reportScopes) });
}

const evidence = { runId: ID, status: 'running', scopes: Object.fromEntries(REQUIRED_SCOPES.map((name) => [name, 'SKIP'])) };
const owned = { dockerConfig: false, volumeName: '', volumeId: '', networkName: '', networkId: '', containerName: '', containerId: '', imageId: '', passwordFile: false };
let chrome;
let backend;
let proxy;
let cdp;
let browserTarget;
let backendPort;
let uiPort;
let pgPort;
let appOrigin;
const secrets = Object.fromEntries(['bootstrap', 'migration', 'application', 'csrf', 'adminPassword', 'tempPassword', 'replacementPassword'].map((k) => [k, randomBytes(32).toString('base64url')]));
const adminEmail = `admin-${ID}@example.invalid`;
const secondEmail = `staff-${ID}@example.invalid`;
const evidenceStdout = [];
const evidenceStderr = [];
const browserApiStatuses = [];

async function saveEvidence() {
  const report = buildReport(ID, evidence.scopes);
  const clean = { version: 1, runId: ID, status: evidence.status, passed: report.passed, scopes: report.scopes,
    checkpoint: evidence.checkpoint ?? 'setup',
    environment: evidence.environment ?? {}, concurrency: evidence.concurrency ?? { status: 'NOT_RUN' }, zoom: evidence.zoom ?? { status: 'NOT_OBSERVED' },
    mode: BROWSER_ONLY ? 'browser-only' : 'concurrency-plus-browser', cleanup: evidence.cleanup ?? {} };
  await writeFile(join(RUN_DIR, 'report.json'), `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(RUN_DIR, 'stdout.log'), evidenceStdout.join(''), { mode: 0o600 });
  await writeFile(join(RUN_DIR, 'stderr.log'), evidenceStderr.join(''), { mode: 0o600 });
  return clean;
}

async function run(executable, args, { env = process.env, cwd = ROOT, timeout = 30000, input, maxOutput = 2_000_000 } = {}) {
  const child = spawn(executable, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  const pending = captureOperation(child, { timeout, maxOutput });
  if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  const { log, ...result } = await pending;
  evidenceStdout.push(log);
  return result;
}
async function docker(args, options = {}) {
  const result = await run(DOCKER, [...DOCKER_CONTEXT, ...args], options);
  fixed(result.code === 0, `docker command failed: ${args[0]}`);
  return result.stdout.trim();
}
function sqlLiteral(value) { return `'${value.replaceAll("'", "''")}'`; }
function quoteIdent(value) { fixed(/^[a-z][a-z0-9_]{0,62}$/.test(value)); return `"${value}"`; }
function dbUrl(user, password, databaseName = `h1_${ID}`) { return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${pgPort}/${databaseName}?schema=public`; }

async function listenPort() {
  const server = createNetServer();
  await new Promise((resolvePromise, reject) => server.listen(0, '127.0.0.1', resolvePromise).once('error', reject));
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}
const backendRequire = createRequire(join(BACKEND, 'package.json'));
async function makePgClient(config) { const pg = backendRequire('pg'); return new pg.Client(config); }
async function waitPg(user, password) {
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    const client = await makePgClient({ host: '127.0.0.1', port: pgPort, database: 'postgres', user, password, connectionTimeoutMillis: 750 });
    try { await client.connect(); return client; } catch { try { await client.end(); } catch {} await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error('owned PostgreSQL did not become ready');
}
async function ensureDockerAndPostgres() {
  await mkdir(RUN_DIR, { recursive: false, mode: 0o700 }); await chmod(RUN_DIR, 0o700);
  await mkdir(DOCKER_CONFIG, { mode: 0o700 }); owned.dockerConfig = true;
  await mkdir(USER_DATA, { mode: 0o700 });
  fixed(existsSync(CHROME) && existsSync(join(FRONTEND, 'index.html')) && existsSync(join(BACKEND, 'dist/main.js')));
  const version = await docker(['version', '--format', '{{.Server.Version}}']);
  fixed(version === '29.7.2');
  const imageId = await docker(['image', 'inspect', '--format', '{{.Id}}', PG_IMAGE]);
  fixed(imageId === PINNED_IMAGE_ID, 'pinned PostgreSQL image id mismatch'); owned.imageId = imageId;
  owned.containerName = `h1-browser-${ID}`; owned.volumeName = `h1-browser-data-${ID}`; owned.networkName = `h1-browser-net-${ID}`;
  await docker(['network', 'create', '--label', `${LABEL_KEY}=${ID}`, owned.networkName]);
  const network = JSON.parse(await docker(['network', 'inspect', owned.networkName]));
  fixed(network.length === 1 && network[0].Name === owned.networkName && network[0].Labels?.[LABEL_KEY] === ID && network[0].Internal === false);
  owned.networkId = network[0].Id;
  await docker(['volume', 'create', '--label', `${LABEL_KEY}=${ID}`, owned.volumeName]);
  const volume = JSON.parse(await docker(['volume', 'inspect', owned.volumeName]));
  fixed(volume.length === 1 && volume[0].Name === owned.volumeName && volume[0].Labels?.[LABEL_KEY] === ID);
  owned.volumeId = volume[0].Name;
  const passwordPath = join(RUN_DIR, 'bootstrap-password');
  await writeFile(passwordPath, secrets.bootstrap, { mode: 0o600 }); await chmod(passwordPath, 0o600); owned.passwordFile = true;
  pgPort = await listenPort();
  const started = await docker(['run', '-d', '--pull=never', '--name', owned.containerName, '--label', `${LABEL_KEY}=${ID}`,
    '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m,uid=999,gid=999', '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=16m,uid=999,gid=999',
    '--memory', '768m', '--cpus', '1.5', '--pids-limit', '128', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'FOWNER', '--cap-add', 'SETGID', '--cap-add', 'SETUID', '--cap-add', 'DAC_OVERRIDE', '--security-opt', 'no-new-privileges',
    '--network', owned.networkName, '-p', `127.0.0.1:${pgPort}:5432`, '-v', `${owned.volumeName}:/var/lib/postgresql/data`, '-v', `${passwordPath}:/run/secrets/h1-bootstrap:ro`,
    '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/h1-bootstrap', PG_IMAGE]);
  fixed(/^[a-f0-9]{64}$/.test(started));
  owned.containerId = started;
  const inspect = JSON.parse(await docker(['inspect', owned.containerId]));
  fixed(inspect.length === 1 && inspect[0].Id === owned.containerId && inspect[0].Name === `/${owned.containerName}` &&
    inspect[0].Config.Image === PG_IMAGE && inspect[0].Config.Labels?.[LABEL_KEY] === ID && inspect[0].State.Running &&
    inspect[0].Image === PINNED_IMAGE_ID && inspect[0].HostConfig.PortBindings['5432/tcp']?.length === 1 &&
    inspect[0].HostConfig.PortBindings['5432/tcp'][0].HostIp === '127.0.0.1' && Number(inspect[0].HostConfig.PortBindings['5432/tcp'][0].HostPort) === pgPort);
  const actualVolume = inspect[0].Mounts.find((mount) => mount.Name === owned.volumeName);
  const secretMount = inspect[0].Mounts.find((mount) => mount.Source.endsWith('/bootstrap-password'));
  fixed(actualVolume?.Destination === '/var/lib/postgresql/data' && actualVolume.RW === true &&
    secretMount?.Source.endsWith('/bootstrap-password') === true && secretMount.Destination === '/run/secrets/h1-bootstrap' && secretMount.RW === false &&
    inspect[0].NetworkSettings.Networks?.[owned.networkName]?.NetworkID === owned.networkId);
  const bootstrap = await waitPg('postgres', secrets.bootstrap);
  try {
    const dbName = `h1_${ID}`; const migrationRole = `h1_m_${ID}`; const appRole = `h1_a_${ID}`;
    await bootstrap.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    await bootstrap.query(`CREATE ROLE ${quoteIdent(migrationRole)} LOGIN PASSWORD ${sqlLiteral(secrets.migration)}`);
    await bootstrap.query(`CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD ${sqlLiteral(secrets.application)}`);
    const bootstrapDb = await makePgClient({ host: '127.0.0.1', port: pgPort, database: dbName, user: 'postgres', password: secrets.bootstrap });
    try {
      await bootstrapDb.connect();
      await bootstrapDb.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await bootstrapDb.query(`GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(migrationRole)}, ${quoteIdent(appRole)}`);
      await bootstrapDb.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdent(migrationRole)}`);
      await bootstrapDb.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(appRole)}`);
    } finally { await bootstrapDb.end(); }
    const migrate = await makePgClient({ host: '127.0.0.1', port: pgPort, database: dbName, user: migrationRole, password: secrets.migration });
    try {
      await migrate.connect();
      for (const migration of ['20261009000100_h1_admin_user', '20261009000200_h1_auth_context', '20261009000300_h1_admin_audit']) {
        await migrate.query(await readFile(join(BACKEND, 'prisma/migrations', migration, 'migration.sql'), 'utf8'));
      }
      await migrate.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdminUser", "AuthSession", "AuthPreAuthContext" TO ${quoteIdent(appRole)}`);
      await migrate.query(`GRANT SELECT, INSERT ON TABLE "AdminUserAudit" TO ${quoteIdent(appRole)}`);
    } finally { await migrate.end(); }
    const argon2 = backendRequire('argon2');
    const passwordHash = await argon2.hash(secrets.adminPassword.normalize('NFC'), { type: argon2.argon2id, version: 19, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 });
    const seed = await makePgClient({ host: '127.0.0.1', port: pgPort, database: dbName, user: migrationRole, password: secrets.migration });
    try {
      await seed.connect();
      await seed.query('INSERT INTO "AdminUser" ("id","name","email","passwordHash","active","mustChangePassword","version","updatedAt") VALUES ($1,$2,$3,$4,true,false,1,NOW())',
        [`00000000-0000-4000-8000-${ID.slice(0, 12)}`, 'Browser Synthetic Admin', adminEmail, passwordHash]);
    } finally { await seed.end(); }

    // The direct-service concurrency suite receives a second freshly created database, never the seeded browser database.
    const concurrencyDb = `h1_concurrency_${ID}`;
    if (BROWSER_ONLY) {
      evidence.concurrency = { status: 'SKIP', note: 'not rerun; see separately retained failing real-PostgreSQL run' };
    } else {
    await bootstrap.query(`CREATE DATABASE ${quoteIdent(concurrencyDb)}`);
    const concurrencyBootstrap = await makePgClient({ host: '127.0.0.1', port: pgPort, database: concurrencyDb, user: 'postgres', password: secrets.bootstrap });
    try {
      await concurrencyBootstrap.connect();
      await concurrencyBootstrap.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await concurrencyBootstrap.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdent(migrationRole)}`);
    } finally { await concurrencyBootstrap.end(); }
    const concurrencyMigration = await makePgClient({ host: '127.0.0.1', port: pgPort, database: concurrencyDb, user: migrationRole, password: secrets.migration });
    try {
      await concurrencyMigration.connect();
      for (const migration of ['20261009000100_h1_admin_user', '20261009000200_h1_auth_context', '20261009000300_h1_admin_audit']) {
        await concurrencyMigration.query(await readFile(join(BACKEND, 'prisma/migrations', migration, 'migration.sql'), 'utf8'));
      }
      fixed((await concurrencyMigration.query('SELECT count(*)::int AS count FROM "AdminUser"')).rows[0].count === 0);
    } finally { await concurrencyMigration.end(); }
    const concurrencyUrl = dbUrl('postgres', secrets.bootstrap, concurrencyDb);
    const commandArgs = ['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', 'test/admin-users-concurrency.e2e-spec.ts'];
    const testResult = await run(join(BACKEND, 'node_modules/.bin/jest'), commandArgs, { cwd: BACKEND, timeout: 120000,
      env: { PATH: process.env.PATH, HOME: RUN_DIR, NODE_ENV: 'test', H1_ADMIN_USERS_CONCURRENCY_DATABASE_URL: concurrencyUrl } });
    await writeFile(join(RUN_DIR, 'concurrency.stdout.txt'), JSON.stringify({ bytes: Buffer.byteLength(testResult.stdout), exitCode: testResult.code }) + '\n', { mode: 0o600 });
    await writeFile(join(RUN_DIR, 'concurrency.stderr.txt'), JSON.stringify({ bytes: Buffer.byteLength(testResult.stderr), exitCode: testResult.code }) + '\n', { mode: 0o600 });
    const testCount = `${testResult.stdout}\n${testResult.stderr}`.match(/Tests:\s+(\d+) passed, (\d+) total/);
    evidence.concurrency = { command: 'backend/node_modules/.bin/jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/admin-users-concurrency.e2e-spec.ts',
      exitCode: testResult.code, testsPassed: testCount ? Number(testCount[1]) : 0, testsTotal: testCount ? Number(testCount[2]) : 0,
      assertionKind: 'direct service + real PostgreSQL; not HTTP', isolatedEmptyDatabase: true };
    evidence.scopes['database.last-active-concurrency'] = testResult.code === 0 && testCount?.[1] === '1' && testCount?.[2] === '1';
    }
  } finally { await bootstrap.end(); }
  evidence.scopes['browser.real-api-postgres'] = true;
  return { dbName: `h1_${ID}`, appRole: `h1_a_${ID}`, concurrencyDb: `h1_concurrency_${ID}` };
}

async function startBackend(database, origin) {
  const selected = await listenPort();
  const child = spawn(process.execPath, ['dist/main.js'], { cwd: BACKEND, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: {
    PATH: process.env.PATH, HOME: RUN_DIR, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(selected),
    DATABASE_URL: dbUrl(database.appRole, secrets.application), AUTH_CSRF_ENCRYPTION_KEY: secrets.csrf,
    AUTH_ALLOWED_ORIGINS: origin, AUTH_COOKIE_SECURE: 'false',
  } });
  backend = child;
  child.stdout.on('data', (chunk) => evidenceStdout.push(`[backend] stdoutBytes=${chunk.length}\n`));
  child.stderr.on('data', (chunk) => evidenceStderr.push(`[backend] stderrBytes=${chunk.length}\n`));
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error('backend exited before ready');
    try {
      const response = await fetch(`http://127.0.0.1:${selected}/health`, { signal: AbortSignal.timeout(500) });
      if (response.status === 200) { backendPort = selected; return selected; }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('backend readiness timeout');
}

function startFrontend() {
  proxy = createServer((request, response) => {
    if (request.url?.startsWith('/api/')) {
      const upstream = httpRequest({ host: '127.0.0.1', port: backendPort, method: request.method, path: request.url, headers: { ...request.headers, host: `127.0.0.1:${backendPort}` } }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers); upstreamResponse.pipe(response);
      });
      upstream.on('error', () => { response.writeHead(502); response.end(); }); request.pipe(upstream); return;
    }
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const filePath = resolve(UI_DIST, `.${path === '/' ? '/index.html' : path}`);
    if (!filePath.startsWith(`${UI_DIST}/`) && filePath !== join(UI_DIST, 'index.html')) { response.writeHead(404); response.end(); return; }
    const candidate = extname(filePath) ? filePath : join(UI_DIST, 'index.html');
    readFile(candidate).then((body) => { const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(candidate)] ?? 'application/octet-stream'; response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); response.end(body); }).catch(() => { response.writeHead(404); response.end(); });
  });
  return new Promise((resolvePromise, reject) => proxy.listen(0, '127.0.0.1', () => { uiPort = proxy.address().port; appOrigin = `http://127.0.0.1:${uiPort}`; resolvePromise(appOrigin); }).once('error', reject));
}

async function startChrome() {
  const remotePort = await listenPort();
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--use-mock-keychain',
    '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-component-update', '--disable-domain-reliability',
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', '--disable-features=Translate,MediaRouter,Gcm',
    '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${remotePort}`, `--user-data-dir=${USER_DATA}`, 'about:blank'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: RUN_DIR, LANG: 'en_US.UTF-8' } });
  chrome.stdout.on('data', (chunk) => evidenceStdout.push(`[chrome] stdoutBytes=${chunk.length}\n`)); chrome.stderr.on('data', (chunk) => evidenceStderr.push(`[chrome] stderrBytes=${chunk.length}\n`));
  const until = Date.now() + 15000;
  while (Date.now() < until) { try { const targets = await (await fetch(`http://127.0.0.1:${remotePort}/json/list`)).json(); browserTarget = targets.find((target) => target.type === 'page'); if (browserTarget) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  fixed(browserTarget?.webSocketDebuggerUrl, 'Chrome DevTools did not become ready');
  cdp = await connectCdp(browserTarget.webSocketDebuggerUrl);
  await cdp.call('Network.enable');
  cdp.on('Network.responseReceived', (event) => {
    let url; try { url = new URL(event.response.url); } catch { return; }
    if (url.origin !== appOrigin || !url.pathname.startsWith('/api/')) return;
    const item = { path: url.pathname, status: event.response.status };
    browserApiStatuses.push(item);
    if (event.response.status >= 400) void cdp.call('Network.getResponseBody', { requestId: event.requestId }).then(({ body }) => {
      try { const parsed = JSON.parse(body); if (typeof parsed.code === 'string') item.code = parsed.code; } catch {}
    }).catch(() => {});
  });
  evidence.scopes['browser.real-chrome'] = true;
}
function connectCdp(url) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(url); const waiters = new Map(); const listeners = new Map(); let id = 0;
    ws.addEventListener('open', () => resolvePromise({ ws, call(method, params = {}) {
      const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((res, rej) => waiters.set(callId, { res, rej }));
    }, on(method, callback) { const list = listeners.get(method) ?? []; list.push(callback); listeners.set(method, list); return () => listeners.set(method, (listeners.get(method) ?? []).filter((item) => item !== callback)); }, close() { ws.close(); } }));
    ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (!msg.id) { for (const callback of listeners.get(msg.method) ?? []) callback(msg.params); return; } const waiter = waiters.get(msg.id); if (!waiter) return; waiters.delete(msg.id); msg.error ? waiter.rej(new Error('CDP command failed')) : waiter.res(msg.result); });
    ws.addEventListener('error', () => reject(new Error('CDP connection failed')));
  });
}
async function evaluate(expression, awaitPromise = true) {
  const result = await cdp.call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error('browser assertion failed');
  return result.result?.value;
}
async function waitFor(expression, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await evaluate(expression)) return true; await new Promise((r) => setTimeout(r, 80)); }
  throw new Error(`browser condition timed out: ${expression.slice(0, 60)}`);
}
async function setInput(selector, value) { await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`); }
async function click(selector) { const ok = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; e.click(); return true; })()`); fixed(ok, `missing browser control ${selector}`); }
async function clickText(text) { const ok = await evaluate(`(() => { const e=Array.from(document.querySelectorAll('button,summary')).find(x=>x.innerText.trim()===${JSON.stringify(text)} && !x.disabled && x.getClientRects().length); if(!e) return false; e.click(); return true; })()`); fixed(ok, `missing browser control text ${text}`); }
async function bodyText() { return evaluate('document.body.innerText'); }
async function navigate(path) { await cdp.call('Page.navigate', { url: `${appOrigin}${path}` }); await waitFor(`location.origin === ${JSON.stringify(appOrigin)} && document.readyState === 'complete'`); await new Promise((r) => setTimeout(r, 350)); }

async function snapshot() {
  const client = await makePgClient({ host: '127.0.0.1', port: pgPort, database: `h1_${ID}`, user: `h1_a_${ID}`, password: secrets.application });
  try { await client.connect(); const [users, sessions, preauth, audits] = await Promise.all([
    client.query('SELECT "id","name","email","active","mustChangePassword","version" FROM "AdminUser" ORDER BY "email"'),
    client.query('SELECT "id","adminUserId","revokedAt" FROM "AuthSession" ORDER BY "id"'),
    client.query('SELECT "id","expiresAt" FROM "AuthPreAuthContext" ORDER BY "id"'),
    client.query('SELECT "actorAdminUserId","targetAdminUserId","action","reason" FROM "AdminUserAudit" ORDER BY "createdAt"'),
  ]); return { users: users.rows, sessions: sessions.rows, preauth: preauth.rows, audits: audits.rows }; } finally { await client.end(); }
}

async function exerciseBrowser() {
  await startChrome();
  await navigate('/admin/usuarios');
  await waitFor(`location.pathname === '/admin/login'`);
  evidence.scopes['auth.safe-return'] = (new URL(await evaluate('location.href'))).searchParams.get('returnUrl') === '/admin/usuarios';
  // The guard denied the real protected route and retained the expected same-origin path.
  evidence.scopes['browser.login-restore-logout'] = false;
  await setInput('#email', adminEmail); await setInput('#password', secrets.adminPassword);
  await click('form button[type=submit]');
  try { await waitFor(`location.pathname === '/admin/usuarios'`); }
  catch { await new Promise((r) => setTimeout(r, 150)); const safeState = await evaluate(`({path:location.pathname, query:location.search, body:document.body.innerText})`); throw new Error(`login did not navigate: ${JSON.stringify({ ...safeState, api: browserApiStatuses.slice(-8) })}`); }
  await waitFor(`document.body.innerText.includes('Usuarios administradores')`);
  // This combined scope stays false until server-side logout is verified.
  evidence.checkpoint = 'session-storage';
  await waitFor(`document.querySelector('.user-email') !== null`);
  const cookieState = await evaluate(`({ storage: localStorage.length + sessionStorage.length, password: [...document.querySelectorAll('input[type=password]')].some(e=>e.value.length>0), visible: [...document.querySelectorAll('input[name^=name-]')].some(e=>e.value==='Browser Synthetic Admin') })`);
  fixed(cookieState.storage === 0 && !cookieState.password && cookieState.visible, 'session restoration/storage/password clearing invariant failed');
  await cdp.call('Page.reload', { ignoreCache: true }); await waitFor(`document.body.innerText.includes('Usuarios administradores')`);

  evidence.checkpoint = 'user-create';
  // Create a synthetic account only through the UI; never store submitted values in evidence.
  await click('summary');
  await setInput('[name=newName]', 'Browser Synthetic Staff'); await setInput('[name=newEmail]', secondEmail); await setInput('[name=newPassword]', secrets.tempPassword);
  await click('form button[type=submit]'); await waitFor(`document.body.innerText.includes(${JSON.stringify(secondEmail)})`);
  let db = await snapshot(); let staff = db.users.find((user) => user.email === secondEmail);
  fixed(staff?.active === true && staff.mustChangePassword === true && staff.version === 1);
  evidence.checkpoint = 'user-edit';
  await setInput(`[name="name-${staff.id}"]`, 'Browser Synthetic Edited'); await clickText('Guardar cambios');
  await waitFor(`document.querySelector('[name="name-${staff.id}"]')?.closest('tr')?.querySelector('small')?.innerText.trim() === 'Versión 2'`);
  db = await snapshot(); staff = db.users.find((user) => user.email === secondEmail);
  fixed(staff?.version === 2 && staff.name === 'Browser Synthetic Edited');

  evidence.checkpoint = 'version-conflict';
  // A real stale optimistic version returns 409 and leaves the user's row unchanged.
  const csrf = await evaluate(`(async()=>{const r=await fetch('/api/v1/auth/me',{credentials:'include'});return r.headers.get('x-csrf-token')})()`);
  const staleVersionStatus = await evaluate(`(async()=>{const u=${JSON.stringify(staff)};return (await fetch('/api/v1/admin/users/'+u.id,{method:'PATCH',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':${JSON.stringify(csrf)}},body:JSON.stringify({name:'stale version write',expectedVersion:1})})).status})()`);
  db = await snapshot();
  fixed(staleVersionStatus === 409 && db.users.find((user) => user.email === secondEmail)?.name === 'Browser Synthetic Edited' &&
    db.users.find((user) => user.email === secondEmail)?.version === 2, 'stale-version write unexpectedly changed DB');
  evidence.scopes['admin.version-conflict'] = true;

  evidence.checkpoint = 'csrf-retry';
  // Intercept exactly one UI-generated PATCH and replace its nonce. The rejected request is not replayed.
  await setInput(`[name="name-${staff.id}"]`, 'Browser Synthetic Final');
  const beforeStale = JSON.stringify(await snapshot()); let intercepted = 0;
  await cdp.call('Fetch.enable', { patterns: [{ urlPattern: `${appOrigin}/api/v1/admin/users/*`, requestStage: 'Request' }] });
  const unlisten = cdp.on('Fetch.requestPaused', async (event) => {
    if (event.request.method !== 'PATCH') { await cdp.call('Fetch.continueRequest', { requestId: event.requestId }); return; }
    intercepted++;
    const headers = Object.entries(event.request.headers).filter(([name]) => name.toLowerCase() !== 'x-csrf-token').map(([name, value]) => ({ name, value: String(value) }));
    headers.push({ name: 'X-CSRF-Token', value: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    await cdp.call('Fetch.continueRequest', { requestId: event.requestId, headers });
  });
  await clickText('Guardar cambios'); await waitFor(`document.body.innerText.includes('No se repitió la acción')`);
  unlisten(); await cdp.call('Fetch.disable');
  const afterStale = JSON.stringify(await snapshot());
  fixed(intercepted === 1 && beforeStale === afterStale, 'stale-CSRF UI request was replayed or changed DB');
  await clickText('Actualizar sesión para un nuevo intento');
  await waitFor(`document.body.innerText.includes('Sesión actualizada')`);
  await clickText('Guardar cambios');
  await waitFor(`document.querySelector('[name="name-${staff.id}"]')?.closest('tr')?.querySelector('small')?.innerText.trim() === 'Versión 3'`);
  db = await snapshot();
  fixed(db.users.find((user) => user.email === secondEmail)?.version === 3 && db.users.find((user) => user.email === secondEmail)?.name === 'Browser Synthetic Final');
  evidence.scopes['csrf.explicit-stale-retry'] = true;

  evidence.checkpoint = 'must-change';
  // Password-change gate, password-field clearing, user reset and status mutations are exercised through browser navigation/UI.
  await click('button.button-light'); await waitFor(`location.pathname === '/admin/login'`);
  await setInput('#email', secondEmail); await setInput('#password', secrets.tempPassword); await click('form button[type=submit]');
  await waitFor(`location.pathname === '/admin/change-password'`);
  const restricted = await evaluate(`(async()=>{const r=await fetch('/api/v1/admin/users',{credentials:'include'});return r.status})()`);
  fixed(restricted === 403);
  evidence.scopes['auth.must-change-and-clearing'] = (await evaluate(`[...document.querySelectorAll('input[type=password]')].every(e=>e.value==='')`)) === true;
  await setInput('#current-password', secrets.tempPassword); await setInput('#new-password', secrets.replacementPassword);
  await setInput('#confirm-password', secrets.replacementPassword);
  await click('form button[type=submit]'); await waitFor(`location.pathname === '/admin/usuarios'`);
  fixed((await evaluate(`[...document.querySelectorAll('input[type=password]')].every(e=>e.value==='')`)) === true);
  await cdp.call('Page.reload', { ignoreCache: true }); await waitFor(`document.body.innerText.includes('Usuarios administradores')`);
  await click('button.button-light'); await waitFor(`location.pathname === '/admin/login'`);
  await setInput('#email', adminEmail); await setInput('#password', secrets.adminPassword); await click('form button[type=submit]');
  await waitFor(`location.pathname === '/admin/usuarios'`);
  db = await snapshot(); staff = db.users.find((user) => user.email === secondEmail);
  fixed(staff?.active === true);
  await evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(e=>e.innerText.includes(${JSON.stringify(secondEmail)})); row?.querySelector('details.reset-panel summary')?.click(); return !!row; })()`);
  await setInput(`#reset-password-${staff.id}`, secrets.replacementPassword);
  await setInput(`#reset-reason-${staff.id}`, 'browser real probe controlled reset');
  evidence.checkpoint = 'password-reset';
  await clickText('Restablecer');
  await waitFor(`document.querySelector('[name="name-${staff.id}"]')?.closest('tr')?.querySelector('small')?.innerText.trim() === 'Versión 5'`);
  db = await snapshot(); staff = db.users.find((user) => user.email === secondEmail);
  fixed(staff?.mustChangePassword === true && staff.version === 5 && db.audits.some((audit) => audit.reason === 'browser real probe controlled reset'));
  const rowStatus = await evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(e=>e.innerText.includes(${JSON.stringify(secondEmail)})); const button = row && [...row.querySelectorAll('button')].find(e=>e.innerText.trim()==='Desactivar'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  fixed(rowStatus);
  await waitFor(`document.querySelector('[name="name-${staff.id}"]')?.closest('tr')?.querySelector('small')?.innerText.trim() === 'Versión 6'`);
  db = await snapshot(); staff = db.users.find((user) => user.email === secondEmail);
  fixed(staff?.active === false && db.audits.length >= 2);

  // Responsive emulation and keyboard focus are separate from observed browser zoom.
  const dimensions = [];
  for (const width of [360, 768, 1440]) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 150));
    dimensions.push(await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth})`));
  }
  evidence.scopes['responsive.360-768-1440'] = dimensions.length === 3 && dimensions.every((item) => item.width === item.scroll && item.width === item.body);
  await cdp.call('Emulation.clearDeviceMetricsOverride');
  await cdp.call('Page.navigate', { url: `${appOrigin}/admin/usuarios` }); await waitFor(`location.pathname === '/admin/usuarios' && document.body.innerText.includes('Usuarios administradores')`);
  await evaluate(`document.activeElement.blur()`); await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  const focus = await evaluate(`({tag:document.activeElement.tagName,id:document.activeElement.id,visible:!!document.activeElement.getClientRects().length,outline:getComputedStyle(document.activeElement).outlineStyle})`);
  evidence.scopes['a11y.keyboard-focus'] = focus.visible && (focus.tag === 'A' || focus.tag === 'INPUT') && focus.outline !== 'none';
  evidence.zoom = await observeBrowserZoom(cdp, () => evaluate(`({ratio:devicePixelRatio,width:innerWidth,scale:visualViewport.scale,layout:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})`));
  evidence.scopes['responsive.native-zoom-200'] = evidence.zoom.observed ? evidence.zoom.noOverflow : 'SKIP';

  evidence.checkpoint = 'logout';
  // UI logout and public server-side revocation.
  await waitFor(`location.pathname === '/admin/usuarios'`);
  await click('button.button-light'); await waitFor(`location.pathname === '/admin/login'`);
  const unauth = await evaluate(`(async()=>{const r=await fetch('/api/v1/admin/users',{credentials:'include'});return r.status})()`);
  fixed(unauth === 401);
  evidence.scopes['admin.create-edit-deactivate-reset'] = true;
  evidence.scopes['browser.login-restore-logout'] = unauth === 401;
}

async function cleanup() {
  const result = { containerRemoved: false, volumeRemoved: false, dockerConfigRemoved: false, chromeProfileRetained: true, uncertainty: false };
  if (chrome && chrome.exitCode === null) { chrome.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
  if (backend && backend.exitCode === null) { backend.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); if (backend.exitCode === null) backend.kill('SIGKILL'); }
  if (proxy?.listening && !await closeProxyBounded(proxy)) result.uncertainty = true;
  cdp?.close();
  if (owned.containerId) {
    try {
      const inspect = JSON.parse(await docker(['inspect', owned.containerId]));
      fixed(inspect.length === 1 && inspect[0].Id === owned.containerId && inspect[0].Config.Labels?.[LABEL_KEY] === ID && inspect[0].Image === owned.imageId);
      await docker(['rm', '-f', owned.containerId]); result.containerRemoved = true;
    } catch { result.uncertainty = true; }
  }
  if (owned.volumeName && !result.uncertainty) {
    try {
      const volume = JSON.parse(await docker(['volume', 'inspect', owned.volumeName]));
      fixed(volume.length === 1 && volume[0].Name === owned.volumeId && volume[0].Labels?.[LABEL_KEY] === ID);
      await docker(['volume', 'rm', owned.volumeName]); result.volumeRemoved = true;
    } catch { result.uncertainty = true; }
  }
  if (owned.networkName && result.containerRemoved && !result.uncertainty) {
    try {
      const network = JSON.parse(await docker(['network', 'inspect', owned.networkName]));
      fixed(network.length === 1 && network[0].Id === owned.networkId && network[0].Labels?.[LABEL_KEY] === ID && network[0].Internal === false);
      await docker(['network', 'rm', owned.networkName]); result.networkRemoved = true;
    } catch { result.uncertainty = true; }
  }
  if (result.containerRemoved && result.volumeRemoved && result.networkRemoved) {
    result.dockerConfigRemoved = false; // Retain only nonsecret configuration and evidence.
    if (owned.passwordFile) {
      try { await unlink(join(RUN_DIR, 'bootstrap-password')); result.passwordFileRemoved = true; }
      catch { result.uncertainty = true; }
    }
  }
  evidence.cleanup = result;
}

async function main() {
  await mkdir(EVIDENCE_ROOT, { recursive: true }); await chmod(EVIDENCE_ROOT, 0o700);
  try {
    const database = await ensureDockerAndPostgres();
    // Reserve a UI origin first so AUTH_ALLOWED_ORIGINS is exact and same-origin; backend starts only after DB setup.
    await startFrontend();
    backendPort = await startBackend(database, appOrigin);
    // startBackend starts the process using the selected appOrigin and returns its private loopback port.
    evidence.environment = { chrome: 'local-headless-chrome', node: process.version, dockerServer: '29.7.2', postgresImageId: owned.imageId,
      database: 'fresh-owned-postgresql', migrationMethod: 'direct SQL application of the three checked-in migration.sql files as a non-superuser migration role',
      uiOrigin: '127.0.0.1 loopback', nativeZoomMethod: 'Chrome keyboard zoom with observed pixel-ratio/layout checks; not OS desktop scaling' };
    await exerciseBrowser();
    evidence.status = Object.values(evidence.scopes).every((value) => value === true) ? 'PASS' : Object.values(evidence.scopes).some((value) => value === false) ? 'FAIL' : 'PARTIAL';
  } catch (error) {
    evidence.status = 'FAIL';
    evidenceStderr.push('[probe] PROBE_FAILED\n');
  } finally {
    await cleanup();
    const report = await saveEvidence();
    process.stdout.write(`${JSON.stringify({ runId: ID, status: evidence.status, passed: report.passed, scopes: report.scopes, evidenceDirectory: RUN_DIR, cleanup: evidence.cleanup })}\n`);
    if (!report.passed || evidence.cleanup?.uncertainty || !evidence.cleanup?.containerRemoved || !evidence.cleanup?.volumeRemoved) process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
