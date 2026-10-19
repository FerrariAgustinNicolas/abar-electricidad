import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PRODUCT_CHECKS, runAdminProductE2E } from './h1-product-e2e.mjs';

const CHECK_NAMES = Object.freeze([
  'migration.scope', 'roles.scope', 'seed.argon2', 'http.csrf', 'http.login.first',
  'http.login.second', 'http.reject.noop', 'http.rollback.atomic', 'http.changePassword',
  'database.password.version', 'database.session.rotation', 'database.oldSessionRevocation',
  'database.expirations.preserved', 'http.oldPassword.rejected', 'http.newPassword.accepted',
]);
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN43 = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_MIN = 15;
const TABLES = Object.freeze(['AdminUser', 'AuthSession', 'AuthPreAuthContext', 'AdminUserAudit']);
const columns = Object.freeze({
  AdminUser: '"id","name","email","passwordHash","active","mustChangePassword","version","createdAt","updatedAt"',
  AuthSession: '"id","adminUserId","nonceCiphertext","nonceIv","nonceTag","nonceVersion","createdAt","lastActivityAt","absoluteExpiresAt","idleExpiresAt","revokedAt"',
  AuthPreAuthContext: '"id","nonceCiphertext","nonceIv","nonceTag","nonceVersion","createdAt","expiresAt"',
  AdminUserAudit: '"id","actorAdminUserId","targetAdminUserId","action","reason","createdAt"',
});
const checksTemplate = () => Object.fromEntries(CHECK_NAMES.map(name => [name, false]));
const fail = () => { throw new Error('H1 real E2E fixture rejected input or observed a failed check'); };

