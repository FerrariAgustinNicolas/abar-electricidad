import pg from 'pg';
import { validatePair } from './h1-owned-postgres.mjs';

export const PG_EVIDENCE_DENIED = 'H1 PostgreSQL observation denied.';
const LIMITS = Object.freeze({ schemas: 64, tables: 128, nameBytes: 128 });
const DEADLINES = Object.freeze({ overall: 15000, connect: 3000, query: 2500, close: 1000 });
const deny = () => { throw new Error(PG_EVIDENCE_DENIED); };
const ownData = (object, key) => {
  if (!object || typeof object !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && 'value' in descriptor && descriptor.enumerable ? descriptor.value : undefined;
};
function exactRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && descriptor.enumerable;
  });
}
function clonePair(pair) {
  if (!validatePair(pair)) deny();
  const record = JSON.parse(JSON.stringify(pair.record));
  const secret = JSON.parse(JSON.stringify(pair.secret));
  if (record.state !== 'provisioned') deny();
  return { record, secret };
}
function methodValue(object, name) {
  for (let current = object; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (!descriptor) continue;
    if (!('value' in descriptor) || typeof descriptor.value !== 'function') deny();
    return descriptor.value;
  }
  deny();
}
function optionsFactory(options) {
  if (options === undefined) return { factory: config => {
    const client = new pg.Client(config);
    // pg's truthy PGBINARY fallback is suppressed by explicit true; retain text results for catalog rows.
    client.binary = false;
    return client;
  }, injected: false };
  if (!exactRecord(options, ['clientFactory'])) deny();
  const descriptor = Object.getOwnPropertyDescriptor(options, 'clientFactory');
  if (!descriptor || typeof descriptor.value !== 'function') deny();
  return { factory: descriptor.value, injected: true };
}
function bounded(promise, ms) {
  let timer;
  const work = Promise.resolve(promise);
  // Both eventual outcomes are handled, including work that settles after its deadline.
  work.then(() => {}, () => {});
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('deadline')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
function wellFormed(value) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function byteName(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0') && wellFormed(value)
    && Buffer.byteLength(value, 'utf8') <= LIMITS.nameBytes;
}
function denseArray(value) {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes('length')) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
  }
  return true;
}
function resultRows(result, cap) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) deny();
  const allowed = new Set(['rows', 'command', 'rowCount', 'oid', 'fields', '_parsers', '_types', 'RowCtor',
    'rowAsArray', 'parseRow', '_parseRowAsArray', '_prebuiltEmptyResultObject']);
  const keys = Reflect.ownKeys(result);
  if (!keys.includes('rows') || keys.some(key => typeof key !== 'string' || !allowed.has(key))) deny();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (!descriptor || !('value' in descriptor)) deny();
  }
  const descriptor = Object.getOwnPropertyDescriptor(result, 'rows');
  const rows = descriptor?.value;
  if (!descriptor?.enumerable || !denseArray(rows) || rows.length > cap + 1) deny();
  const rowCount = ownData(result, 'rowCount');
  if (rowCount !== undefined && rowCount !== null && rowCount !== rows.length) deny();
  return rows;
}
function rowsOf(result, expectedCount, cap) {
  const rows = resultRows(result, cap);
  if (rows.length !== expectedCount) deny();
  return rows;
}
function oneRow(result, keys) {
  const rows = rowsOf(result, 1, 1);
  const row = rows[0];
  if (!exactRecord(row, keys)) deny();
  return row;
}
function manyRows(result, keys, cap) {
  const rowsValue = resultRows(result, cap);
  if (rowsValue.length > cap) deny();
  return rowsValue.map(row => {
    if (!exactRecord(row, keys)) deny();
    return row;
  });
}
function names(rows, key) {
  const list = rows.map(row => row[key]);
  if (list.some(value => !byteName(value)) || new Set(list).size !== list.length) deny();
  return list.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const SQL = Object.freeze({
  identity: 'SELECT current_database() AS database, current_user AS current_user, session_user AS session_user',
  role: 'SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = $1 LIMIT 2',
  database: "SELECT d.datname, pg_catalog.pg_get_userbyid(d.datdba) AS owner, pg_catalog.has_database_privilege($2, d.oid, 'CONNECT') AS can_connect FROM pg_catalog.pg_database AS d WHERE d.datname = $1 LIMIT 2",
  publicSchema: "SELECT nspname AS name, pg_catalog.pg_get_userbyid(nspowner) AS owner, pg_catalog.has_schema_privilege($1, oid, 'USAGE') AS can_use, pg_catalog.has_schema_privilege($1, oid, 'CREATE') AS can_create FROM pg_catalog.pg_namespace WHERE nspname = 'public' LIMIT 2",
  schemas: "SELECT nspname AS name FROM pg_catalog.pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LIMIT 65",
  tables: "SELECT n.nspname AS schema, c.relname AS name FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' ORDER BY n.nspname, c.relname LIMIT 129",
});

/** Observe a bounded snapshot of catalog facts; this is not ownership or migration authority. */
export async function observePostgresEvidence(pair, options) {
  let client;
  let end;
  let connect;
  let query;
  let deadlineTimer;
  let driverError = false;
  let operationExpired = false;
  let ended = false;
  try {
    const snapshot = clonePair(pair);
    const { factory, injected } = optionsFactory(options);
    const { record, secret } = snapshot;
    const config = Object.freeze({
      host: '127.0.0.1', port: record.resource.endpoint.port,
      database: record.database, user: record.migrationRole, password: secret.migrationPassword,
      ssl: false, application_name: 'h1-pg-evidence', client_encoding: 'UTF8',
      binary: true, replication: 'false', sslnegotiation: 'postgres',
      options: '-c default_transaction_read_only=on',
      connectionTimeoutMillis: DEADLINES.connect, query_timeout: DEADLINES.query,
      statement_timeout: DEADLINES.query,
    });
    client = factory(config);
    if (!client || typeof client !== 'object') deny();
    end = methodValue(client, 'end').bind(client);
    connect = methodValue(client, 'connect').bind(client);
    query = methodValue(client, 'query').bind(client);
    const on = methodValue(client, 'on');
    on.call(client, 'error', () => { driverError = true; });
    const run = async () => {
      await bounded(connect(), DEADLINES.connect);
      if (driverError || operationExpired) deny();
      const ask = async (text, values) => {
        if (driverError || operationExpired) deny();
        const result = await bounded(query(text, values), DEADLINES.query);
        if (driverError || operationExpired) deny();
        return result;
      };
      await ask('BEGIN READ ONLY');
      const identityRow = oneRow(await ask(SQL.identity), ['database', 'current_user', 'session_user']);
      if (!byteName(identityRow.database) || !byteName(identityRow.current_user) || !byteName(identityRow.session_user)
        || identityRow.database !== record.database || identityRow.current_user !== record.migrationRole
        || identityRow.session_user !== record.migrationRole) deny();
      const role = oneRow(await ask(SQL.role, [record.migrationRole]), ['rolname', 'rolsuper', 'rolcreatedb', 'rolcreaterole']);
      if (role.rolname !== record.migrationRole || typeof role.rolsuper !== 'boolean'
        || typeof role.rolcreatedb !== 'boolean' || typeof role.rolcreaterole !== 'boolean') deny();
      const database = oneRow(await ask(SQL.database, [record.database, record.migrationRole]), ['datname', 'owner', 'can_connect']);
      if (database.datname !== record.database || !byteName(database.owner) || typeof database.can_connect !== 'boolean') deny();
      const publicSchema = oneRow(await ask(SQL.publicSchema, [record.migrationRole]), ['name', 'owner', 'can_use', 'can_create']);
      if (publicSchema.name !== 'public' || !byteName(publicSchema.owner)
        || typeof publicSchema.can_use !== 'boolean' || typeof publicSchema.can_create !== 'boolean') deny();
      const schemaRows = manyRows(await ask(SQL.schemas), ['name'], LIMITS.schemas);
      const schemaNames = names(schemaRows, 'name');
      if (!schemaNames.includes('public')) deny();
      const tableRows = manyRows(await ask(SQL.tables), ['schema', 'name'], LIMITS.tables);
      const tables = tableRows.map(row => {
        if (!byteName(row.schema) || !byteName(row.name) || !schemaNames.includes(row.schema)) deny();
        return { schema: row.schema, name: row.name };
      });
      const tableKeys = tables.map(row => `${row.schema}\0${row.name}`);
      if (new Set(tableKeys).size !== tableKeys.length) deny();
      tables.sort((a, b) => (a.schema < b.schema ? -1 : a.schema > b.schema ? 1 : 0)
        || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      await ask('ROLLBACK');
      return deepFreeze({
        evidenceKind: 'postgres-catalog-observation', source: injected ? 'injected-client' : 'pg-client',
        identity: { database: identityRow.database, currentUser: identityRow.current_user, sessionUser: identityRow.session_user },
        roleAttributes: { superuser: role.rolsuper, createdb: role.rolcreatedb, createrole: role.rolcreaterole },
        database: { exists: true, owner: database.owner, grants: { connect: database.can_connect } },
        publicSchema: { owner: publicSchema.owner, grants: { usage: publicSchema.can_use, create: publicSchema.can_create } },
        schemas: schemaNames, tables,
      });
    };
    const work = run();
    work.then(() => {}, () => {});
    const timed = new Promise((_, reject) => {
      deadlineTimer = setTimeout(() => { operationExpired = true; reject(new Error('deadline')); }, DEADLINES.overall);
    });
    const evidence = await Promise.race([work, timed]);
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
    return evidence;
  } catch {
    deny();
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (end && !ended) {
      ended = true;
      try {
        await bounded(end(), DEADLINES.close);
        if (driverError) deny();
      } catch { deny(); }
    }
  }
}
