import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, validateDatabaseUrl, validateMigrationTarget, safeResult, compareSnapshots, inspectCarrier, prepareRunDatabase, waitForPostgres, seedAdmin } from './h1-real-e2e.mjs';

const runId = 'a'.repeat(32);
const checkNames = [
  'migration.scope', 'roles.scope', 'seed.argon2', 'http.csrf', 'http.login.first',
  'http.login.second', 'http.reject.noop', 'http.rollback.atomic', 'http.changePassword',
  'database.password.version', 'database.session.rotation', 'database.oldSessionRevocation',
  'database.expirations.preserved', 'http.oldPassword.rejected', 'http.newPassword.accepted',
];
const payload = () => ({
  version: 1, runId, deadlineAt: Date.now() + 60_000,
  database: {
    host: `h1-pg-${runId}`, port: 5432, name: `h1_db_${runId}`,
    bootstrapRole: `h1_bootstrap_${runId}`, migrationRole: `h1_migration_${runId}`,
    applicationRole: `h1_app_${runId}`, observerRole: `h1_observer_${runId}`,
  },
  secrets: {
    bootstrapPassword: '1'.repeat(64), migrationPassword: '2'.repeat(64),
    applicationPassword: '3'.repeat(64), observerPassword: '4'.repeat(64),
    csrfKey: Buffer.alloc(32, 5).toString('base64url'),
    currentPassword: '6'.repeat(64), newPassword: '7'.repeat(64),
  },
});

test('seed supplies the required raw-SQL updatedAt while preserving parameters and closure', async () => {
  const queries = []; let ended = false;
  class Client {
    async connect() {}
    async query(sql, values) { queries.push({ sql, values }); }
    async end() { ended = true; }
  }
  const hash = '$argon2id$v=19$m=19456,t=2,p=1$' + 'A'.repeat(22) + '$' + 'B'.repeat(43);
  await seedAdmin(Client, payload(), { argon2id: 2, async hash() { return hash; } });
  assert.match(queries[0].sql, /"version","updatedAt"\) VALUES \(\$1,\$2,\$3,\$4,true,true,1,CURRENT_TIMESTAMP\)/);
  assert.deepEqual(queries[0].values, [`00000000-0000-4000-8000-${runId.slice(0, 12)}`, 'H1 Fixture Admin', 'h1-admin@example.invalid', hash]);
  assert.equal(ended, true);
});

test('seed accepts the actual producer factor order but rejects changed Argon2 costs', async () => {
  class Client { async connect() {} async query() {} async end() {} }
  const suffix = '$' + Buffer.alloc(16, 1).toString('base64').replace(/=+$/, '') + '$' + Buffer.alloc(32, 2).toString('base64').replace(/=+$/, '');
  const hashing = factors => ({ argon2id: 2, async hash() { return '$argon2id$v=19$' + factors + suffix; } });
  await seedAdmin(Client, payload(), hashing('m=19456,p=1,t=2'));
  for (const factors of ['m=8,p=1,t=2', 'm=19456,p=2,t=2', 'm=19456,p=1,t=1', 'm=19456,p=1,p=1']) {
    await assert.rejects(seedAdmin(Client, payload(), hashing(factors)));
  }
});

test('import is inert and payload rejects malformed, mismatched, and duplicate secrets', async () => {
  const before = process.env.H1_FIXTURE_IMPORT_SENTINEL;
  process.env.H1_FIXTURE_IMPORT_SENTINEL = 'sentinel';
  try {
    await import('./h1-real-e2e.mjs?inert-import-probe');
    assert.equal(process.env.H1_FIXTURE_IMPORT_SENTINEL, 'sentinel');
  } finally {
    if (before === undefined) delete process.env.H1_FIXTURE_IMPORT_SENTINEL;
    else process.env.H1_FIXTURE_IMPORT_SENTINEL = before;
  }
  const valid = payload();
  assert.equal(validatePayload(valid).runId, runId);
  for (const mutate of [
    value => { value.runId = 'A'.repeat(32); },
    value => { value.database.host = 'localhost'; },
    value => { value.database.name = 'h1_db_' + 'b'.repeat(32); },
    value => { value.secrets.applicationPassword = value.secrets.bootstrapPassword; },
    value => { value.secrets.csrfKey += '='; },
    value => { value.extra = true; },
  ]) {
    const bad = payload(); mutate(bad);
    assert.throws(() => validatePayload(bad), {
      message: 'H1 real E2E fixture rejected input or observed a failed check',
    });
  }
});

