// Offline C10 v2 contract only. Import and direct execution deliberately do nothing.
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const IMAGE = 'postgres:17.11-bookworm';
export const SAFE_ERROR = 'H1 ownership contract denied.';
const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const FIXTURES = path.join(ROOT, 'odd/probes/h1-owned-postgres/fixtures');
const FUTURE_STATE = path.join(ROOT, 'odd/probes/h1-owned-postgres/state');
const MAX_BYTES = 8192;
const RUN = /^[a-f0-9]{32}$/;
const ID = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const fail = () => { throw new Error(SAFE_ERROR); };
const randomHex = bytes => randomBytes(bytes).toString('hex');

function exact(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Reflect.ownKeys(object);
  return own.length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && 'value' in descriptor && descriptor.enumerable;
  });
}
function matches(expression, value) {
  return typeof value === 'string' && expression.test(value);
}
const PROJECTION_FILE = 'bootstrap-password.txt';
const PROJECTION_TARGET = '/run/secrets/h1-bootstrap-password';
function projectionIdentity(runId) {
  return { version: 2, runId, file: PROJECTION_FILE,
    source: path.join(FUTURE_STATE, runId, PROJECTION_FILE),
    target: PROJECTION_TARGET, readOnly: true };
}
function validProjection(evidence, pair) {
  const identity = projectionIdentity(pair.record.runId);
  return exact(evidence, [...Object.keys(identity), 'plaintext'])
    && Object.keys(identity).every(key => evidence[key] === identity[key])
    && evidence.plaintext === pair.secret.bootstrapPassword;
}
function validResource(resource, record) {
  if (!exact(resource, ['version', 'runId', 'bootstrap', 'containerId', 'imageId', 'image', 'containerName', 'labels',
    'volume', 'secretMount', 'endpoint', 'state'])) return false;
  const { labels, volume, secretMount, endpoint } = resource;
  return resource.version === 2 && resource.runId === record.runId
    && exact(resource.bootstrap, ['role', 'passwordFile'])
    && resource.bootstrap.role === record.bootstrapRole
    && resource.bootstrap.passwordFile === PROJECTION_TARGET
    && matches(ID, resource.containerId) && matches(IMAGE_ID, resource.imageId)
    && resource.image === IMAGE && resource.containerName === `h1_pg_${record.runId}`
    && exact(labels, ['h1.run', 'h1.unit'])
    && labels['h1.run'] === record.runId && labels['h1.unit'] === 'C10'
    && exact(volume, ['type', 'name', 'target', 'labels'])
    && volume.type === 'volume' && volume.name === `h1_volume_${record.runId}`
    && volume.target === '/var/lib/postgresql/data'
    && exact(volume.labels, ['h1.run', 'h1.unit'])
    && volume.labels['h1.run'] === record.runId && volume.labels['h1.unit'] === 'C10'
    && exact(secretMount, ['type', 'source', 'target', 'readOnly'])
    && secretMount.type === 'bind' && secretMount.readOnly === true
    && secretMount.source === projectionIdentity(record.runId).source
    && secretMount.target === PROJECTION_TARGET
    && exact(endpoint, ['host', 'port', 'containerPort'])
    && endpoint.host === '127.0.0.1' && endpoint.containerPort === 5432
    && Number.isInteger(endpoint.port) && endpoint.port >= 1024 && endpoint.port <= 65535
    && resource.state === 'running';
}
function validPair(pair) {
  if (!exact(pair, ['record', 'secret'])) return false;
  const { record, secret } = pair;
  // Lifecycle states have different exact key sets; an incomplete state is not migratable.
  if (!record || typeof record !== 'object') return false;
  const state = Object.getOwnPropertyDescriptor(record, 'state');
  if (!state || !('value' in state) || !['creating', 'provisioned'].includes(state.value)) return false;
  const keys = ['version', 'runId', 'state', 'image', 'database', 'bootstrapRole', 'migrationRole'];
  if (state.value === 'provisioned') keys.push('resource');
  if (!exact(record, keys)
    || !exact(secret, ['version', 'runId', 'bootstrapPassword', 'migrationPassword'])) return false;
  // Legacy v1 files require manual recovery. Never convert or adopt their credentials.
  return record.version === 2 && secret.version === 2 && matches(RUN, record.runId)
    && secret.runId === record.runId && matches(ID, secret.bootstrapPassword)
    && matches(ID, secret.migrationPassword) && secret.bootstrapPassword !== secret.migrationPassword
    && record.image === IMAGE && record.database === `h1_db_${record.runId}`
    && record.bootstrapRole === `h1_bootstrap_${record.runId}`
    && record.migrationRole === `h1_migration_${record.runId}`
    && record.bootstrapRole !== record.migrationRole
    && (record.state === 'creating' || validResource(record.resource, record));
}
export function validatePair(pair) {
  try {
    return validPair(pair)
      && Buffer.byteLength(JSON.stringify(pair.record)) <= MAX_BYTES
      && Buffer.byteLength(JSON.stringify(pair.secret)) <= MAX_BYTES;
  } catch { return false; }
}
function snapshot(pair) {
  if (!validatePair(pair)) fail();
  return JSON.parse(JSON.stringify(pair));
}
function distinctSecrets(runId) {
  const bootstrapPassword = randomHex(32);
  const migrationPassword = randomHex(32);
  // Deny even the improbable RNG collision rather than weakening separation.
  if (bootstrapPassword === migrationPassword) fail();
  return { version: 2, runId, bootstrapPassword, migrationPassword };
}
export function newPair() {
  try {
    const runId = randomHex(16);
    return {
      record: { version: 2, runId, state: 'creating', image: IMAGE,
        database: `h1_db_${runId}`, bootstrapRole: `h1_bootstrap_${runId}`,
        migrationRole: `h1_migration_${runId}` },
      secret: distinctSecrets(runId),
    };
  } catch { fail(); }
}
// Records supplied by an adapter are local accidental-misuse controls, NOT proof.
export function provisionedPair(pair, resource) {
  try {
    const copy = snapshot(pair);
    if (copy.record.state !== 'creating' || !validResource(resource, copy.record)) fail();
    copy.record.state = 'provisioned';
    copy.record.resource = JSON.parse(JSON.stringify(resource));
    return snapshot(copy);
  } catch { fail(); }
}

