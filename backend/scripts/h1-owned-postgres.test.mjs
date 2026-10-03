import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  IMAGE, SAFE_ERROR, newPair, validatePair, provisionedPair, openFixtureStore, planOffline,
} from './h1-owned-postgres.mjs';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
// The authorized runner uses the repository root. Fail before any fixture writes
// if module-relative root resolution ever regresses.
assert.equal(root === process.cwd(), true);
const namespace = path.join(root, 'odd/probes/h1-owned-postgres/fixtures');
// All credentials remain in memory or fresh ignored fixture files; assertions use booleans.
function fixture() {
  fs.mkdirSync(namespace, { recursive: true, mode: 0o700 });
  const directory = fs.mkdtempSync(path.join(namespace, 'c09-'));
  fs.chmodSync(directory, 0o700);
  return { directory, store: openFixtureStore(path.basename(directory)) };
}
function resources(pair) {
  const run = pair.record.runId ?? randomBytes(16).toString('hex');
  return {
    containerId: randomBytes(32).toString('hex'),
    imageId: `sha256:${randomBytes(32).toString('hex')}`,
    image: IMAGE,
    containerName: `h1_pg_${run}`,
    labels: { 'h1.run': run, 'h1.unit': 'C09' },
    volume: {
      type: 'volume', name: `h1_volume_${run}`, target: '/var/lib/postgresql/data',
      labels: { 'h1.run': run, 'h1.unit': 'C09' },
    },
    secretMount: {
      type: 'bind', source: path.join(root, 'odd/probes/h1-owned-postgres/state', run, 'secret.json'),
      target: '/run/secrets/h1-secret.json', readOnly: true,
    },
    endpoint: { host: '127.0.0.1', port: 49152, containerPort: 5432 },
    state: 'running',
  };
}
function complete() {
  const pair = newPair();
  return provisionedPair(pair, resources(pair));
}
function clone(value) { return structuredClone(value); }
function denied(fn) {
  let safe = false;
  try { fn(); } catch (error) { safe = error?.message === SAFE_ERROR && !error.cause; }
  assert.equal(safe, true);
}
async function deniedAsync(fn) {
  let safe = false;
  try { await fn(); } catch (error) { safe = error?.message === SAFE_ERROR && !error.cause; }
  assert.equal(safe, true);
}
function adapters(pair, trace, change = () => {}) {
  return {
    async inspect(id) {
      trace.push('inspect');
      assert.equal(id === pair.record.resource?.containerId, true);
      const evidence = clone(pair.record.resource);
      change(evidence, trace.length);
      return evidence;
    },
    async authenticate(target) {
      trace.push('authenticate');
      assert.equal(target.database === pair.record.database && target.role === pair.record.role, true);
      return {
        authenticated: true, database: pair.record.database, role: pair.record.role,
        databaseExists: true, superuser: false, createdb: false, createrole: false,
        schemas: ['public'], tables: [],
      };
    },
  };
}

test('internally generated creating pair is strict, bound, unique and incomplete', () => {
  const a = newPair();
  const b = newPair();
  assert.equal(validatePair(a), true);
  assert.equal(a.record.state === 'creating' && a.record.image === IMAGE, true);
  assert.equal(a.record.runId !== b.record.runId && a.secret.password !== b.secret.password, true);
  assert.equal(a.record.runId === a.secret.runId && a.record.version === a.secret.version, true);
});

test('provisioned pair validates without pretending to certify real resources', () => {
  const pair = complete();
  assert.equal(validatePair(pair), true);
  assert.equal(pair.record.state === 'provisioned', true);
  assert.equal(pair.record.database.startsWith('h1_db_') && pair.record.role.startsWith('h1_role_'), true);
});