function exactObject(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function canonicalKey(value) {
  if (typeof value !== 'string' || !TOKEN43.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}
export function validatePayload(value) {
  const rootKeys = ['version', 'runId', 'deadlineAt', 'database', 'secrets'];
  if (!exactObject(value, rootKeys) || value.version !== 1 || typeof value.runId !== 'string' || !/^[0-9a-f]{32}$/.test(value.runId) ||
      !Number.isSafeInteger(value.deadlineAt) || value.deadlineAt <= Date.now()) fail();
  const id = value.runId;
  const dbKeys = ['host', 'port', 'name', 'bootstrapRole', 'migrationRole', 'applicationRole', 'observerRole'];
  if (!exactObject(value.database, dbKeys) || value.database.host !== `h1-pg-${id}` || value.database.port !== 5432 ||
      value.database.name !== `h1_db_${id}` || value.database.bootstrapRole !== `h1_bootstrap_${id}` ||
      value.database.migrationRole !== `h1_migration_${id}` || value.database.applicationRole !== `h1_app_${id}` ||
      value.database.observerRole !== `h1_observer_${id}` || Object.entries(value.database).some(([key, v]) => key !== 'host' && typeof v === 'string' && !IDENTIFIER.test(v))) fail();
  const secretKeys = ['bootstrapPassword', 'migrationPassword', 'applicationPassword', 'observerPassword', 'csrfKey', 'currentPassword', 'newPassword'];
  const passwordSecrets = ['bootstrapPassword', 'migrationPassword', 'applicationPassword', 'observerPassword', 'currentPassword', 'newPassword'];
  if (!exactObject(value.secrets, secretKeys) || passwordSecrets.some(key => typeof value.secrets[key] !== 'string' || !HEX64.test(value.secrets[key])) ||
      new Set(passwordSecrets.map(key => value.secrets[key])).size !== passwordSecrets.length || !canonicalKey(value.secrets.csrfKey) ||
      [...value.secrets.newPassword].length < PASSWORD_MIN || [...value.secrets.newPassword].length > 128) fail();
  return value;
}

function encode(value) { return encodeURIComponent(value); }
export function validateMigrationTarget(runId, connectionString) {
  if (typeof runId !== 'string' || !/^[0-9a-f]{32}$/.test(runId) || typeof connectionString !== 'string') fail();
  let url;
  try { url = new URL(connectionString); } catch { fail(); }
  const role = `h1_migration_${runId}`;
  const password = url.password;
  const expected = `postgresql://${role}:${password}@h1-pg-${runId}:5432/h1_db_${runId}?schema=public`;
  if (url.protocol !== 'postgresql:' || url.hostname !== `h1-pg-${runId}` || url.port !== '5432' ||
      url.pathname !== `/h1_db_${runId}` || url.username !== role || !HEX64.test(password) ||
      url.search !== '?schema=public' || url.hash !== '' || connectionString !== expected) fail();
  return connectionString;
}

export function validateDatabaseUrl(value, payload, principal) {
  validatePayload(payload);
  const fields = {
    bootstrapRole: ['bootstrapRole', 'bootstrapPassword'], migrationRole: ['migrationRole', 'migrationPassword'],
    applicationRole: ['applicationRole', 'applicationPassword'], observerRole: ['observerRole', 'observerPassword'],
  }[principal];
  if (!fields || typeof value !== 'string') fail();
  const expected = `postgresql://${encode(payload.database[fields[0]])}:${encode(payload.secrets[fields[1]])}@${payload.database.host}:5432/${payload.database.name}?schema=public`;
  if (value !== expected) fail();
  if (principal === 'migrationRole') return validateMigrationTarget(payload.runId, value);
  let url;
  try { url = new URL(value); } catch { fail(); }
  if (url.protocol !== 'postgresql:' || url.hostname !== payload.database.host || url.port !== '5432' ||
      url.pathname !== `/${payload.database.name}` || url.username !== payload.database[fields[0]] ||
      url.password !== payload.secrets[fields[1]] || url.search !== '?schema=public' || url.hash || url.username.includes('@')) fail();
  return value;
}

export function safeResult(runId, checks) {
  if (!/^[0-9a-f]{32}$/.test(runId) || !Array.isArray(checks) || checks.length !== CHECK_NAMES.length ||
      checks.some((item, index) => !exactObject(item, ['name', 'passed']) || item.name !== CHECK_NAMES[index] || typeof item.passed !== 'boolean')) fail();
  return Object.freeze({ version: 1, runId, checks: Object.freeze(checks.map(item => Object.freeze({ name: item.name, passed: item.passed }))),
    passed: checks.every(item => item.passed) });
}

export function compareSnapshots(before, after) {
  for (const snapshot of [before, after]) {
    if (!exactObject(snapshot, ['users', 'sessions', 'preauth', 'audits']) ||
        !Array.isArray(snapshot.users) || !Array.isArray(snapshot.sessions) || !Array.isArray(snapshot.preauth) || !Array.isArray(snapshot.audits)) fail();
  }
  return isDeepStrictEqual(before, after);
}

export function inspectCarrier(response, previousCookie) {
  const getCookies = () => typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie() : [response.headers.get('set-cookie') ?? ''];
  const cookies = getCookies();
  const carrier = cookies.find(cookie => cookie.startsWith('abar_admin_session=')) ?? '';
  const token = carrier.match(/^abar_admin_session=([A-Za-z0-9_-]{43});/i)?.[1] ?? '';
  const csrf = response.headers.get('x-csrf-token') ?? '';
  return Object.freeze({ status204: response.status === 204, noStore: response.headers.get('cache-control') === 'no-store',
    emptyBody: response.body === '', rotatedSessionCookie: canonicalKey(token) && token !== previousCookie &&
      carrier.includes('Path=/api/v1;') && carrier.includes('HttpOnly') && carrier.includes('SameSite=Lax') &&
      /; Max-Age=[1-9][0-9]*(?:;|$)/.test(carrier) && !carrier.includes('Secure'),
    csrfRotated: canonicalKey(csrf) });
}

function deadline(payload) {
  if (Date.now() >= payload.deadlineAt) fail();
}
function assertCheck(checks, name, condition) {
  if (!Object.hasOwn(checks, name) || typeof condition !== 'boolean' || !condition) fail();
  checks[name] = true;
}
function sqlIdentifier(value) {
  if (!IDENTIFIER.test(value) && !TABLES.includes(value)) fail();
  return `"${value}"`;
}
function sqlLiteral(value) {
  if (!HEX64.test(value)) fail();
  return `'${value}'`;
}
function connectionUrl(payload, principal) {
  const roleKey = `${principal}Role`;
  const secretKey = `${principal}Password`;
  return `postgresql://${payload.database[roleKey]}:${payload.secrets[secretKey]}@${payload.database.host}:5432/${payload.database.name}?schema=public`;
}
function cookiePair(setCookie, name) {
  const entry = setCookie.find(value => value.startsWith(`${name}=`));
  return entry ? entry.split(';', 1)[0] : '';
}
function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

const PG_ERROR_CATEGORIES = new Set(['DNS_FAILURE', 'CONNECTION_REFUSED', 'CONNECTION_TIMEOUT', 'AUTH_REJECTED', 'DATABASE_MISSING', 'SERVER_NOT_READY', 'UNKNOWN']);
function postgresErrorCategory(error) {
  let code;
  try { code = error !== null && (typeof error === 'object' || typeof error === 'function') ? error.code : undefined; } catch { return 'UNKNOWN'; }
  if (typeof code !== 'string') return 'UNKNOWN';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS_FAILURE';
  if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  if (code === 'ETIMEDOUT') return 'CONNECTION_TIMEOUT';
  if (code === '28P01' || code === '28000') return 'AUTH_REJECTED';
  if (code === '3D000') return 'DATABASE_MISSING';
  if (code === '57P03') return 'SERVER_NOT_READY';
  return 'UNKNOWN';
}
export async function waitForPostgres(Client, payload, onStage = () => {}) {
  const emittedCategories = new Set();
  let last;
  while (Date.now() < payload.deadlineAt) {
    deadline(payload);
    const client = new Client({ host: payload.database.host, port: payload.database.port, database: payload.database.name,
      user: payload.database.bootstrapRole, password: payload.secrets.bootstrapPassword, connectionTimeoutMillis: 750,
      query_timeout: Math.max(1, payload.deadlineAt - Date.now()), application_name: `h1-${payload.runId}` });
    try { await client.connect(); return client; }
    catch (error) {
      last = true;
      const category = postgresErrorCategory(error);
      if (!emittedCategories.has(category)) {
        emittedCategories.add(category);
        try { onStage(category); } catch { /* Observation cannot change readiness behavior. */ }
      }
      try { await client.end(); } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(200, Math.max(1, payload.deadlineAt - Date.now()))));
  }
  void last; fail();
}
async function runChild(executable, args, options) {
  const { spawn } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ['ignore', 'ignore', 'ignore'], shell: false });
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('H1 migration deadline')); }, Math.max(1, options.timeout));
    child.once('error', () => { clearTimeout(timeout); reject(new Error('H1 migration unavailable')); });
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('H1 migration failed')); });
  });
}
export async function seedAdmin(Client, payload, argon2) {
  const migration = new Client({ connectionString: validateDatabaseUrl(connectionUrl(payload, 'migration'), payload, 'migrationRole'),
    connectionTimeoutMillis: 1000, query_timeout: Math.max(1, payload.deadlineAt - Date.now()) });
  try {
    await migration.connect();
    const passwordHash = await argon2.hash(payload.secrets.currentPassword, { type: argon2.argon2id, version: 19, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 });
    if (typeof passwordHash !== 'string' || !/^\$argon2id\$v=19\$m=19456,(?:t=2,p=1|p=1,t=2)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.test(passwordHash)) fail();
    await migration.query('INSERT INTO "AdminUser" ("id","name","email","passwordHash","active","mustChangePassword","version","updatedAt") VALUES ($1,$2,$3,$4,true,true,1,CURRENT_TIMESTAMP)',
      [`00000000-0000-4000-8000-${payload.runId.slice(0, 12)}`, 'H1 Fixture Admin', 'h1-admin@example.invalid', passwordHash]);
  } finally { await migration.end(); }
}
async function grantRoles(client, payload) {
  const d = payload.database;
  const migration = sqlIdentifier(d.migrationRole);
  const application = sqlIdentifier(d.applicationRole), observer = sqlIdentifier(d.observerRole);
  for (const role of [d.migrationRole, d.applicationRole, d.observerRole]) {
    const password = payload.secrets[`${role === d.migrationRole ? 'migration' : role === d.applicationRole ? 'application' : 'observer'}Password`];
    await client.query(`CREATE ROLE ${sqlIdentifier(role)} LOGIN PASSWORD ${sqlLiteral(password)}`);
  }
  await client.query(`GRANT CONNECT ON DATABASE ${sqlIdentifier(d.name)} TO ${migration}, ${application}, ${observer}`);
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${migration}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${application}, ${observer}`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${application}, ${observer}`);
}
async function grantRuntimeAccess(Client, payload) {
  const client = new Client({ connectionString: validateDatabaseUrl(connectionUrl(payload, 'migration'), payload, 'migrationRole'),
    connectionTimeoutMillis: 1000, query_timeout: Math.max(1, payload.deadlineAt - Date.now()) });
  const application = sqlIdentifier(payload.database.applicationRole);
  const observer = sqlIdentifier(payload.database.observerRole);
  try {
    await client.connect();
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdminUser", "AuthSession", "AuthPreAuthContext" TO ${application}`);
    await client.query(`GRANT SELECT, INSERT ON TABLE "AdminUserAudit" TO ${application}`);
    await client.query(`GRANT SELECT ON TABLE "AdminUser", "AuthSession", "AuthPreAuthContext", "AdminUserAudit" TO ${observer}`);
  } finally { await client.end(); }
}