// Local POSIX filesystem only: no directory-fd/openat API in Node, hence component
// checks are NOT race-proof against hostile same-user/root directory replacement.
// No network FS, Windows ACL guarantee, crash durability or global chmod repair.
function uid() {
  if (process.platform === 'win32' || typeof process.getuid !== 'function'
    || !fs.constants.O_NOFOLLOW) fail();
  return process.getuid();
}
function components(directory) {
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  }
}
function privateDirectory(directory) {
  components(directory);
  const stat = fs.lstatSync(directory);
  if (stat.uid !== uid() || (stat.mode & 0o7777) !== 0o700) fail();
  return stat;
}
function privateFile(fd) {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile() || stat.uid !== uid() || (stat.mode & 0o7777) !== 0o600
    || stat.nlink !== 1 || stat.size > MAX_BYTES) fail();
  return stat;
}
function readDescriptor(fd) {
  const before = privateFile(fd);
  const bytes = Buffer.alloc(MAX_BYTES + 1);
  let count = 0;
  while (count < bytes.length) {
    const read = fs.readSync(fd, bytes, count, bytes.length - count, count);
    if (read === 0) break;
    count += read;
  }
  const after = privateFile(fd);
  if (count > MAX_BYTES || count !== before.size || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail();
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
}
function readPrivate(directory, name) {
  privateDirectory(directory);
  // O_NONBLOCK avoids hanging on a FIFO before fstat rejects its descriptor type.
  const fd = fs.openSync(path.join(directory, name), fs.constants.O_RDONLY
    | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try { return readDescriptor(fd); } finally { fs.closeSync(fd); }
}
function createPrivate(directory, name, text) {
  privateDirectory(directory);
  if (Buffer.byteLength(text) > MAX_BYTES) fail();
  // Exclusive direct open is the decision, not a prior exists/access check.
  const fd = fs.openSync(path.join(directory, name), fs.constants.O_WRONLY
    | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    privateFile(fd);
    fs.writeFileSync(fd, text, { encoding: 'utf8' });
    privateFile(fd);
    fs.fsyncSync(fd);
    return fs.fstatSync(fd);
  } finally { fs.closeSync(fd); }
}
function sameFile(a, b) { return a.dev === b.dev && a.ino === b.ino; }

// Opens ONLY an already-created private test fixture, never the future real state.
// Names are a single component. The helper neither adopts resources nor cleans pairs.
export function openFixtureStore(name) {
  try {
    if (process.cwd() !== ROOT || fs.realpathSync(ROOT) !== ROOT) fail();
    components(ROOT);
    if (typeof name !== 'string' || !/^c10-[A-Za-z0-9-]{6,80}$/.test(name)) fail();
    const directory = path.join(FIXTURES, name);
    const originalDirectory = privateDirectory(directory);
    let held = null;
    function checkDirectory() {
      if (!sameFile(originalDirectory, privateDirectory(directory))) fail();
    }
    function checkLock() {
      checkDirectory();
      if (!held || held.uncertain) fail();
      const stat = fs.lstatSync(path.join(directory, 'lock'));
      if (stat.isSymbolicLink() || !sameFile(stat, held.stat)
        || readPrivate(directory, 'lock') !== held.text) fail();
    }
    function readPair() {
      try {
        checkLock();
        const record = JSON.parse(readPrivate(directory, 'record.json'));
        const secret = JSON.parse(readPrivate(directory, 'secret.json'));
        checkLock();
        const copy = snapshot({ record, secret });
        if (!validProjection({ ...projectionIdentity(record.runId),
          plaintext: readPrivate(directory, PROJECTION_FILE) }, copy)) fail();
        checkLock();
        return copy;
      } catch { fail(); }
    }
    return Object.freeze({
      acquire() {
        try {
          checkDirectory();
          if (held) fail();
          const text = JSON.stringify({ version: 1, token: randomHex(32) });
          const stat = createPrivate(directory, 'lock', text);
          held = { stat, text };
          let released = false;
          return () => {
            if (released) return;
            try {
              checkLock();
              // Only this exact acquired inode/token may be unlinked. No stale reclaim.
              fs.unlinkSync(path.join(directory, 'lock'));
              held = null;
              released = true;
            } catch { fail(); }
          };
        } catch { fail(); }
      },
      writePair(pair) {
        try {
          checkLock();
          const copy = snapshot(pair);
          createPrivate(directory, 'record.json', `${JSON.stringify(copy.record)}\n`);
          checkLock();
          createPrivate(directory, 'secret.json', `${JSON.stringify(copy.secret)}\n`);
          checkLock();
          createPrivate(directory, PROJECTION_FILE, copy.secret.bootstrapPassword);
          checkLock();
          // Three creations are NOT atomic. On interruption,
          // retain originals/partial files; recovery must deny, never overwrite/adopt.
        } catch {
          // Even a late sync failure may leave parseable bytes. Keep the acquired
          // lock as an ambiguity barrier rather than certifying that pair on retry.
          if (held) held.uncertain = true;
          fail();
        }
      },
      // Read actual bounded plaintext; never reinterpret retained JSON as mount evidence.
      readProjection() {
        try {
          checkLock();
          const pair = readPair();
          const evidence = { ...projectionIdentity(pair.record.runId),
            plaintext: readPrivate(directory, PROJECTION_FILE) };
          checkLock();
          if (!validProjection(evidence, pair)) fail();
          return evidence;
        } catch { fail(); }
      },
      readPair,
    });
  } catch { fail(); }
}

function validAuthentication(evidence, record) {
  return exact(evidence, ['authenticated', 'database', 'role', 'databaseExists',
    'superuser', 'createdb', 'createrole', 'schemas', 'tables'])
    && evidence.authenticated === true && evidence.databaseExists === true
    && evidence.database === record.database && evidence.role === record.migrationRole
    && evidence.superuser === false && evidence.createdb === false && evidence.createrole === false
    && Array.isArray(evidence.schemas) && evidence.schemas.length === 1 && evidence.schemas[0] === 'public'
    && Array.isArray(evidence.tables) && evidence.tables.length === 0;
}
function freezeTree(object) {
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') freezeTree(value);
  }
  return Object.freeze(object);
}

// Injected evidence is explicitly fake/offline. Future real adapters must independently
// authenticate/query and translate complete Docker/PG observations, not accept flags.
// No resource preparation, child execution, stdout/stderr handling or operational CLI.
export async function planOffline(pair, adapters) {
  try {
    const copy = freezeTree(snapshot(pair));
    if (copy.record.state !== 'provisioned' || !exact(adapters, ['inspect', 'authenticate', 'readProjection'])
      || typeof adapters.inspect !== 'function' || typeof adapters.authenticate !== 'function'
      || typeof adapters.readProjection !== 'function') fail();
    const { record, secret } = copy;
    // Capture functions before awaiting to prevent accidental caller retargeting.
    const inspect = adapters.inspect.bind(adapters);
    const authenticate = adapters.authenticate.bind(adapters);
    const readProjection = adapters.readProjection.bind(adapters);
    async function checkProjection() {
      if (!validProjection(await readProjection(freezeTree(projectionIdentity(record.runId))), copy)) fail();
    }
    async function inspectExact() {
      const evidence = await inspect(record.resource.containerId);
      if (!validResource(evidence, record) || !isDeepStrictEqual(evidence, record.resource)) fail();
    }
    await inspectExact();
    await checkProjection();
    const target = freezeTree({ database: record.database, role: record.migrationRole,
      password: secret.migrationPassword, host: '127.0.0.1', port: record.resource.endpoint.port });
    if (!validAuthentication(await authenticate(target), record)) fail();
    await checkProjection();
    await inspectExact(); // Last asynchronous gate immediately before fixed plan construction.
    return freezeTree({
      evidenceKind: 'offline-injected-not-certified',
      executable: process.execPath,
      args: [path.join(ROOT, 'backend/node_modules/prisma/build/index.js'), 'migrate', 'deploy',
        '--config', path.join(ROOT, 'backend/prisma.h1-owned.config.ts')],
      env: { H1_OWNED_DATABASE_URL: `postgresql://${record.migrationRole}:${secret.migrationPassword}@127.0.0.1:${record.resource.endpoint.port}/${record.database}` },
    });
  } catch { fail(); }
}