test('database URL scope accepts only the exact run-owned alias, DB, role, and password', () => {
  const p = payload();
  const url = `postgresql://${p.database.applicationRole}:${p.secrets.applicationPassword}@${p.database.host}:5432/${p.database.name}?schema=public`;
  assert.equal(validateDatabaseUrl(url, p, 'applicationRole'), url);
  const migrationUrl = `postgresql://${p.database.migrationRole}:${p.secrets.migrationPassword}@${p.database.host}:5432/${p.database.name}?schema=public`;
  assert.equal(validateMigrationTarget(runId, migrationUrl), migrationUrl);
  for (const bad of [
    url.replace(p.database.host, '127.0.0.1'),
    url.replace(p.database.name, 'postgres'),
    url.replace(p.database.applicationRole, p.database.observerRole),
    url + '&sslmode=disable',
    url.replace(':5432/', ':5433/'),
  ]) assert.throws(() => validateDatabaseUrl(bad, p, 'applicationRole'));
  for (const [id, bad] of [[undefined, migrationUrl], [runId.toUpperCase(), migrationUrl],
    [runId, migrationUrl.replace(p.database.migrationRole, p.database.applicationRole)],
    [runId, migrationUrl.replace(p.database.host, '127.0.0.1')], [runId, migrationUrl + '&sslmode=disable']]) {
    assert.throws(() => validateMigrationTarget(id, bad));
  }
});

test('result sanitizer exposes fixed booleans only and rejects diagnostic-shaped data', () => {
  const checks = checkNames.map(name => ({ name, passed: true }));
  assert.deepEqual(safeResult(runId, checks), { version: 1, runId, checks, passed: true });
  assert.throws(() => safeResult(runId, [{ name: 'password=' + 'x'.repeat(10), passed: true }]));
  const malformed = checkNames.map(name => ({ name, passed: true }));
  malformed[0].passed = 'yes';
  assert.throws(() => safeResult(runId, malformed));
});

test('controlled failure rolls back all fake table writes witnessed by the snapshot comparator', async () => {
  const before = { users: [{ id: 'u', version: 1 }], sessions: [{ id: 's', revokedAt: null }], preauth: [], audits: [] };
  let state = structuredClone(before);
  await assert.rejects(async () => {
    const rollbackCopy = structuredClone(state);
    try {
      state.users[0].version++;
      state.sessions[0].revokedAt = 'fixture-failure';
      throw new Error('synthetic transaction abort');
    } catch (error) {
      state = rollbackCopy;
      throw error;
    }
  });
  assert.equal(compareSnapshots(before, state), true);
});