function emitStage(onStage, stage, phase, errorClass, pgErrorCategory) {
  try {
    if (pgErrorCategory !== undefined) {
      if (stage !== 'postgres_ready' || phase !== 'error' || errorClass !== 'RUNTIME_ERROR' || !PG_ERROR_CATEGORIES.has(pgErrorCategory)) return;
      onStage(stage, phase, errorClass, pgErrorCategory);
    } else if (errorClass === undefined) onStage(stage, phase);
    else onStage(stage, phase, errorClass);
  } catch { /* Diagnostics must not change fixture behavior. */ }
}
async function observeStage(onStage, stage, operation, acceptsPgCategory = false) {
  emitStage(onStage, stage, 'start');
  let pgErrorCategory;
  try {
    const result = await (acceptsPgCategory ? operation(category => {
      pgErrorCategory = category;
      emitStage(onStage, stage, 'error', 'RUNTIME_ERROR', category);
    }) : operation());
    emitStage(onStage, stage, 'end');
    return result;
  } catch (error) {
    if (pgErrorCategory === undefined) emitStage(onStage, stage, 'error', 'RUNTIME_ERROR');
    throw error;
  }
}

export async function prepareRunDatabase({ payload, waitForPostgres, grantRoles, migrate, grantRuntimeAccess, seedAdmin, startApplication, onStage = () => {} }) {
  const bootstrap = await observeStage(onStage, 'postgres_ready', waitForPostgres, true);
  try {
    await observeStage(onStage, 'roles', () => observeStage(onStage, 'check.roles.scope', () => grantRoles(bootstrap, payload)));
  } finally {
    await bootstrap.end();
  }
  await observeStage(onStage, 'migrate', () => observeStage(onStage, 'check.migration.scope', migrate));
  await observeStage(onStage, 'runtime_grants', grantRuntimeAccess);
  await observeStage(onStage, 'seed', () => observeStage(onStage, 'check.seed.argon2', seedAdmin));
  return observeStage(onStage, 'application_start', startApplication);
}