for (const [name, mutate] of [
  ['unknown record', p => { p.record.extra = true; }],
  ['unknown secret', p => { p.secret.extra = true; }],
  ['version', p => { p.record.version = 2; }],
  ['run binding', p => { p.secret.runId = randomBytes(16).toString('hex'); }],
  ['secret binding', p => { p.secret.version = 2; }],
  ['state', p => { p.record.state = 'ready'; }],
  ['image', p => { p.record.image = 'postgres:latest'; }],
  ['identifier', p => { p.record.role = 'postgres'; }],
  ['password', p => { p.secret.password = ''; }],
  ['creating resource', p => { p.record.state = 'creating'; }],
  ['missing resource', p => { delete p.record.resource; }],
  ['unknown pair', p => { p.extra = true; }],
]) {
  test(`schema rejects ${name}`, () => {
    const pair = complete();
    mutate(pair);
    assert.equal(validatePair(pair), false);
  });
}

test('private exclusive pair writes and bounded descriptor reads roundtrip', () => {
  const { store, directory } = fixture();
  const pair = complete();
  const release = store.acquire();
  store.writePair(pair);
  const read = store.readPair();
  assert.equal(validatePair(read), true);
  assert.equal(read.secret.password === pair.secret.password, true);
  assert.equal((fs.statSync(directory).mode & 0o777) === 0o700, true);
  for (const name of ['record.json', 'secret.json']) {
    assert.equal((fs.statSync(path.join(directory, name)).mode & 0o777) === 0o600, true);
  }
  denied(() => store.writePair(pair));
  denied(release);
  denied(() => store.readPair());
});

test('lock conflict and stale lock block; only own acquisition releases', () => {
  const { store, directory } = fixture();
  const release = store.acquire();
  denied(() => openFixtureStore(path.basename(directory)).acquire());
  release();
  release();
  fs.writeFileSync(path.join(directory, 'lock'), '{}', { flag: 'wx', mode: 0o600 });
  denied(() => store.acquire());
});

test('lock replacement is not removed by original owner', () => {
  const { store, directory } = fixture();
  const release = store.acquire();
  fs.renameSync(path.join(directory, 'lock'), path.join(directory, 'retained-lock'));
  fs.writeFileSync(path.join(directory, 'lock'), '{}', { flag: 'wx', mode: 0o600 });
  denied(release);
  assert.equal(fs.existsSync(path.join(directory, 'lock')), true);
});

for (const kind of ['missing', 'interrupted', 'mismatch', 'malformed', 'unknown', 'utf8', 'oversize', 'mode', 'nonfile', 'symlink', 'hardlink']) {
  test(`filesystem blocks ${kind} pair`, () => {
    const { store, directory } = fixture();
    const pair = complete();
    const release = store.acquire();
    if (kind !== 'missing') {
      fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify(pair.record), { flag: 'wx', mode: 0o600 });
    }
    if (!['missing', 'interrupted'].includes(kind)) {
      const secret = kind === 'mismatch' ? newPair().secret : pair.secret;
      const target = path.join(directory, 'secret.json');
      if (kind === 'nonfile') fs.mkdirSync(target, { mode: 0o700 });
      else if (kind === 'symlink') fs.symlinkSync('record.json', target);
      else if (kind === 'hardlink') fs.linkSync(path.join(directory, 'record.json'), target);
      else {
        const bytes = kind === 'malformed' ? '{'
          : kind === 'unknown' ? JSON.stringify({ ...secret, unknown: true })
          : kind === 'utf8' ? Buffer.from([0xff])
          : kind === 'oversize' ? ' '.repeat(8193) : JSON.stringify(secret);
        fs.writeFileSync(target, bytes, { flag: 'wx', mode: kind === 'mode' ? 0o644 : 0o600 });
      }
    }
    denied(() => store.readPair());
    release();
  });
}

test('uncertain exclusive write preserves originals and leaves interrupted pair denied', () => {
  const { store, directory } = fixture();
  const release = store.acquire();
  fs.writeFileSync(path.join(directory, 'secret.json'), '{}', { flag: 'wx', mode: 0o600 });
  denied(() => store.writePair(complete()));
  assert.equal(fs.readFileSync(path.join(directory, 'secret.json'), 'utf8') === '{}', true);
  denied(() => store.readPair());
  denied(release);
  denied(() => openFixtureStore(path.basename(directory)).acquire());
});

