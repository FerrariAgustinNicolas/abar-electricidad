import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPair, provisionedPair } from './h1-owned-postgres.mjs';
import { observePostgresEvidence, PG_EVIDENCE_DENIED } from './h1-owned-postgres-pg-evidence.mjs';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const resource = runId => ({ version: 2, runId, bootstrap: { role: `h1_bootstrap_${runId}`, passwordFile: '/run/secrets/h1-bootstrap-password' },
  containerId: 'a'.repeat(64), imageId: `sha256:${'b'.repeat(64)}`, image: 'postgres:17.11-bookworm',
  containerName: `h1_pg_${runId}`, labels: { 'h1.run': runId, 'h1.unit': 'C10' },
  volume: { type: 'volume', name: `h1_volume_${runId}`, target: '/var/lib/postgresql/data', labels: { 'h1.run': runId, 'h1.unit': 'C10' } },
  secretMount: { type: 'bind', source: path.join(root, 'odd/probes/h1-owned-postgres/state', runId, 'bootstrap-password.txt'), target: '/run/secrets/h1-bootstrap-password', readOnly: true },
  endpoint: { host: '127.0.0.1', port: 15432, containerPort: 5432 }, state: 'running' });

function makePair() {
  const pair = newPair();
  return provisionedPair(pair, resource(pair.record.runId));
}

class MemoryClient extends EventEmitter {
  constructor(config, overrides = {}) {
    super();
    this.config = config;
    this.overrides = overrides;
    this.calls = [];
    this.ended = 0;
  }
  async connect() { this.calls.push(['connect']); }
  async query(text, values) {
    this.calls.push(['query', text, values]);
    if (this.overrides.query) return this.overrides.query(text, values);
    if (text === 'BEGIN READ ONLY') return { rows: [] };
    if (text === 'ROLLBACK') return { rows: [] };
    if (text.includes('current_database()')) return { rows: [{ database: this.config.database, current_user: this.config.user, session_user: this.config.user }] };
    if (text.includes('pg_roles')) return { rows: [{ rolname: this.config.user, rolsuper: false, rolcreatedb: false, rolcreaterole: false }] };
    if (text.includes('pg_database')) return { rows: [{ datname: this.config.database, owner: 'db_owner', can_connect: true }] };
    if (text.includes("nspname = 'public'")) return { rows: [{ name: 'public', owner: 'schema_owner', can_use: true, can_create: false }] };
    if (text.includes('pg_class')) return { rows: [] };
    if (text.includes('pg_namespace')) return { rows: [{ name: 'public' }] };
    throw new Error('unexpected query');
  }
  async end() { this.ended++; }
}

function factoryFor(override) {
  let client;
  return { factory: config => (client = new MemoryClient(config, override)), get client() { return client; } };
}