async function observerSnapshot(client) {
  const result = {};
  for (const table of TABLES) {
    const rows = await client.query(`SELECT ${columns[table]} FROM ${sqlIdentifier(table)} ORDER BY 1`);
    result[table === 'AdminUser' ? 'users' : table === 'AuthSession' ? 'sessions' : table === 'AuthPreAuthContext' ? 'preauth' : 'audits'] = rows.rows.map(row => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) normalized[key] = Buffer.isBuffer(value) ? value.toString('hex') : value instanceof Date ? value.toISOString() : value;
      return normalized;
    });
  }
  return result;
}
async function makeRequest(path, { cookie = '', csrf = '', origin = 'http://127.0.0.1:3000', body, method = 'GET', deadlineAt } = {}) {
  if (deadlineAt !== undefined) deadline({ deadlineAt });
  const headers = { origin };
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const timeout = deadlineAt === undefined ? 5000 : Math.max(1, deadlineAt - Date.now());
  const response = await fetch(`http://127.0.0.1:3000/api/v1/auth/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text, cookies: typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') ?? ''] };
}
async function csrf(deadlineAt) {
  const response = await makeRequest('csrf', { deadlineAt });
  if (response.status !== 200 || response.headers.get('cache-control') !== 'no-store') fail();
  const data = JSON.parse(response.body);
  if (!canonicalKey(data.csrfToken)) fail();
  const cookie = cookiePair(response.cookies, 'abar_auth_context');
  if (!cookie) fail();
  return { csrfToken: data.csrfToken, cookie };
}
async function login(credentials, deadlineAt) {
  const response = await makeRequest('login', { method: 'POST', cookie: credentials.cookie, csrf: credentials.csrfToken, deadlineAt,
    body: { email: 'h1-admin@example.invalid', password: credentials.password } });
  if (response.status !== 200 || response.headers.get('cache-control') !== 'no-store') fail();
  const data = JSON.parse(response.body);
  const cookie = cookiePair(response.cookies, 'abar_admin_session');
  if (!cookie || data.admin?.mustChangePassword !== true) fail();
  return { cookie, csrfToken: response.headers.get('x-csrf-token'), adminId: data.admin.id };
}
async function setTrigger(migrationUrl, Client, enable, payload) {
  const client = new Client({ connectionString: migrationUrl, connectionTimeoutMillis: 1000,
    query_timeout: Math.max(1, payload.deadlineAt - Date.now()) });
  try {
    await client.connect();
    if (enable) {
      await client.query('CREATE FUNCTION h1_fixture_abort_session_insert() RETURNS trigger LANGUAGE plpgsql AS $h1$ BEGIN RAISE EXCEPTION \'h1 controlled rollback witness\'; END $h1$');
      await client.query('CREATE TRIGGER h1_fixture_rollback BEFORE INSERT ON "AuthSession" FOR EACH ROW EXECUTE FUNCTION h1_fixture_abort_session_insert()');
    } else {
      await client.query('DROP TRIGGER h1_fixture_rollback ON "AuthSession"');
      await client.query('DROP FUNCTION h1_fixture_abort_session_insert()');
    }
  } finally { await client.end(); }
}
async function closeByDeadline(work, deadlineAt) {
  const remaining = Math.max(0, deadlineAt - Date.now());
  let timer;
  try {
    await Promise.race([Promise.resolve().then(work), new Promise(resolve => { timer = setTimeout(resolve, remaining); timer.unref?.(); })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function checkPassword(Client, payload, argon2, expected) {
  const client = new Client({ connectionString: validateDatabaseUrl(connectionUrl(payload, 'observer'), payload, 'observerRole'),
    connectionTimeoutMillis: 1000, query_timeout: Math.max(1, payload.deadlineAt - Date.now()) });
  try {
    await client.connect();
    const result = await client.query('SELECT "passwordHash","version","mustChangePassword" FROM "AdminUser" WHERE "email"=$1', ['h1-admin@example.invalid']);
    if (result.rows.length !== 1 || typeof result.rows[0].passwordHash !== 'string') return false;
    const verified = await argon2.verify(result.rows[0].passwordHash, expected.password);
    return result.rows[0].version === expected.version && result.rows[0].mustChangePassword === expected.mustChangePassword &&
      verified === expected.matches;
  } finally { await client.end(); }
}

export async function runRealE2E(rawPayload, onStage = () => {}) {
  const payload = validatePayload(rawPayload);
  const checks = checksTemplate();
  let app;
  let observerClient;
  let server;
  const migrationUrl = validateDatabaseUrl(connectionUrl(payload, 'migration'), payload, 'migrationRole');
  const applicationUrl = validateDatabaseUrl(connectionUrl(payload, 'application'), payload, 'applicationRole');
  const observerUrl = validateDatabaseUrl(connectionUrl(payload, 'observer'), payload, 'observerRole');
  try {
    const { Client } = await import('pg');
    const argon2 = await import('argon2');
    const { NestFactory } = await import('@nestjs/core');
    const { configureApplication } = await import('../dist/configure-application.js');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const directory = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
    const configPath = resolve(directory, 'prisma.h1-e2e.config.ts');
    if (typeof process.env.PRISMA_SCHEMA_ENGINE_BINARY !== 'string' || process.env.PRISMA_SCHEMA_ENGINE_BINARY.length === 0) fail();
    await prepareRunDatabase({ payload, onStage,
      waitForPostgres: onCategory => waitForPostgres(Client, payload, onCategory),
      grantRoles,
      migrate: async () => runChild(process.execPath, [resolve(directory, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', configPath], {
        cwd: directory, timeout: Math.max(1, payload.deadlineAt - Date.now()), env: {
          PATH: process.env.PATH, HOME: '/tmp', NODE_ENV: 'test', PRISMA_SCHEMA_ENGINE_BINARY: process.env.PRISMA_SCHEMA_ENGINE_BINARY,
          H1_E2E_RUN_ID: payload.runId, H1_E2E_DATABASE_URL: migrationUrl,
        },
      }),
      grantRuntimeAccess: () => grantRuntimeAccess(Client, payload),
      seedAdmin: () => seedAdmin(Client, payload, argon2),
      startApplication: async () => {
        const previousEnvironment = new Map(Object.entries(process.env));
        for (const key of Object.keys(process.env)) delete process.env[key];
        process.env.DATABASE_URL = applicationUrl;
        process.env.AUTH_CSRF_ENCRYPTION_KEY = payload.secrets.csrfKey;
        process.env.NODE_ENV = 'test';
        process.env.HOST = '127.0.0.1';
        process.env.PORT = '3000';
        process.env.AUTH_ALLOWED_ORIGINS = 'http://127.0.0.1:3000';
        process.env.AUTH_COOKIE_SECURE = 'false';
        try {
          const { AppModule } = await import('../dist/app.module.js');
          app = await NestFactory.create(AppModule, { logger: false });
          configureApplication(app);
          await app.listen(3000, '127.0.0.1');
          server = app.getHttpServer();
        } finally {
          for (const key of Object.keys(process.env)) delete process.env[key];
          for (const [key, value] of previousEnvironment) process.env[key] = value;
        }
      },
    });
    assertCheck(checks, 'migration.scope', true);
    assertCheck(checks, 'roles.scope', true);
    assertCheck(checks, 'seed.argon2', true);

    observerClient = new Client({ connectionString: observerUrl, connectionTimeoutMillis: 1000,
      query_timeout: Math.max(1, payload.deadlineAt - Date.now()) }); await observerClient.connect();
    const baseline = await observerSnapshot(observerClient);

    emitStage(onStage, 'auth_checks', 'start');
    const firstCsrf = await observeStage(onStage, 'check.http.csrf', () => csrf(payload.deadlineAt)); assertCheck(checks, 'http.csrf', true);
    const first = await observeStage(onStage, 'check.http.login.first', () => login({ ...firstCsrf, password: payload.secrets.currentPassword }, payload.deadlineAt)); assertCheck(checks, 'http.login.first', true);
    const second = await observeStage(onStage, 'check.http.login.second', async () => {
      const secondCsrf = await csrf(payload.deadlineAt);
      return login({ ...secondCsrf, password: payload.secrets.currentPassword }, payload.deadlineAt);
    }); assertCheck(checks, 'http.login.second', true);
    if (first.adminId !== second.adminId || first.cookie === second.cookie) fail();

    const beforeReject = await observerSnapshot(observerClient);
    const rejected = await observeStage(onStage, 'check.http.reject.noop', () => makeRequest('change-password', { method: 'POST', cookie: second.cookie, csrf: 'A'.repeat(43), deadlineAt: payload.deadlineAt,
      body: { currentPassword: payload.secrets.currentPassword, newPassword: payload.secrets.newPassword } }));
    const afterReject = await observerSnapshot(observerClient);
    if (rejected.status === 204 || rejected.headers.get('cache-control') !== 'no-store' || !compareSnapshots(beforeReject, afterReject)) fail();
    const beforeWrongPassword = await observerSnapshot(observerClient);
    const wrongPassword = await makeRequest('change-password', { method: 'POST', cookie: second.cookie, csrf: second.csrfToken, deadlineAt: payload.deadlineAt,
      body: { currentPassword: payload.secrets.newPassword, newPassword: payload.secrets.newPassword } });
    const afterWrongPassword = await observerSnapshot(observerClient);
    if (wrongPassword.status === 204 || wrongPassword.headers.get('cache-control') !== 'no-store' ||
        !compareSnapshots(beforeWrongPassword, afterWrongPassword)) fail();
    assertCheck(checks, 'http.reject.noop', true);
    if (!baseline.users.length) fail();

    await setTrigger(migrationUrl, Client, true, payload);
    let rollback;
    let beforeRollback;
    let afterRollback;
    try {
      beforeRollback = await observerSnapshot(observerClient);
      rollback = await observeStage(onStage, 'check.http.rollback.atomic', () => makeRequest('change-password', { method: 'POST', cookie: second.cookie, csrf: second.csrfToken, deadlineAt: payload.deadlineAt,
        body: { currentPassword: payload.secrets.currentPassword, newPassword: payload.secrets.newPassword } }));
      afterRollback = await observerSnapshot(observerClient);
    } finally {
      await setTrigger(migrationUrl, Client, false, payload);
    }
    if (!rollback || rollback.status === 204 || !beforeRollback || !compareSnapshots(beforeRollback, afterRollback)) fail();
    assertCheck(checks, 'http.rollback.atomic', true);

    const beforeSuccess = await observerSnapshot(observerClient);
    const changed = await observeStage(onStage, 'check.http.changePassword', () => makeRequest('change-password', { method: 'POST', cookie: second.cookie, csrf: second.csrfToken, deadlineAt: payload.deadlineAt,
      body: { currentPassword: payload.secrets.currentPassword, newPassword: payload.secrets.newPassword } }));
    const carrier = inspectCarrier(changed, second.cookie.split('=', 2)[1]);
    if (!Object.values(carrier).every(Boolean)) fail();
    const rotated = cookiePair(changed.cookies, 'abar_admin_session');
    const newCsrf = changed.headers.get('x-csrf-token');
    if (!rotated || !newCsrf || newCsrf === second.csrfToken || rotated === second.cookie) fail();
    assertCheck(checks, 'http.changePassword', true);
    const afterSuccess = await observeStage(onStage, 'check.database.session.rotation', () => observerSnapshot(observerClient));
    const beforeUser = beforeSuccess.users.find(user => user.id === first.adminId);
    const afterUser = afterSuccess.users.find(user => user.id === first.adminId);
    if (!beforeUser || !afterUser || afterUser.version !== beforeUser.version + 1 || afterUser.mustChangePassword !== false ||
        afterUser.passwordHash === beforeUser.passwordHash || afterUser.createdAt !== beforeUser.createdAt || afterUser.updatedAt === beforeUser.updatedAt) fail();
    if (!await observeStage(onStage, 'check.database.password.version', () => checkPassword(Client, payload, argon2, { password: payload.secrets.newPassword, version: beforeUser.version + 1, mustChangePassword: false, matches: true }))) fail();
    assertCheck(checks, 'database.password.version', true);
    const oldSessions = beforeSuccess.sessions.filter(row => row.adminUserId === first.adminId);
    const finalSessions = afterSuccess.sessions.filter(row => row.adminUserId === first.adminId);
    const rotatedId = hash(rotated.split('=', 2)[1]);
    const newSession = finalSessions.find(row => row.id === rotatedId);
    if (oldSessions.length !== 2 || !newSession || newSession.revokedAt !== null) fail();
    assertCheck(checks, 'database.session.rotation', true);
    if (!oldSessions.every(old => {
      const current = finalSessions.find(row => row.id === old.id);
      return current !== undefined && current.revokedAt !== null;
    })) fail();
    assertCheck(checks, 'database.oldSessionRevocation', true);
    const retired = finalSessions.find(row => row.id === hash(second.cookie.split('=', 2)[1]));
    if (!retired || !newSession || retired.absoluteExpiresAt !== newSession.absoluteExpiresAt || retired.idleExpiresAt !== newSession.idleExpiresAt ||
        retired.createdAt !== newSession.createdAt || retired.lastActivityAt !== newSession.lastActivityAt ||
        !oldSessions.every(old => {
          const current = finalSessions.find(row => row.id === old.id);
          return current && current.createdAt === old.createdAt && current.lastActivityAt === old.lastActivityAt &&
            current.absoluteExpiresAt === old.absoluteExpiresAt && current.idleExpiresAt === old.idleExpiresAt;
        })) fail();
    assertCheck(checks, 'database.expirations.preserved', true);

    const oldPasswordCheck = await checkPassword(Client, payload, argon2, { password: payload.secrets.currentPassword, version: beforeUser.version + 1, mustChangePassword: false, matches: false });
    if (!oldPasswordCheck) fail();
    const oldLoginCsrf = await csrf(payload.deadlineAt);
    const beforeOldPasswordLogin = await observerSnapshot(observerClient);
    const oldLogin = await observeStage(onStage, 'check.http.oldPassword.rejected', () => makeRequest('login', { method: 'POST', cookie: oldLoginCsrf.cookie, csrf: oldLoginCsrf.csrfToken, deadlineAt: payload.deadlineAt,
      body: { email: 'h1-admin@example.invalid', password: payload.secrets.currentPassword } }));
    const afterOldPasswordLogin = await observerSnapshot(observerClient);
    if (!compareSnapshots(beforeOldPasswordLogin, afterOldPasswordLogin)) fail();
    const newLoginCsrf = await csrf(payload.deadlineAt);
    const newLogin = await observeStage(onStage, 'check.http.newPassword.accepted', () => makeRequest('login', { method: 'POST', cookie: newLoginCsrf.cookie, csrf: newLoginCsrf.csrfToken, deadlineAt: payload.deadlineAt,
      body: { email: 'h1-admin@example.invalid', password: payload.secrets.newPassword } }));
    emitStage(onStage, 'auth_checks', 'end');
    if (oldLogin.status === 200 || oldLogin.headers.get('cache-control') !== 'no-store' || newLogin.status !== 200) fail();
    assertCheck(checks, 'http.oldPassword.rejected', true);
    assertCheck(checks, 'http.newPassword.accepted', true);
    const baseResult = safeResult(payload.runId, CHECK_NAMES.map(name => ({ name, passed: checks[name] })));
    const product = await runAdminProductE2E({ onStage, baseUrl: 'http://127.0.0.1:3000', origin: 'http://127.0.0.1:3000', runId: payload.runId,
      actorId: newLogin.body ? JSON.parse(newLogin.body).admin.id : first.adminId,
      actorCookie: cookiePair(newLogin.cookies, 'abar_admin_session'), actorCsrf: newLogin.headers.get('x-csrf-token') ?? '',
      currentPassword: payload.secrets.currentPassword, replacementPassword: payload.secrets.newPassword,
      deadlineAt: payload.deadlineAt, snapshot: () => observerSnapshot(observerClient) });
    return Object.freeze({ ...baseResult, passed: baseResult.passed && product.passed,
      productChecks: product.checks, productPassed: product.passed });
  } catch {
    return Object.freeze({ ...safeResult(payload.runId, CHECK_NAMES.map(name => ({ name, passed: checks[name] }))),
      productChecks: Object.freeze(PRODUCT_CHECKS.map(name => Object.freeze({ name, passed: false }))), productPassed: false });
  } finally {
    if (observerClient) try { await closeByDeadline(() => observerClient.end(), payload.deadlineAt); } catch {}
    if (app) try { await closeByDeadline(() => app.close(), payload.deadlineAt); } catch {}
    else if (server) try { await closeByDeadline(() => new Promise(resolve => server.close(resolve)), payload.deadlineAt); } catch {}
  }
}