test('PostgreSQL readiness maps fixed fake-client codes before end and keeps unknown safe', async t => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const cases = [
    ['ENOTFOUND', 'DNS_FAILURE'], ['EAI_AGAIN', 'DNS_FAILURE'], ['ECONNREFUSED', 'CONNECTION_REFUSED'],
    ['ETIMEDOUT', 'CONNECTION_TIMEOUT'], ['28P01', 'AUTH_REJECTED'], ['28000', 'AUTH_REJECTED'],
    ['3D000', 'DATABASE_MISSING'], ['57P03', 'SERVER_NOT_READY'], ['private-code', 'UNKNOWN'],
  ];
  for (const [code, expected] of cases) {
    now = 0;
    const events = [];
    class Client {
      constructor() {}
      async connect() { now = 1; const error = new Error('private connection detail'); error.code = code; throw error; }
      async end() { events.push('end'); }
    }
    await assert.rejects(waitForPostgres(Client, { database: { host: 'fake', port: 5432, name: 'fake', bootstrapRole: 'fake' },
      secrets: { bootstrapPassword: 'private' }, runId, deadlineAt: 1 }, category => events.push(category)));
    assert.equal(events[0], expected);
    assert.ok(events.slice(1).every(event => event === 'end'));
    assert.equal(events.filter(event => event !== 'end').length, 1);
    assert.equal(JSON.stringify(events).includes('private'), false);
  }
  const events = [];
  now = 0;
  class MalformedClient {
    constructor() {}
    async connect() { now = 1; throw { code: { [Symbol.toPrimitive]() { throw new Error('must not coerce'); } } }; }
    async end() { events.push('end'); }
  }
  await assert.rejects(waitForPostgres(MalformedClient, { database: { host: 'fake', port: 5432, name: 'fake', bootstrapRole: 'fake' },
    secrets: { bootstrapPassword: 'private' }, runId, deadlineAt: 1 }, () => { events.push('UNKNOWN'); throw Error('observer failure'); }));
  assert.deepEqual(events, ['UNKNOWN', 'end']);
});

test('PostgreSQL readiness callback is optional, deduplicated by category, and isolated from retry behavior', async () => {
  const callbacks = [], events = [];
  let attempts = 0;
  class RetryClient {
    constructor() {}
    async connect() { attempts++; const error = new Error('private'); error.code = 'ECONNREFUSED'; throw error; }
    async end() { events.push('end'); }
  }
  await assert.rejects(waitForPostgres(RetryClient, { database: { host: 'fake', port: 5432, name: 'fake', bootstrapRole: 'fake' },
    secrets: { bootstrapPassword: 'private' }, runId, deadlineAt: Date.now() + 205 }, category => callbacks.push(category)));
  assert.ok(attempts >= 2);
  assert.deepEqual(callbacks, ['CONNECTION_REFUSED']);
  assert.equal(events.length, attempts);
});

test('database setup closes bootstrap before migration, grants runtime access, and seeds before app startup', async () => {
  const events = [];
  const bootstrap = { end: async () => events.push('bootstrap.close') };
  await prepareRunDatabase({ payload: { runId },
    waitForPostgres: async () => { events.push('postgres.ready'); return bootstrap; },
    grantRoles: async () => events.push('roles.create'),
    migrate: async () => events.push('migrate'),
    grantRuntimeAccess: async () => events.push('runtime.grants'),
    seedAdmin: async () => events.push('seed'),
    startApplication: async () => events.push('app.create-and-listen'),
  });
  assert.deepEqual(events, ['postgres.ready', 'roles.create', 'bootstrap.close', 'migrate', 'runtime.grants', 'seed', 'app.create-and-listen']);
});

test('database preparation reports fixed stage callbacks while preserving adapter order', async () => {
  const events = [];
  const bootstrap = { end: async () => events.push('bootstrap.close') };
  const onStage = (stage, phase, errorClass) => events.push(errorClass === undefined ? [stage, phase] : [stage, phase, errorClass]);
  await prepareRunDatabase({ payload: { runId }, onStage,
    waitForPostgres: async () => { events.push('postgres.ready'); return bootstrap; },
    grantRoles: async () => events.push('roles.create'),
    migrate: async () => events.push('migrate'),
    grantRuntimeAccess: async () => events.push('runtime.grants'),
    seedAdmin: async () => events.push('seed'),
    startApplication: async () => { events.push('app.create-and-listen'); return 'started'; },
  });
  assert.deepEqual(events, [
    ['postgres_ready', 'start'], 'postgres.ready', ['postgres_ready', 'end'],
    ['roles', 'start'], ['check.roles.scope', 'start'], 'roles.create',
    ['check.roles.scope', 'end'], ['roles', 'end'], 'bootstrap.close',
    ['migrate', 'start'], ['check.migration.scope', 'start'], 'migrate',
    ['check.migration.scope', 'end'], ['migrate', 'end'],
    ['runtime_grants', 'start'], 'runtime.grants', ['runtime_grants', 'end'],
    ['seed', 'start'], ['check.seed.argon2', 'start'], 'seed',
    ['check.seed.argon2', 'end'], ['seed', 'end'],
    ['application_start', 'start'], 'app.create-and-listen', ['application_start', 'end'],
  ]);
});