test('observes bounded read-only catalog facts with explicit migration-only configuration', async () => {
  const pair = makePair();
  const capture = factoryFor();
  const evidence = await observePostgresEvidence(pair, { clientFactory: config => capture.factory(config) });
  assert.equal(evidence.evidenceKind, 'postgres-catalog-observation');
  assert.equal(evidence.source, 'injected-client');
  assert.deepEqual(evidence.identity, { database: pair.record.database, currentUser: pair.record.migrationRole, sessionUser: pair.record.migrationRole });
  assert.deepEqual(evidence.roleAttributes, { superuser: false, createdb: false, createrole: false });
  assert.equal(evidence.database.exists, true);
  assert.equal(evidence.database.owner, 'db_owner');
  assert.deepEqual(evidence.database.grants, { connect: true });
  assert.deepEqual(evidence.publicSchema, { owner: 'schema_owner', grants: { usage: true, create: false } });
  assert.deepEqual(evidence.schemas, ['public']);
  assert.deepEqual(evidence.tables, []);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.tables), true);
  const client = capture.client;
  assert.deepEqual(Object.keys(client.config).sort(), ['application_name', 'binary', 'client_encoding', 'connectionTimeoutMillis', 'database', 'host', 'options', 'password', 'port', 'query_timeout', 'replication', 'ssl', 'sslnegotiation', 'statement_timeout', 'user'].sort());
  assert.deepEqual([client.config.host, client.config.port, client.config.database, client.config.user],
    ['127.0.0.1', pair.record.resource.endpoint.port, pair.record.database, pair.record.migrationRole]);
  assert.equal(client.config.password === pair.secret.migrationPassword, true);
  assert.equal(client.config.ssl, false);
  assert.equal(client.config.application_name, 'h1-pg-evidence');
  assert.equal(client.config.client_encoding, 'UTF8');
  assert.equal(client.config.options, '-c default_transaction_read_only=on');
  assert.equal(client.config.binary, true);
  assert.equal(client.config.replication, 'false');
  assert.equal(client.config.sslnegotiation, 'postgres');
  assert.ok(client.config.connectionTimeoutMillis > 0 && client.config.query_timeout > 0 && client.config.statement_timeout > 0);
  assert.deepEqual(client.calls.map(call => call[0] === 'connect' ? 'connect' : call[1]),
    ['connect', 'BEGIN READ ONLY', ...client.calls.filter(c => c[0] === 'query' && c[1] !== 'BEGIN READ ONLY' && c[1] !== 'ROLLBACK').map(c => c[1]), 'ROLLBACK']);
  assert.equal(client.ended, 1);
  assert.ok(client.calls.filter(c => c[0] === 'query').every(c => c[2] === undefined || Array.isArray(c[2])));
  assert.ok(client.calls.some(c => c[0] === 'query' && c[1].includes('LIMIT') && c[2]?.[0] === pair.record.migrationRole));
  const databaseQuery = client.calls.find(c => c[0] === 'query' && c[1].includes('has_database_privilege'));
  assert.equal(databaseQuery[1], "SELECT d.datname, pg_catalog.pg_get_userbyid(d.datdba) AS owner, pg_catalog.has_database_privilege($2, d.oid, 'CONNECT') AS can_connect FROM pg_catalog.pg_database AS d WHERE d.datname = $1 LIMIT 2");
  assert.deepEqual(databaseQuery[2], [pair.record.database, pair.record.migrationRole]);
  assert.equal(JSON.stringify(evidence).includes(pair.secret.migrationPassword), false);
});

test('captures driver methods before connect can retarget the client', async () => {
  const pair = makePair();
  const client = new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole });
  client.connect = async () => { client.query = () => { throw new Error('retargeted query'); }; };
  const evidence = await observePostgresEvidence(pair, { clientFactory: () => client });
  assert.equal(evidence.source, 'injected-client');
  assert.equal(evidence.database.exists, true);
  assert.equal(client.ended, 1);
});

test('fails closed before factory for invalid/non-provisioned pairs and rejects injected options', async () => {
  let calls = 0;
  const clientFactory = () => { calls++; return new MemoryClient({}); };
  await assert.rejects(observePostgresEvidence(newPair(), { clientFactory }), error => error.message === PG_EVIDENCE_DENIED);
  const pair = makePair();
  await assert.rejects(observePostgresEvidence(pair, { clientFactory, host: 'elsewhere' }), error => error.message === PG_EVIDENCE_DENIED);
  assert.equal(calls, 0);
});

test('reports restrictive role/grant facts and nonempty inventories without claiming admission', async () => {
  const pair = makePair();
  const client = new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole }, {
    query(text) {
      if (text === 'BEGIN READ ONLY' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('current_database()')) return { rows: [{ database: pair.record.database, current_user: pair.record.migrationRole, session_user: pair.record.migrationRole }] };
      if (text.includes('pg_roles')) return { rows: [{ rolname: pair.record.migrationRole, rolsuper: true, rolcreatedb: false, rolcreaterole: false }] };
      if (text.includes('pg_database')) return { rows: [{ datname: pair.record.database, owner: 'db_owner', can_connect: false }] };
      if (text.includes("nspname = 'public'")) return { rows: [{ name: 'public', owner: 'schema_owner', can_use: false, can_create: true }] };
      if (text.includes('pg_class')) return { rows: [{ schema: 'app', name: 'items' }] };
      if (text.includes('pg_namespace')) return { rows: [{ name: 'public' }, { name: 'app' }] };
      throw new Error('unexpected query');
    },
  });
  const evidence = await observePostgresEvidence(pair, { clientFactory: () => client });
  assert.equal(evidence.roleAttributes.superuser, true);
  assert.deepEqual(evidence.database.grants, { connect: false });
  assert.deepEqual(evidence.publicSchema.grants, { usage: false, create: true });
  assert.deepEqual(evidence.schemas, ['app', 'public']);
  assert.deepEqual(evidence.tables, [{ schema: 'app', name: 'items' }]);
  assert.equal(evidence.evidenceKind, 'postgres-catalog-observation');
  assert.equal('ready' in evidence || 'admitted' in evidence, false);
});