test('filesystem rejects traversal, symlink components and nonprivate directory', () => {
  const { directory } = fixture();
  denied(() => openFixtureStore('../state'));
  denied(() => openFixtureStore(directory));
  const link = `c09-${randomBytes(12).toString('hex')}`;
  fs.symlinkSync(directory, path.join(namespace, link));
  denied(() => openFixtureStore(link));
  fs.chmodSync(directory, 0o755);
  denied(() => openFixtureStore(path.basename(directory)));
});

test('invalid descriptor-shaped inputs and out-of-policy resources fail closed', () => {
  for (const value of [null, [], {}, { record: null, secret: null }]) {
    assert.equal(validatePair(value), false);
  }
  const pair = newPair();
  Object.defineProperty(pair.secret, 'password', { get() { throw new Error('never forwarded'); } });
  assert.equal(validatePair(pair), false);
  for (const mutate of [
    r => { r.endpoint.port = 65536; },
    r => { r.endpoint.port = 0; },
    r => { r.secretMount.source += '/other'; },
    r => { r.labels.extra = 'unknown'; },
    r => { r.imageId = 'mutable'; },
  ]) {
    const creating = newPair();
    const resource = resources(creating);
    mutate(resource);
    denied(() => provisionedPair(creating, resource));
  }
});

test('state accessor is rejected without invocation', () => {
  const pair = newPair();
  let invoked = 0;
  Object.defineProperty(pair.record, 'state', { enumerable: true, get() { invoked++; return 'creating'; } });
  assert.equal(validatePair(pair), false);
  assert.equal(invoked === 0, true);
});

test('creating records can be recovered privately but cannot produce a plan', async () => {
  const { store } = fixture();
  const release = store.acquire();
  store.writePair(newPair());
  const recovered = store.readPair();
  const trace = [];
  await deniedAsync(() => planOffline(recovered, adapters(recovered, trace)));
  assert.equal(trace.length, 0);
  release();
});

test('write and read require own live lock', () => {
  const { store } = fixture();
  denied(() => store.writePair(complete()));
  denied(() => store.readPair());
});

test('fixed offline plan follows inspect/authentication/final inspect without child effects', async () => {
  const pair = complete();
  const trace = [];
  const plan = await planOffline(pair, adapters(pair, trace));
  assert.equal(trace.join(',') === 'inspect,authenticate,inspect', true);
  assert.equal(plan.evidenceKind === 'offline-injected-not-certified', true);
  assert.equal(plan.executable === process.execPath, true);
  assert.equal(plan.args.length === 5 && plan.args[1] === 'migrate' && plan.args[2] === 'deploy' && plan.args[3] === '--config', true);
  assert.equal(plan.args[0] === path.join(root, 'backend/node_modules/prisma/build/index.js'), true);
  assert.equal(plan.args[4] === path.join(root, 'backend/prisma.h1-owned.config.ts'), true);
  assert.equal(Object.keys(plan.env).join(',') === 'H1_OWNED_DATABASE_URL', true);
  assert.equal(plan.env.H1_OWNED_DATABASE_URL.includes('@127.0.0.1:49152/'), true);
  assert.equal(Object.isFrozen(plan) && Object.isFrozen(plan.env) && Object.isFrozen(plan.args), true);
});

for (const [name, mutate] of [
  ['exact ID', r => { r.containerId = randomBytes(32).toString('hex'); }],
  ['immutable image', r => { r.imageId = `sha256:${randomBytes(32).toString('hex')}`; }],
  ['image policy', r => { r.image = 'postgres:latest'; }],
  ['labels', r => { r.labels['h1.run'] = 'other'; }],
  ['storage', r => { r.volume.name = 'other'; }],
  ['storage mount', r => { r.volume.target = '/var/lib/postgresql'; }],
  ['storage labels', r => { r.volume.labels['h1.run'] = 'other'; }],
  ['secret mount', r => { r.secretMount.readOnly = false; }],
  ['loopback', r => { r.endpoint.host = '0.0.0.0'; }],
  ['port', r => { r.endpoint.port = 5432; }],
  ['running state', r => { r.state = 'exited'; }],
  ['unknown inspect field', r => { r.ready = true; }],
]) {
  test(`inspect rejects ${name} before authentication`, async () => {
    const pair = complete();
    const trace = [];
    await deniedAsync(() => planOffline(pair, adapters(pair, trace, mutate)));
    assert.equal(trace.join(',') === 'inspect', true);
  });
}