test('database preparation reports fixed runtime errors without exposing exceptions', async () => {
  const events = [];
  const failure = new Error('private SQL payload must stay hidden');
  const bootstrap = { end: async () => {} };
  await assert.rejects(prepareRunDatabase({ payload: { runId }, onStage: (stage, phase, errorClass) => events.push(errorClass === undefined ? [stage, phase] : [stage, phase, errorClass]),
    waitForPostgres: async () => bootstrap, grantRoles: async () => {}, migrate: async () => { throw failure; },
    grantRuntimeAccess: async () => {}, seedAdmin: async () => {}, startApplication: async () => {},
  }), error => error === failure);
  assert.deepEqual(events, [
    ['postgres_ready', 'start'], ['postgres_ready', 'end'], ['roles', 'start'],
    ['check.roles.scope', 'start'], ['check.roles.scope', 'end'], ['roles', 'end'],
    ['migrate', 'start'], ['check.migration.scope', 'start'], ['check.migration.scope', 'error', 'RUNTIME_ERROR'],
    ['migrate', 'error', 'RUNTIME_ERROR'],
  ]);
  assert.equal(JSON.stringify(events).includes('private SQL payload'), false);
});

test('database readiness emits the fourth safe PostgreSQL category callback argument', async () => {
  const events = [];
  const failure = new Error('private connection failure');
  await assert.rejects(prepareRunDatabase({ payload: { runId }, onStage: (...args) => events.push(args),
    waitForPostgres: async onCategory => { onCategory('CONNECTION_TIMEOUT'); throw failure; },
    grantRoles: async () => {}, migrate: async () => {}, grantRuntimeAccess: async () => {},
    seedAdmin: async () => {}, startApplication: async () => {},
  }), error => error === failure);
  assert.deepEqual(events, [['postgres_ready', 'start'],
    ['postgres_ready', 'error', 'RUNTIME_ERROR', 'CONNECTION_TIMEOUT']]);
  assert.equal(JSON.stringify(events).includes('private'), false);
});

test('observer snapshots compare exact allowlisted rows without exposing row dumps', () => {
  const left = { users: [{ id: 'u', version: 1 }], sessions: [{ id: 's', revokedAt: null }], preauth: [], audits: [] };
  assert.equal(compareSnapshots(left, structuredClone(left)), true);
  const changed = structuredClone(left); changed.sessions[0].revokedAt = 't';
  assert.equal(compareSnapshots(left, changed), false);
  const audited = structuredClone(left); audited.audits.push({ id: 'a', action: 'reset-password' });
  assert.equal(compareSnapshots(left, audited), false);
  assert.throws(() => compareSnapshots(left, { ...left, secret: 'private' }));
});

test('carrier checker recognizes the approved 204 shape without returning header values', () => {
  const headers = new Headers({ 'cache-control': 'no-store', 'x-csrf-token': 'A'.repeat(43), 'set-cookie': 'abar_admin_session=' + 'A'.repeat(43) + '; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=900' });
  const result = inspectCarrier({ status: 204, headers, body: '' });
  assert.deepEqual(result, { status204: true, noStore: true, emptyBody: true, rotatedSessionCookie: true, csrfRotated: true });
  assert.equal(JSON.stringify(result).includes('opaque'), false);
});