test('denies malformed rows, over-cap inventory, identity mismatch, query rejection, and cleanup failure generically', async t => {
  const scenarios = [
    ['identity mismatch', (pair, text) => text.includes('current_database()') ? [{ database: 'wrong', current_user: pair.record.migrationRole, session_user: pair.record.migrationRole }] : null],
    ['sparse role row', (pair, text) => text.includes('pg_roles') ? [{}] : null],
    ['sparse result array', (pair, text) => text.includes('pg_roles') ? new Array(1) : null],
    ['accessor row', (pair, text) => text.includes('pg_roles') ? [Object.defineProperty({}, 'rolname', { enumerable: true, get() { throw new Error('getter'); } })] : null],
    ['schema overflow', (pair, text) => text.includes('pg_namespace') ? Array.from({ length: 65 }, (_, i) => ({ name: `s${i}` })) : null],
    ['table overflow', (pair, text) => text.includes('pg_class') ? Array.from({ length: 129 }, (_, i) => ({ schema: 'app', name: `t${i}` })) : null],
    ['missing database', (pair, text) => text.includes('pg_database') ? [] : null],
    ['duplicate schema', (pair, text) => text.includes('SELECT nspname AS name') ? [{ name: 'public' }, { name: 'public' }] : null],
    ['oversized UTF-8 name', (pair, text) => text.includes('SELECT nspname AS name') ? [{ name: 'x'.repeat(129) }] : null],
    ['ill-formed UTF-16 name', (pair, text) => text.includes('SELECT nspname AS name') ? [{ name: '\\ud800' }] : null],
    ['rejected catalog query', (pair, text) => text.includes('pg_roles') ? (() => { throw new Error(pair.secret.migrationPassword); })() : null],
  ];
  for (const [name, respond] of scenarios) await t.test(name, async () => {
    const pair = makePair();
    const client = new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole }, {
      query(text, values) {
        const rows = respond(pair, text);
        if (rows) return { rows };
        return defaultRows(pair, text);
      },
    });
    await assert.rejects(observePostgresEvidence(pair, { clientFactory: () => client }), error => {
      assert.equal(error.message, PG_EVIDENCE_DENIED);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(client.ended, 1);
  });
});

function defaultRows(pair, text) {
  if (text === 'BEGIN READ ONLY' || text === 'ROLLBACK') return { rows: [] };
  if (text.includes('current_database()')) return { rows: [{ database: pair.record.database, current_user: pair.record.migrationRole, session_user: pair.record.migrationRole }] };
  if (text.includes('pg_roles')) return { rows: [{ rolname: pair.record.migrationRole, rolsuper: false, rolcreatedb: false, rolcreaterole: false }] };
  if (text.includes('pg_database')) return { rows: [{ datname: pair.record.database, owner: 'db_owner', can_connect: true }] };
  if (text.includes("nspname = 'public'")) return { rows: [{ name: 'public', owner: 'schema_owner', can_use: true, can_create: false }] };
  if (text.includes('pg_class')) return { rows: [] };
  if (text.includes('pg_namespace')) return { rows: [{ name: 'public' }] };
  throw new Error('unexpected query');
}

test('captures pair and methods before awaits; a never-settling connection is bounded and ended once', async () => {
  const pair = makePair();
  let rejectConnect;
  let client;
  let received;
  let connects = 0;
  const clientFactory = config => {
    received = config;
    client = new MemoryClient(config);
    client.connect = () => { connects++; return new Promise((_, reject) => { rejectConnect = reject; }); };
    return client;
  };
  const pending = observePostgresEvidence(pair, { clientFactory });
  pair.secret.migrationPassword = 'mutated';
  pair.record.database = 'mutated';
  await assert.rejects(pending, error => error.message === PG_EVIDENCE_DENIED);
  assert.equal(connects, 1);
  assert.equal(/^[a-f0-9]{64}$/.test(received.password), true);
  assert.equal(received.password === 'mutated', false);
  assert.equal(client.ended, 1);
  rejectConnect?.(new Error(pair.secret.migrationPassword));
  client.emit('error', new Error(pair.secret.migrationPassword));
  await Promise.resolve();
});