for (const [name, mutate] of [
  ['authentication', e => { e.authenticated = false; }],
  ['database', e => { e.database = 'other'; }],
  ['role', e => { e.role = 'postgres'; }],
  ['missing database', e => { e.databaseExists = false; }],
  ['superuser', e => { e.superuser = true; }],
  ['createdb', e => { e.createdb = true; }],
  ['createrole', e => { e.createrole = true; }],
  ['existing tables', e => { e.tables = ['preexisting']; }],
  ['extra schema', e => { e.schemas = ['public', 'other']; }],
  ['readiness not authentication', e => { delete e.authenticated; e.ready = true; }],
]) {
  test(`authenticated evidence rejects ${name}`, async () => {
    const pair = complete();
    const trace = [];
    const api = adapters(pair, trace);
    const original = api.authenticate;
    api.authenticate = async target => { const evidence = await original(target); mutate(evidence); return evidence; };
    await deniedAsync(() => planOffline(pair, api));
    assert.equal(trace.join(',') === 'inspect,authenticate', true);
  });
}

test('caller environment and migration hooks are not accepted or executed', async () => {
  const pair = complete();
  const trace = [];
  let effects = 0;
  const injected = {
    ...adapters(pair, trace),
    env: { DATABASE_URL: randomBytes(32).toString('hex'), NODE_OPTIONS: '--invalid' },
    migrate() { effects++; },
    application() { effects++; },
  };
  await deniedAsync(() => planOffline(pair, injected));
  assert.equal(effects === 0 && trace.length === 0, true);
  const plan = await planOffline(pair, adapters(pair, trace));
  assert.equal(effects === 0 && typeof plan.execute === 'undefined', true);
  assert.equal(!('DATABASE_URL' in plan.env) && !('NODE_OPTIONS' in plan.env), true);
});

test('immediate final reinspection rejects changed resource', async () => {
  const pair = complete();
  const trace = [];
  await deniedAsync(() => planOffline(pair, adapters(pair, trace, (r, n) => { if (n === 3) r.state = 'exited'; })));
  assert.equal(trace.join(',') === 'inspect,authenticate,inspect', true);
});

test('incomplete pair never invokes gates; flags and extra adapters cannot authorize', async () => {
  const trace = [];
  const pair = newPair();
  await deniedAsync(() => planOffline(pair, adapters(pair, trace)));
  assert.equal(trace.length, 0);
  await deniedAsync(() => planOffline(complete(), { owned: true }));
});

test('injected exceptions are redacted and caller mutation cannot retarget gates', async () => {
  const pair = complete();
  const trace = [];
  const api = adapters(pair, trace);
  api.inspect = async () => { throw new Error(pair.secret.password); };
  await deniedAsync(() => planOffline(pair, api));
  const original = clone(pair);
  const safeApi = adapters(original, trace);
  const inspect = safeApi.inspect;
  safeApi.inspect = async id => { pair.record.role = 'other'; return inspect(id); };
  const plan = await planOffline(pair, safeApi);
  assert.equal(plan.env.H1_OWNED_DATABASE_URL.includes(original.record.role), true);
});

test('import and direct execution are silent with sanitized fixture-local environment', () => {
  const { directory } = fixture();
  const modulePath = path.join(root, 'backend/scripts/h1-owned-postgres.mjs');
  const env = { HOME: directory, XDG_CONFIG_HOME: directory, XDG_CACHE_HOME: directory, TMPDIR: directory };
  for (const args of [[modulePath], ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./h1-owned-postgres.mjs', import.meta.url).href)})`]]) {
    const result = spawnSync(process.execPath, args, { cwd: directory, env, encoding: 'utf8' });
    assert.equal(result.status === 0 && result.stdout === '' && result.stderr === '', true);
    assert.equal(fs.readdirSync(directory).length === 0, true);
  }
});