test('cleanup failure denies without exposing driver details', async () => {
  const pair = makePair();
  const client = new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole });
  client.end = async () => { client.ended++; throw new Error(pair.secret.migrationPassword); };
  await assert.rejects(observePostgresEvidence(pair, { clientFactory: () => client }), error => {
    assert.equal(error.message, PG_EVIDENCE_DENIED);
    assert.equal(error.cause, undefined);
    assert.equal(error.message.includes(pair.secret.migrationPassword), false);
    return true;
  });
  assert.equal(client.ended, 1);
});

test('denies a driver error emitted during resolved close', async () => {
  const pair = makePair();
  const client = new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole });
  client.end = async () => {
    client.ended++;
    client.emit('error', new Error(pair.secret.migrationPassword));
  };
  await assert.rejects(observePostgresEvidence(pair, { clientFactory: () => client }), error => error.message === PG_EVIDENCE_DENIED);
  assert.equal(client.ended, 1);
});

test('captures callable end before rejecting an invalid query method', async () => {
  const pair = makePair();
  const client = new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole });
  client.query = null;
  await assert.rejects(observePostgresEvidence(pair, { clientFactory: () => client }), error => error.message === PG_EVIDENCE_DENIED);
  assert.equal(client.ended, 1);
});

test('poisons default pg connect to prove injected tests never touch the real client', async () => {
  const pg = await import('pg');
  const original = pg.Client.prototype.connect;
  let connects = 0;
  pg.Client.prototype.connect = function () { connects++; throw new Error('real connect forbidden'); };
  try {
    const pair = makePair();
    const evidence = await observePostgresEvidence(pair, { clientFactory: () => new MemoryClient({ database: pair.record.database, user: pair.record.migrationRole }) });
    assert.equal(evidence.source, 'injected-client');
    assert.equal(connects, 0);
  } finally {
    pg.Client.prototype.connect = original;
  }
});

test('default pg client receives explicit target settings with connect poisoned before networking', async () => {
  const pg = await import('pg');
  const originalConnect = pg.Client.prototype.connect;
  const originalEnd = pg.Client.prototype.end;
  let connects = 0;
  let ends = 0;
  pg.Client.prototype.connect = function () {
    connects++;
    assert.equal(this.host, '127.0.0.1');
    assert.equal(this.port, this.config.port);
    assert.equal(this.database, this.config.database);
    assert.equal(this.user, this.config.user);
    assert.equal(this.password === this.config.password, true);
    assert.equal(this.ssl, false);
    assert.equal(this.connectionParameters.application_name, 'h1-pg-evidence');
    assert.equal(this.connectionParameters.client_encoding, 'UTF8');
    assert.equal(this.connectionParameters.options, '-c default_transaction_read_only=on');
    assert.equal(this.connectionParameters.replication, 'false');
    assert.equal(this.replication, 'false');
    assert.equal(this.connectionParameters.sslnegotiation, 'postgres');
    assert.equal(this.sslNegotiation, 'postgres');
    assert.equal(this.connectionParameters.binary, true);
    assert.equal(this.binary, false);
    assert.equal(this.connectionParameters.statement_timeout, 2500);
    assert.equal(this.connectionParameters.query_timeout, 2500);
    assert.equal(this.connectionParameters.connect_timeout, 3);
    throw new Error('poisoned before socket creation');
  };
  pg.Client.prototype.end = async function () { ends++; };
  try {
    const pair = makePair();
    await assert.rejects(observePostgresEvidence(pair), error => error.message === PG_EVIDENCE_DENIED);
    assert.equal(connects, 1);
    assert.equal(ends, 1);
  } finally {
    pg.Client.prototype.connect = originalConnect;
    pg.Client.prototype.end = originalEnd;
  }
});
