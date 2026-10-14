import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { runInThisContext } from 'node:vm';
import { PrismaService } from '../prisma/prisma.service';
import { CsrfNonceCipher } from './csrf-nonce.cipher';
import type { AuthConfig } from './auth.config';
import { ChangePasswordService, readChangePasswordError,
  type ChangePasswordDependencies, type ChangePasswordRequest } from './change-password.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('./csrf-nonce.cipher', () => ({ CsrfNonceCipher: jest.fn() }));

type SeedBinding = Readonly<{
  kind: 'session'; hashedId: string; version: number; aad: Buffer; nonce: Buffer;
  envelope: Readonly<{ ciphertext: Buffer; iv: Buffer; tag: Buffer }>;
}>;


type ModelRows<Account, Session> = {
  accounts: Account[];
  sessions: Session[];
  writes: number;
};
type ModelPort<Account, Session> = {
  read<Value>(select: (rows: ModelRows<Account, Session>) => Value): Value;
  write(change: (rows: ModelRows<Account, Session>) => void, accepted?: (buffer: ModelRows<Account, Session>) => void): void;
};
type RowCopies<Account, Session> = {
  clone(rows: ModelRows<Account, Session>): ModelRows<Account, Session>;
  equal(left: ModelRows<Account, Session>, right: ModelRows<Account, Session>): boolean;
};

// Unexecuted draft. Helpers must be pure, deep, Buffer/Date-aware and exhaustive.
// Generic field names are NOT an integration with the historical foundation.
function makeTransactionKernel<Account, Session>(
  root: ModelRows<Account, Session>, copies: RowCopies<Account, Session>,
  changed: (before: ModelRows<Account, Session>, after: ModelRows<Account, Session>) => number,
) {
  function checkArray(array: unknown): asserts array is unknown[] {
    if (types.isProxy(array) || !Array.isArray(array) ||
        Object.getPrototypeOf(array) !== Array.prototype || !Object.isExtensible(array)) {
      throw new Error('MODEL_UNSUPPORTED_ARRAY');
    }
    const keys = Reflect.ownKeys(array);
    if (keys.length !== array.length + 1) throw new Error('MODEL_UNSUPPORTED_ARRAY');
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(array, key)!;
      if (key === 'length') {
        if (!field.writable) throw new Error('MODEL_UNSUPPORTED_ARRAY');
      } else if (typeof key !== 'string' || String(Number(key)) !== key ||
                 !Number.isInteger(Number(key)) || Number(key) < 0 ||
                 Number(key) >= array.length || !('value' in field) ||
                 !field.writable || !field.configurable) {
        throw new Error('MODEL_UNSUPPORTED_ARRAY');
      }
    }
  }
  function fields(rows: ModelRows<Account, Session>) {
    if (types.isProxy(rows)) throw new Error('MODEL_UNSUPPORTED_ROWS');
    const accountField = Object.getOwnPropertyDescriptor(rows, 'accounts');
    const sessionField = Object.getOwnPropertyDescriptor(rows, 'sessions');
    const writesField = Object.getOwnPropertyDescriptor(rows, 'writes');
    if (!accountField || !sessionField || !writesField ||
        !('value' in accountField) || !('value' in sessionField) ||
        !('value' in writesField) || !writesField.writable) {
      throw new Error('MODEL_UNSUPPORTED_ROWS');
    }
    checkArray(accountField.value);
    checkArray(sessionField.value);
    return { accounts: accountField.value, sessions: sessionField.value, writes: writesField };
  }
  const arrays = fields(root);
  let owner: symbol | undefined;
  let admissionAborts = 0;

  function replace<Value>(target: Value[], source: Value[]) {
    for (let index = 0; index < source.length; index++) {
      Object.defineProperty(target, String(index), {
        value: source[index], writable: true, enumerable: true, configurable: true,
      });
    }
    target.length = source.length;
  }
  function publish(next: ModelRows<Account, Session>, baseline: ModelRows<Account, Session>) {
    const prepared = copies.clone(next);
    const incoming = fields(prepared);
    const current = fields(root);
    if (current.accounts !== arrays.accounts || current.sessions !== arrays.sessions ||
        !copies.equal(root, baseline)) throw new Error('MODEL_FOREIGN_ROOT_CHANGE');
    // Validated ordinary data arrays: no spread, hooks, accessors, proxies or awaits.
    replace(current.accounts, incoming.accounts);
    replace(current.sessions, incoming.sessions);
    Object.defineProperty(root, 'writes', { ...current.writes, value: incoming.writes.value });
  }

  const outside: ModelPort<Account, Session> = {
    read<Value>(select: (rows: ModelRows<Account, Session>) => Value): Value {
      if (owner !== undefined) throw new Error('MODEL_ROOT_DURING_TRANSACTION');
      return select(copies.clone(root));
    },
    write(change: (rows: ModelRows<Account, Session>) => void, accepted?: (buffer: ModelRows<Account, Session>) => void): void {
      if (owner !== undefined) throw new Error('MODEL_ROOT_DURING_TRANSACTION');
      const baseline = copies.clone(root);
      const candidate = copies.clone(baseline);
      if (change(candidate) !== undefined) throw new Error('MODEL_ASYNC_MUTATOR');
      const next = copies.clone(candidate);
      next.writes = baseline.writes + changed(baseline, next);
      accepted?.(copies.clone(next));
      publish(next, baseline);
    },
  };

  async function transaction<Value>(
    work: (tx: ModelPort<Account, Session>) => Promise<Value>,
  ): Promise<Value> {
    if (owner !== undefined) {
      admissionAborts++;
      throw new Error('MODEL_TRANSACTION_ACTIVE');
    }
    const token = Symbol('owned-row-transaction');
    owner = token;
    let failed = false;
    let failure: unknown;
    function guard() {
      if (owner !== token) throw new Error('MODEL_CLOSED_TRANSACTION');
      if (failed) throw failure;
    }
    function attempt<Result>(operation: () => Result): Result {
      guard();
      try {
        return operation();
      } catch (error) {
        if (!failed) { failed = true; failure = error; }
        throw error;
      }
    }
    try {
      const baseline = copies.clone(root);
      let next = copies.clone(baseline);
      const tx: ModelPort<Account, Session> = {
        read<Value>(select: (rows: ModelRows<Account, Session>) => Value): Value {
          return attempt(() => select(copies.clone(next)));
        },
        write(change: (rows: ModelRows<Account, Session>) => void, accepted?: (buffer: ModelRows<Account, Session>) => void): void {
          attempt(() => {
            const candidate = copies.clone(next);
            if (change(candidate) !== undefined) throw new Error('MODEL_ASYNC_MUTATOR');
            guard();
            next = copies.clone(candidate);
            next.writes = baseline.writes + changed(baseline, next);
            accepted?.(copies.clone(next));
          });
        },
      };
      const result = await work(tx);
      guard();
      publish(next, baseline);
      return result;
    } finally {
      owner = undefined;
    }
  }
  return { outside, transaction, admissionAborts: () => admissionAborts };
}

type Row = Record<string, unknown>;
type Kind = 'accounts' | 'sessions';
type Field = 'text' | 'bool' | 'int' | 'date' | 'bytes' | 'nullableDate';
const columns: Record<Kind, Record<string, Field>> = {
  accounts: { id: 'text', name: 'text', email: 'text', passwordHash: 'text', active: 'bool',
    mustChangePassword: 'bool', version: 'int', createdAt: 'date', updatedAt: 'date' },
  sessions: { id: 'text', adminUserId: 'text', nonceCiphertext: 'bytes', nonceIv: 'bytes',
    nonceTag: 'bytes', nonceVersion: 'int', createdAt: 'date', lastActivityAt: 'date',
    absoluteExpiresAt: 'date', idleExpiresAt: 'date', revokedAt: 'nullableDate' },
};
const fail = (): never => { throw new Error('MODEL_UNSUPPORTED'); };
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return fail();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return fail();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !('value' in Object.getOwnPropertyDescriptor(value, key)!)) return fail();
  }
  return value as Row;
}
const nativeLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length')!.get!;
function scalar(value: unknown): unknown {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) return fail();
  if (types.isDate(value) && Object.getPrototypeOf(value) === Date.prototype) {
    return new Date(Date.prototype.getTime.call(value));
  }
  if (types.isUint8Array(value) && [Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(value))) {
    const length: number = nativeLength.call(value);
    if (Reflect.ownKeys(value).length !== length) return fail();
    const output = Buffer.alloc(length);
    for (let index = 0; index < length; index++) {
      const field = Object.getOwnPropertyDescriptor(value, String(index));
      if (!field || !('value' in field)) return fail();
      output[index] = field.value;
    }
    return output;
  }
  return fail();
}
function copyRow(value: Row, kind: Kind): Row {
  const input = record(value);
  if (Object.keys(input).length !== Object.keys(columns[kind]).length) return fail();
  const output: Row = Object.create(null);
  for (const key of Object.keys(columns[kind])) {
    if (!Object.hasOwn(input, key)) return fail();
    output[key] = scalar(input[key]);
  }
  return output;
}
function same(a: unknown, b: unknown): boolean {
  if (types.isDate(a) && types.isDate(b)) return Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b));
  if (types.isUint8Array(a) && types.isUint8Array(b)) return Buffer.from(a).equals(Buffer.from(b));
  return Object.is(a, b);
}
function dense(value: unknown): asserts value is Row[] {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  if (Reflect.ownKeys(value).length !== value.length + 1) return fail();
  for (let index = 0; index < value.length; index++) {
    if (!('value' in (Object.getOwnPropertyDescriptor(value, String(index)) ?? {}))) return fail();
  }
}
const copies: RowCopies<Row, Row> = {
  clone(rows) {
    record(rows);
    dense(rows.accounts);
    dense(rows.sessions);
    if (!Number.isSafeInteger(rows.writes) || rows.writes < 0) return fail();
    return { accounts: rows.accounts.map(row => copyRow(row, 'accounts')),
      sessions: rows.sessions.map(row => copyRow(row, 'sessions')), writes: rows.writes };
  },
  equal(left, right) {
    const a = this.clone(left);
    const b = this.clone(right);
    return a.writes === b.writes && (['accounts', 'sessions'] as const).every(kind =>
      a[kind].length === b[kind].length && a[kind].every((row: Row, index: number) =>
        Object.keys(columns[kind]).every(key => same(row[key], b[kind][index][key]))));
  },
};
function valid(value: unknown, field: Field): boolean {
  if (field === 'text') return typeof value === 'string';
  if (field === 'bool') return typeof value === 'boolean';
  if (field === 'int') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;
  if (field === 'nullableDate' && value === null) return true;
  if (field === 'date' || field === 'nullableDate') return types.isDate(value) && Number.isFinite(Date.prototype.getTime.call(value));
  return types.isUint8Array(value) && !types.isProxy(value);
}
function operand(value: unknown, field: Field): unknown {
  if (!valid(value, field)) return fail();
  return scalar(value);
}
type SqlTruth = boolean | null;
function allTruth(values: SqlTruth[]): SqlTruth {
  return values.includes(false) ? false : values.includes(null) ? null : true;
}
function anyTruth(values: SqlTruth[]): SqlTruth {
  return values.includes(true) ? true : values.includes(null) ? null : false;
}
function filter(kind: Kind, input: unknown): (row: Row, rows: ModelRows<Row, Row>) => SqlTruth {
  const predicates = Object.entries(record(input)).map(([key, value]) => {
    if (['AND', 'OR', 'NOT'].includes(key)) {
      const items = Array.isArray(value) ? value : [value];
      dense(items);
      if (items.length === 0) return fail();
      const tests = items.map(item => filter(kind, item));
      return (row: Row, rows: ModelRows<Row, Row>) => {
        const values = tests.map(test => test(row, rows));
        return key === 'OR' ? anyTruth(values) :
          allTruth(key === 'NOT' ? values.map(value => value === null ? null : !value) : values);
      };
    }
    if (kind === 'sessions' && key === 'adminUser') {
      const relation = record(value);
      if (Object.keys(relation).join() !== 'is') return fail();
      const test = filter('accounts', relation.is);
      return (row: Row, rows: ModelRows<Row, Row>) => rows.accounts.some(owner =>
        owner.id === row.adminUserId && test(owner, rows) === true);
    }
    if (!Object.hasOwn(columns[kind], key)) return fail();
    const field = columns[kind][key];
    if (value === null || typeof value !== 'object' || types.isDate(value) || types.isUint8Array(value)) {
      const expected = operand(value, field);
      return (row: Row) => field === 'nullableDate' && row[key] === null && expected !== null ?
        null : same(row[key], expected);
    }
    const operations = Object.entries(record(value));
    if (!operations.length) return fail();
    const tests = operations.map(([operator, expected]) => {
      if (!['equals', 'not', 'gt', 'gte', 'lt', 'lte'].includes(operator)) return fail();
      const target = operand(expected, field);
      if (operator === 'equals' || operator === 'not') return (actual: unknown) =>
        field === 'nullableDate' && actual === null && target !== null ? null :
          operator === 'equals' ? same(actual, target) : !same(actual, target);
      if (field !== 'date' && field !== 'nullableDate' && field !== 'int') return fail();
      return (actual: unknown) => {
        if (actual === null) return null;
        const left = types.isDate(actual) ? Date.prototype.getTime.call(actual) : actual;
        const right = types.isDate(target) ? Date.prototype.getTime.call(target) : target;
        if (typeof left !== 'number' || typeof right !== 'number') return fail();
        return operator === 'gt' ? left > right : operator === 'gte' ? left >= right :
          operator === 'lt' ? left < right : left <= right;
      };
    });
    return (row: Row) => allTruth(tests.map(test => test(row[key])));
  });
  return (row, rows) => allTruth(predicates.map(test => test(row, rows)));
}
function where(kind: Kind, input: unknown): (row: Row, rows: ModelRows<Row, Row>) => boolean {
  const test = filter(kind, input);
  return (row, rows) => test(row, rows) === true;
}
function selection(kind: Kind, input: unknown): (row: Row, rows: ModelRows<Row, Row>) => Row {
  if (input === undefined) return row => copyRow(row, kind);
  const entries = Object.entries(record(input));
  if (!entries.length) return fail();
  const project = entries.map(([key, value]) => {
    if (kind === 'sessions' && key === 'adminUser') {
      const nested = record(value);
      if (Object.keys(nested).join() !== 'select') return fail();
      const select = selection('accounts', nested.select);
      return (row: Row, rows: ModelRows<Row, Row>) => {
        const owner = rows.accounts.find(item => item.id === row.adminUserId);
        return [key, owner ? select(owner, rows) : null] as const;
      };
    }
    if (!Object.hasOwn(columns[kind], key) || value !== true) return fail();
    return (row: Row) => [key, scalar(row[key])] as const;
  });
  return (row, rows) => Object.fromEntries(project.map(select => select(row, rows)));
}
function patch(kind: Kind, input: unknown): (row: Row) => void {
  const entries = Object.entries(record(input));
  if (!entries.length) return fail();
  const changes = entries.map(([key, value]) => {
    if (!Object.hasOwn(columns[kind], key)) return fail();
    const field = columns[kind][key];
    if (key === 'id' || key === 'createdAt') return fail();
    if (field === 'int' && value && typeof value === 'object') {
      const change = record(value);
      if (Object.keys(change).join() !== 'increment' || !valid(change.increment, 'int')) return fail();
      const amount = change.increment;
      if (typeof amount !== 'number') return fail();
      return (row: Row) => {
        if (typeof row[key] !== 'number') return fail();
        const next = row[key] + amount;
        if (!valid(next, 'int')) return fail();
        row[key] = next;
      };
    }
    const next = operand(value, field);
    return (row: Row) => { row[key] = scalar(next); };
  });
  return row => changes.forEach(change => change(row));
}

type MockEnvelope = Readonly<{ ciphertext: Buffer; iv: Buffer; tag: Buffer }>;

// Closed fixture constructor: trusted fresh SeedBinding records only.
// Public method arguments are untrusted and validated without getter reads.
// Registry lifetime/counters are separate from protected database ROWS.
function makeMockCipher(bindings: ReadonlyArray<SeedBinding>) {
  const entries = new Map<string, Buffer>();
  let ready = true;
  let serial = 0;
  let encryptions = 0;
  let decryptions = 0;
  const lengthGetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype), 'length',
  )!.get!;

  function reject(): never { throw new Error('MODEL_CIPHER_UNAVAILABLE'); }
  function bytes(value: unknown, size: number): Buffer {
    if (typeof value !== 'object' || value === null || types.isProxy(value) ||
        !types.isUint8Array(value) || Object.getPrototypeOf(value) !== Buffer.prototype ||
        lengthGetter.call(value) !== size || Reflect.ownKeys(value).length !== size) reject();
    const copy = Buffer.alloc(size);
    for (let index = 0; index < size; index++) {
      const field = Object.getOwnPropertyDescriptor(value, String(index));
      if (!field || !('value' in field)) reject();
      copy[index] = field.value;
    }
    return copy;
  }
  function context(kind: unknown, id: unknown, version: unknown): Buffer {
    if ((kind !== 'session' && kind !== 'preauth') || typeof id !== 'string' ||
        !/^[a-f0-9]{64}$/.test(id) || typeof version !== 'number' ||
        !Number.isSafeInteger(version) || version < 1) reject();
    return Buffer.from(['abar-csrf-v1', kind, id, String(version)].join('\0'), 'utf8');
  }
  function envelope(value: unknown): MockEnvelope {
    if (typeof value !== 'object' || value === null || types.isProxy(value)) reject();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 3 || !keys.every((key) =>
        key === 'ciphertext' || key === 'iv' || key === 'tag')) reject();
    function field(key: 'ciphertext' | 'iv' | 'tag', size: number): Buffer {
      const data = Object.getOwnPropertyDescriptor(value, key);
      if (!data || !('value' in data)) reject();
      return bytes(data.value, size);
    }
    return { ciphertext: field('ciphertext', 32), iv: field('iv', 12), tag: field('tag', 16) };
  }
  function key(aad: Buffer, value: MockEnvelope): string {
    return [aad, value.ciphertext, value.iv, value.tag].map((part) => part.toString('hex')).join(':');
  }

  for (const binding of bindings) {
    const aad = context(binding.kind, binding.hashedId, binding.version);
    if (!aad.equals(bytes(binding.aad, aad.length))) reject();
    const stored = bytes(binding.nonce, 32);
    const registered = key(aad, envelope(binding.envelope));
    if (entries.has(registered)) reject();
    entries.set(registered, stored);
  }

  return {
    get available(): boolean { return ready; },
    set available(value: boolean) {
      if (typeof value !== 'boolean') reject();
      ready = value;
    },
    encrypt(kind: 'session' | 'preauth', id: string, version: number, nonce: Buffer): MockEnvelope {
      if (!ready) reject();
      const aad = context(kind, id, version);
      const stored = bytes(nonce, 32);
      if (!Number.isSafeInteger(encryptions + 1)) reject();
      let candidate = serial;
      let issued: MockEnvelope;
      let registered: string;
      do {
        candidate++;
        if (!Number.isSafeInteger(candidate)) reject();
        issued = { ciphertext: Buffer.alloc(32), iv: Buffer.alloc(12), tag: Buffer.alloc(16) };
        for (const part of [issued.ciphertext, issued.iv, issued.tag]) {
          part.writeBigUInt64BE(BigInt(candidate), 0);
        }
        registered = key(aad, issued);
      } while (entries.has(registered));
      const output = envelope(issued);
      entries.set(registered, stored);
      serial = candidate;
      encryptions++;
      return output;
    },
    decrypt(kind: 'session' | 'preauth', id: string, version: number, input: MockEnvelope): Buffer {
      if (!ready) reject();
      const aad = context(kind, id, version);
      const stored = entries.get(key(aad, envelope(input)));
      if (!stored || !Number.isSafeInteger(decryptions + 1)) reject();
      const output = Buffer.from(stored);
      decryptions++;
      return output;
    },
    stats() {
      return Object.freeze({ registered: entries.size, encryptions, decryptions });
    },
  };
}

// Model counter: distinct rows with a changed committed scalar state, never query count.
function changedRows(before: ModelRows<Row, Row>, after: ModelRows<Row, Row>): number {
  let count = 0;
  for (const kind of ['accounts', 'sessions'] as const) {
    for (const row of before[kind]) {
      const next = after[kind].find(item => item.id === row.id);
      if (!next || Object.keys(columns[kind]).some(key => !same(row[key], next[key]))) count++;
    }
    count += after[kind].filter(row => !before[kind].some(old => old.id === row.id)).length;
  }
  return count;
}
function integrity(rows: ModelRows<Row, Row>): void {
  for (const kind of ['accounts', 'sessions'] as const) {
    if (rows[kind].some(row => Object.entries(columns[kind]).some(([key, field]) =>
      !valid(row[key], field)))) return fail();
    const ids = rows[kind].map(row => row.id);
    if (new Set(ids).size !== ids.length) return fail();
  }
  const emails = rows.accounts.map(row => row.email);
  if (new Set(emails).size !== emails.length) return fail();
  if (rows.sessions.some(row => !rows.accounts.some(owner => owner.id === row.adminUserId))) return fail();
}
type Hook = (stage: string, reply?: Row, rows?: ModelRows<Row, Row>, mutations?: number) => void;
function facade(port: ModelPort<Row, Row>, now: () => number, hook: Hook) {
  function delegate(kind: Kind) {
    return {
      async findUnique(input: unknown) {
        return port.read(rows => {
          hook('schema:read', undefined, rows);
          const checked = copies.clone(rows);
          integrity(checked);
          const args = record(input);
          if (!Object.keys(args).every(key => ['where', 'select'].includes(key))) return fail();
          const lookup = record(args.where);
          if (typeof lookup.id !== 'string') return fail();
          const test = where(kind, lookup);
          const select = selection(kind, args.select);
          const row = checked[kind].find(item => test(item, checked));
          const reply = row ? select(row, checked) : null;
          hook(kind + ':read', reply ?? undefined);
          return reply;
        });
      },
      async updateMany(input: unknown) {
        let count = 0;
        let mutations = 0;
        port.write(rows => {
          const previous = copies.clone(rows);
          const args = record(input);
          if (Object.keys(args).sort().join() !== 'data,where') return fail();
          const test = where(kind, args.where);
          const change = patch(kind, args.data);
          for (const row of rows[kind]) {
            if (!test(row, rows)) continue;
            change(row);
            if (kind === 'accounts') row.updatedAt = new Date(now());
            count++;
          }
          integrity(rows);
          mutations = changedRows(previous, rows);
        }, buffer => hook(kind + ':write', undefined, buffer, mutations));
        return { count };
      },
      async create(input: unknown) {
        if (kind !== 'sessions') return fail();
        let result: Row | undefined;
        port.write(rows => {
          const args = record(input);
          if (!Object.keys(args).every(key => ['data', 'select'].includes(key))) return fail();
          const data = record(args.data);
          const select = selection(kind, args.select);
          if (!Object.keys(data).every(key => Object.hasOwn(columns[kind], key))) return fail();
          const row: Row = { nonceVersion: 1, revokedAt: null, createdAt: new Date(now()),
            lastActivityAt: new Date(now()), ...data };
          for (const [key, field] of Object.entries(columns[kind])) {
            if (!valid(row[key], field)) return fail();
            row[key] = scalar(row[key]);
          }
          if (typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.id)) return fail();
          if (rows.sessions.some(item => item.id === row.id)) return fail();
          if (!rows.accounts.some(item => item.id === row.adminUserId)) return fail();
          for (const [key, size] of [['nonceCiphertext', 32], ['nonceIv', 12], ['nonceTag', 16]] as const) {
            if (!types.isUint8Array(row[key]) || nativeLength.call(row[key]) !== size) return fail();
          }
          rows.sessions.push(row);
          integrity(rows);
          result = select(row, rows);
        }, buffer => hook('sessions:create', undefined, buffer, 1));
        if (!result) return fail();
        return result;
      },
    };
  }
  return { adminUser: delegate('accounts'), authSession: delegate('sessions') };
}
const oldPassword = 'current-private-input';
const nextPassword = 'new-private-input-with-valid-length';
const oldPhc = 'private-phc-record';
const newPhc = 'private-new-phc';
const origin = 'http://localhost:4200';
const baseTime = Date.parse('2030-01-01T12:00:00Z');
const token = (byte: number) => Buffer.alloc(32, byte).toString('base64url');
const hashId = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const blocklistIndex = (value: string) => createHash('sha256')
  .update(value.normalize('NFC').toLowerCase(), 'utf8').digest('hex');
const config: AuthConfig = {
  allowedOrigins: [origin], cookieSecure: false, sessionAbsoluteSeconds: 3600, sessionIdleSeconds: 900,
  preAuthSeconds: 600, loginIpLimit: 10, loginIpWindowSeconds: 60, loginAccountLimit: 10,
  loginAccountWindowSeconds: 900, csrfIpLimit: 30, csrfIpWindowSeconds: 60,
  argon2Concurrency: 1, argon2QueueLimit: 2,
};
function fixture(restricted = true) {
  let time = baseTime;
  let hook: Hook = () => undefined;
  let admissionGate: (() => Promise<void>) | undefined;
  const registry = makeMockCipher([]);
  function account(id: string, mustChangePassword: boolean): Row {
    return { id, name: 'Model ' + id, email: id + '@example.invalid', passwordHash: oldPhc,
      active: true, mustChangePassword, version: 4, createdAt: new Date(baseTime - 86400000),
      updatedAt: new Date(baseTime - 60000) };
  }
  function session(byte: number, owner: string): Row {
    const id = hashId(token(byte));
    const envelope = registry.encrypt('session', id, 1, Buffer.alloc(32, byte + 1));
    return { id, adminUserId: owner, nonceVersion: 1, nonceCiphertext: envelope.ciphertext,
      nonceIv: envelope.iv, nonceTag: envelope.tag, createdAt: new Date(baseTime - 60000),
      lastActivityAt: new Date(baseTime), absoluteExpiresAt: new Date(baseTime + 3600000),
      idleExpiresAt: new Date(baseTime + 900000), revokedAt: null };
  }
  const owner = '00000000-0000-4000-8000-000000000001';
  const foreign = '00000000-0000-4000-8000-000000000002';
  const root: ModelRows<Row, Row> = {
    accounts: [account(owner, restricted), account(foreign, false)],
    sessions: [session(7, owner), session(9, owner), session(11, foreign), session(13, owner)], writes: 0,
  };
  root.sessions[3].revokedAt = new Date(baseTime - 10000);
  const kernel = makeTransactionKernel(root, copies, changedRows);
  const ports = facade(kernel.outside, () => time, (stage, reply, rows, mutations) => hook(stage, reply, rows, mutations));
  const transaction = async <T>(work: (tx: ReturnType<typeof facade>) => Promise<T>) => {
    hook('transaction:enter');
    await admissionGate?.();
    return kernel.transaction(async port => work(facade(port, () => time, (stage, reply, rows, mutations) => hook(stage, reply, rows, mutations))));
  };
  const prisma = Object.assign(Object.create(PrismaService.prototype) as PrismaService,
    ports, { $transaction: transaction });
  const cipherMethods = {
    encrypt: jest.fn((kind: 'session' | 'preauth', id: string, version: number, nonce: Buffer) =>
      registry.encrypt(kind, id, version, nonce)),
    decrypt: jest.fn((kind: 'session' | 'preauth', id: string, version: number, envelope: MockEnvelope) =>
      registry.decrypt(kind, id, version, envelope)),
  };
  const cipher = Object.assign(Object.create(CsrfNonceCipher.prototype) as CsrfNonceCipher, cipherMethods);
  Object.defineProperty(cipher, 'available', { get: () => registry.available });
  const hasher = {
    verify: jest.fn(async (phc: unknown, password: unknown) => phc === oldPhc && password === oldPassword),
    hash: jest.fn(async (_password: unknown) => newPhc),
  };
  const blocklist = { hasDigest: jest.fn((_digest: string) => false) };
  let randomIndex = 20;
  const randomBytes = jest.fn((size: number) => Buffer.alloc(size, randomIndex++));
  const now = jest.fn(() => time);
  const dependencies: ChangePasswordDependencies = {
    prisma, cipher, hasher, blocklist, config, randomBytes, now,
  };
  const request: ChangePasswordRequest = { origin, body: { currentPassword: oldPassword, newPassword: nextPassword },
    cookieHeader: 'abar_admin_session=' + token(7), csrfToken: token(8) };
  return { root, copies, kernel, ports, transaction, registry, cipherMethods, hasher, blocklist, randomBytes,
    service: new ChangePasswordService(dependencies), dependencies, request, owner, now,
    setTime: (value: number) => { time = value; }, setHook: (value: Hook) => { hook = value; },
    setAdmissionGate: (value: () => Promise<void>) => { admissionGate = value; } };
}

type Fixture = ReturnType<typeof fixture>;
function barrier<Value>() {
  let release!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>(resolve => { release = resolve; });
  return { promise, release };
}
type Settlement = Readonly<{ kind: 'resolved' | 'rejected'; value: unknown }>;
async function settle(work: () => Promise<unknown>): Promise<Settlement> {
  try { return { kind: 'resolved', value: await work() }; }
  catch (error) { return { kind: 'rejected', value: error }; }
}
async function capture(work: () => Promise<unknown>): Promise<unknown> {
  try { return await work(); } catch (error) { return error; }
}
const text = (value: unknown): string => {
  if (typeof value !== 'string') return fail();
  return value;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number') return fail();
  return value;
};
type NativeMetadata = ReadonlyMap<object, ReadonlyMap<PropertyKey, PropertyDescriptor>>;
// Capture host identities, not names: Jest metadata can carry host-context objects.
// The fixed literal reads built-ins only; no request or candidate input is evaluated.
const hostIntrinsics: readonly object[] = runInThisContext(
  '[Object.prototype, Error.prototype, Array.prototype, Error, Function.prototype]',
);
const objectPrototypes: readonly object[] = [Object.prototype, hostIntrinsics[0]];
const functionPrototypes: readonly object[] = [Function.prototype, hostIntrinsics[4]];
// Only stable function/accessor descriptors are native metadata; data is always screened.
const nativeMetadata: NativeMetadata = new Map(
  [Object.prototype, Error.prototype, Array.prototype, Error, Function.prototype, ...hostIntrinsics].map(prototype => {
    const fields = new Map<PropertyKey, PropertyDescriptor>();
    for (const key of Reflect.ownKeys(prototype)) {
      const field = Object.getOwnPropertyDescriptor(prototype, key)!;
      if (typeof field.value === 'function' || (objectPrototypes.includes(prototype) && key === '__proto__') ||
        (functionPrototypes.includes(prototype) && (key === 'caller' || key === 'arguments'))) {
        fields.set(key, Object.freeze({ ...field }));
      }
    }
    return [prototype, fields] as const;
  }),
);
function stableNative(field: PropertyDescriptor, baseline: PropertyDescriptor | undefined): boolean {
  return !!baseline && field.value === baseline.value && field.get === baseline.get &&
    field.set === baseline.set && field.enumerable === baseline.enumerable &&
    field.configurable === baseline.configurable && field.writable === baseline.writable;
}
// Walk constructor ancestry as descriptors, not getters or stringification.
// A prototype backlink may be skipped only when the object walk already covers it.
function constructorPrivateFree(member: object, lineage: readonly object[], depth: number,
  secrets: readonly string[], intrinsics: NativeMetadata, visited: WeakSet<object>): boolean {
  let current: object | null = member;
  let level = depth;
  while (current !== null) {
    if (level > 16 || types.isProxy(current)) return false;
    if (visited.has(current)) return true;
    visited.add(current);
    const inspected = current;
    const valid = Reflect.ownKeys(inspected).every(key => {
      if (!privateFree(String(key), level + 1, secrets, intrinsics, visited)) return false;
      const field = Object.getOwnPropertyDescriptor(inspected, key);
      if (!field) return false;
      if (stableNative(field, intrinsics.get(inspected)?.get(key))) return true;
      if (!('value' in field)) return false;
      if (key === 'prototype' && typeof inspected === 'function' && lineage.includes(field.value) &&
        Object.getOwnPropertyDescriptor(field.value, 'constructor')?.value === inspected) return true;
      return privateFree(field.value, level + 1, secrets, intrinsics, visited);
    });
    if (!valid) return false;
    current = Object.getPrototypeOf(inspected);
    level++;
  }
  return true;
}
function privateFree(value: unknown, depth = 0, secrets: readonly string[] =
  [oldPassword, nextPassword, oldPhc, newPhc, token(7), token(8)], intrinsics: NativeMetadata = nativeMetadata,
  visited: WeakSet<object> = new WeakSet()): boolean {
  if (depth > 16 || types.isProxy(value)) return false;
  if (typeof value === 'string') return !secrets.some(secret => secret.length > 0 && value.includes(secret));
  if (value === null || ['number', 'boolean', 'undefined'].includes(typeof value)) return true;
  if (typeof value !== 'object' || types.isUint8Array(value)) return false;
  // Revisits close graph edges only within this synchronous, all-branches traversal.
  if (visited.has(value)) return true;
  visited.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && !privateFree(prototype, depth + 1, secrets, intrinsics, visited)) return false;
  return Reflect.ownKeys(value).every(key => {
    if (!privateFree(String(key), depth + 1, secrets, intrinsics, visited)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return false;
    if (stableNative(descriptor, intrinsics.get(value)?.get(key))) return true;
    if (!('value' in descriptor)) return false;
    const member = descriptor.value;
    if (key === 'constructor' && typeof member === 'function' && !types.isProxy(member) &&
      Object.getOwnPropertyDescriptor(member, 'prototype')?.value === value) {
      const lineage: object[] = [];
      for (let cursor: object | null = value; cursor !== null; cursor = Object.getPrototypeOf(cursor)) {
        if (types.isProxy(cursor) || lineage.length > 16) return false;
        lineage.push(cursor);
      }
      return constructorPrivateFree(member, lineage, depth + 1, secrets, intrinsics, visited);
    }
    return privateFree(member, depth + 1, secrets, intrinsics, visited);
  });
}
const consoleChannels = ['error', 'warn', 'log', 'info', 'debug'] as const;
async function observeLogs(f: Fixture, request: ChangePasswordRequest, work: () => Promise<void>): Promise<void> {
  const logs: unknown[][] = [];
  const spies = consoleChannels.map(method =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => { logs.push(args); }));
  try {
    await work();
    const secrets = privateTexts(f, request);
    expect(logs.every(args => args.every(value => privateFree(value, 0, secrets)))).toBe(true);
  } finally { spies.forEach(spy => spy.mockRestore()); }
}
async function rejected(f: Fixture, status: number, code: string, request = f.request,
  expected?: () => ModelRows<Row, Row>): Promise<void> {
  const before = copies.clone(f.root);
  await observeLogs(f, request, async () => {
    const outcome = await settle(() => f.service.changePassword(request));
    expect(outcome.kind === 'rejected').toBe(true);
    const raw = outcome.value;
    const metadata = readChangePasswordError(raw);
    expect(metadata?.status === status && metadata.code === code).toBe(true);
    expect(copies.equal(f.root, expected ? expected() : before)).toBe(true);
    const secrets = privateTexts(f, request);
    expect(privateFree(raw, 0, secrets)).toBe(true);
  });
}
function body(f: Fixture, password: unknown): ChangePasswordRequest {
  return { ...f.request, body: { currentPassword: oldPassword, newPassword: password } };
}
function proofChange(f: Fixture, bump = true): void {
  const row = f.root.sessions[0];
  const version = number(row.nonceVersion) + (bump ? 1 : 0);
  const envelope = f.registry.encrypt('session', text(row.id), version, Buffer.alloc(32, 42));
  Object.assign(row, { nonceVersion: version, nonceCiphertext: envelope.ciphertext,
    nonceIv: envelope.iv, nonceTag: envelope.tag });
}
async function committed(f: Fixture, before: ModelRows<Row, Row>, value: unknown,
  request = f.request): Promise<void> {
  const raw = record(value);
  const old = before.sessions[0];
  if (typeof raw.sessionCookie !== 'string' || typeof raw.csrfToken !== 'string') return fail();
    expect(privateFree(raw, 0, privateTexts(f, request, false))).toBe(true);
    expect(Reflect.ownKeys(raw).length === 3 && ['csrfToken', 'sessionCookie', 'status'].every(key =>
      Object.prototype.hasOwnProperty.call(raw, key))).toBe(true);
    expect(raw.status === 204 && typeof raw.sessionCookie === 'string' && typeof raw.csrfToken === 'string').toBe(true);
    const cookie = /(?:^|;\s*)abar_admin_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(raw.sessionCookie)?.[1];
    expect(!!cookie && cookie !== token(7) && /^[A-Za-z0-9_-]{43}$/.test(raw.csrfToken)).toBe(true);
    if (!cookie) return fail();
    const screened = { ...raw,
      sessionCookie: raw.sessionCookie.replace('abar_admin_session=' + cookie, 'abar_admin_session=[public]'),
      csrfToken: '[public]',
    };
    expect(privateFree(screened, 0, privateTexts(f, request))).toBe(true);
    expect(!raw.sessionCookie.includes('Secure') && raw.sessionCookie.includes('Path=/')).toBe(true);
    const created = f.root.sessions.find(row => row.id === hashId(cookie));
    expect(!!created && created.adminUserId === f.owner && created.nonceVersion === 1 && created.revokedAt === null).toBe(true);
    if (!created) return fail();
    expect(f.root.accounts.length === before.accounts.length && f.root.sessions.length === before.sessions.length + 1).toBe(true);
    const expected = copies.clone(before);
    expected.accounts[0].passwordHash = newPhc;
    expected.accounts[0].version = number(before.accounts[0].version) + 1;
    expected.accounts[0].mustChangePassword = false;
    expected.accounts[0].updatedAt = new Date(baseTime);
    expected.sessions.forEach(row => {
      if (row.adminUserId === f.owner && row.revokedAt === null) row.revokedAt = new Date(baseTime);
  });
  expect(expected.accounts.every((row, i) => Object.keys(columns.accounts).every(key =>
    same(row[key], f.root.accounts[i][key])))).toBe(true);
  expect(expected.sessions.every(row => {
    const current = f.root.sessions.find(item => item.id === row.id);
    return !!current && Object.keys(columns.sessions).every(key => same(row[key], current[key]));
  })).toBe(true);
  for (const key of ['createdAt', 'lastActivityAt', 'absoluteExpiresAt', 'idleExpiresAt']) {
    expect(same(created[key], old[key])).toBe(true);
  }
  expect(f.root.writes === before.writes + changedRows(before, f.root) &&
    f.root.writes === before.writes + 4).toBe(true);
  const restored = await f.ports.authSession.findUnique({ where: { id: hashId(cookie) },
    select: { id: true, nonceVersion: true, revokedAt: true, adminUser: { select: {
      id: true, active: true, mustChangePassword: true } } } });
  if (!restored) return fail();
  const restoredOwner = record(restored.adminUser);
  expect(restored.id === created.id && restoredOwner.id === f.owner &&
    restoredOwner.active === true && restoredOwner.mustChangePassword === false).toBe(true);
  const nonce = f.registry.decrypt('session', text(created.id), number(created.nonceVersion), {
    ciphertext: Buffer.from(created.nonceCiphertext as Uint8Array),
    iv: Buffer.from(created.nonceIv as Uint8Array), tag: Buffer.from(created.nonceTag as Uint8Array) });
  expect(nonce.toString('base64url') === raw.csrfToken && raw.csrfToken !== token(8)).toBe(true);
  expect(privateFree(raw, 0, privateTexts(f, request, false))).toBe(true);
}
async function succeeded(f: Fixture, request = f.request, normalized = nextPassword): Promise<void> {
  await observeLogs(f, request, async () => {
    const before = copies.clone(f.root);
    const raw = await f.service.changePassword(request);
    await committed(f, before, raw, request);
    expect(f.hasher.verify.mock.calls.length === 1 && f.hasher.hash.mock.calls.length === 1).toBe(true);
    const current = Object.getOwnPropertyDescriptor(record(request.body), 'currentPassword')?.value;
    expect(f.hasher.verify.mock.calls[0]?.[1] === current && f.hasher.hash.mock.calls[0]?.[0] === normalized).toBe(true);
    expect(f.blocklist.hasDigest.mock.calls[0]?.[0] === blocklistIndex(normalized)).toBe(true);
  });
}

describe('ChangePasswordService faithful RED contract', () => {
  const bodies: Array<[string, unknown]> = [
    ['null body', null],
    ['boolean body', true],
    ['number body', 7],
    ['string body', 'private-body-input'],
    ['symbol body', Symbol('private-body-input')],
    ['function body', () => undefined],
    ['byte body', Buffer.alloc(1)],
    ['array body', []],
    ['missing new field', { currentPassword: oldPassword }],
    ['missing current field', { newPassword: nextPassword }],
    ['extra field', { currentPassword: oldPassword, newPassword: nextPassword, extra: true }],
    ['accessor field', Object.defineProperty({}, 'currentPassword', { get: () => oldPassword })],
    ['hostile getter', Object.defineProperty({ newPassword: nextPassword }, 'currentPassword', {
      get: () => { throw new Error('private'); } })],
    ['non-string current', { currentPassword: 3, newPassword: nextPassword }],
    ['non-string new', { currentPassword: oldPassword, newPassword: 3 }],
  ];
  test.each(bodies)('body: %s', async (_label, value) => {
    const f = fixture();
    await rejected(f, 400, 'VALIDATION_ERROR', { ...f.request, body: value });
    expect(f.hasher.verify.mock.calls.length === 0 && f.hasher.hash.mock.calls.length === 0).toBe(true);
  });
  test.each([
    ['missing origin', undefined], ['unlisted origin', 'http://evil.invalid'],
    ['null origin', null], ['duplicate origin', [origin, origin]],
  ])('Origin precedence: %s', async (_label, value) => {
    const f = fixture();
    let getterReads = 0;
    let databaseReads = 0;
    f.setHook(stage => { if (stage.endsWith(':read')) databaseReads++; });
    const request = { ...f.request, origin: value, referer: origin, forwardedHost: 'localhost',
      body: Object.defineProperty({}, 'currentPassword', { get: () => { getterReads++; return oldPassword; } }) };
    await rejected(f, 403, 'ORIGIN_INVALID', request);
    expect(getterReads === 0 && databaseReads === 0 && f.hasher.verify.mock.calls.length === 0).toBe(true);
    expect(f.blocklist.hasDigest.mock.calls.length === 0 && f.randomBytes.mock.calls.length === 0).toBe(true);
    expect(f.cipherMethods.decrypt.mock.calls.length === 0 && f.cipherMethods.encrypt.mock.calls.length === 0).toBe(true);
  });
  test.each([
    ['short legacy case', 'short'], ['14 points', 'x'.repeat(14)],
    ['129 points', 'x'.repeat(129)], ['lone surrogate', 'x'.repeat(14) + '\ud800'],
  ])('new-password policy: %s', async (_label, value) => {
    const f = fixture();
    await rejected(f, 400, 'PASSWORD_POLICY', body(f, value));
    expect(f.hasher.verify.mock.calls.length === 1 && f.hasher.hash.mock.calls.length === 0).toBe(true);
  });
  test('offline blocklist rejection', async () => {
    const f = fixture();
    f.blocklist.hasDigest.mockReturnValue(true);
    await rejected(f, 400, 'PASSWORD_POLICY');
    expect(f.blocklist.hasDigest.mock.calls.length === 1 && f.hasher.hash.mock.calls.length === 0).toBe(true);
    expect(f.blocklist.hasDigest.mock.calls[0]?.[0] === blocklistIndex(nextPassword)).toBe(true);
  });
  test.each([
    ['15 points', 'x'.repeat(15)], ['128 points', 'x'.repeat(128)],
    ['astral points', '\u{1f600}'.repeat(15)], ['NFC', 'e\u0301'.repeat(15)],
    ['whitespace retained', '  ' + nextPassword + '  '],
  ])('accepted normalized password: %s', async (_label, value) => {
    const f = fixture();
    await succeeded(f, body(f, value), value.normalize('NFC'));
  });
  test.each([true, false])('atomic rotation and readable fresh proof, restricted=%s', async mode => {
    await succeeded(fixture(mode));
  });
  test.each([
    ['missing cookie', undefined], ['malformed cookie', 'abar_admin_session=bad'],
    ['duplicate cookie', 'abar_admin_session=' + token(7) + '; abar_admin_session=' + token(9)],
  ])('cookie: %s', async (_label, value) => {
    await rejected(fixture(), 401, 'SESSION_EXPIRED', { ...fixture().request, cookieHeader: value });
  });
  test.each([
    ['missing CSRF', undefined], ['malformed CSRF', 'bad'],
    ['duplicate CSRF', [token(8), token(8)]], ['wrong bound CSRF', token(6)],
  ])('CSRF: %s', async (_label, value) => {
    const f = fixture();
    await rejected(f, 403, 'CSRF_INVALID', { ...f.request, csrfToken: value });
  });
  const invalidStates: Array<[string, number, string, (f: Fixture) => void]> = [
    ['absolute boundary', 401, 'SESSION_EXPIRED', f => { f.root.sessions[0].absoluteExpiresAt = new Date(baseTime); }],
    ['idle boundary', 401, 'SESSION_EXPIRED', f => { f.root.sessions[0].idleExpiresAt = new Date(baseTime); }],
    ['expired session', 401, 'SESSION_EXPIRED', f => { f.root.sessions[0].idleExpiresAt = new Date(baseTime - 1); }],
    ['revoked current', 401, 'SESSION_EXPIRED', f => { f.root.sessions[0].revokedAt = new Date(baseTime - 1); }],
    ['inactive owner', 401, 'SESSION_EXPIRED', f => { f.root.accounts[0].active = false; }],
    ['absent session', 401, 'SESSION_EXPIRED', f => { f.root.sessions.splice(0, 1); }],
    ['absent owner', 503, 'SERVICE_UNAVAILABLE', f => { f.root.accounts.splice(0, 1); }],
    ['corrupt ciphertext', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].nonceCiphertext = Buffer.alloc(2); }],
    ['corrupt IV', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].nonceIv = Buffer.alloc(2); }],
    ['corrupt tag', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].nonceTag = Buffer.alloc(2); }],
    ['tampered envelope', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].nonceTag = Buffer.alloc(16, 99); }],
    ['corrupt nonce version', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].nonceVersion = 0; }],
    ['corrupt account version', 503, 'SERVICE_UNAVAILABLE', f => { f.root.accounts[0].version = NaN; }],
    ['corrupt date', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].idleExpiresAt = new Date(NaN); }],
    ['invalid clock', 503, 'SERVICE_UNAVAILABLE', f => { f.setTime(NaN); }],
  ];
  test.each(invalidStates)('initial state: %s', async (_label, status, code, alter) => {
    const f = fixture();
    alter(f);
    await rejected(f, status, code);
    expect(f.hasher.hash.mock.calls.length === 0).toBe(true);
  });
  const unavailable: Array<[string, (f: Fixture) => void]> = [
    ['verify', f => { f.hasher.verify.mockRejectedValue(new Error('private')); }],
    ['hash', f => { f.hasher.hash.mockRejectedValue(new Error('private')); }],
    ['blocklist', f => { f.blocklist.hasDigest.mockImplementation(() => { throw new Error('private'); }); }],
    ['cipher unavailable', f => { f.registry.available = false; }],
    ['decrypt', f => { f.cipherMethods.decrypt.mockImplementation(() => { throw new Error('private'); }); }],
    ['RNG throws', f => { f.randomBytes.mockImplementation(() => { throw new Error('private'); }); }],
    ['RNG short', f => { f.randomBytes.mockReturnValue(Buffer.alloc(2)); }],
    ['clock throws', f => { f.now.mockImplementation(() => { throw new Error('private'); }); }],
    ['transaction abort', f => { f.setHook(stage => { if (stage === 'transaction:enter') throw new Error('private'); }); }],
  ];
  test.each(unavailable)('dependency unavailable: %s', async (_label, arrange) => {
    const f = fixture();
    arrange(f);
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
  });
  test('false verifier is exactly invalid credentials', async () => {
    const f = fixture();
    f.hasher.verify.mockResolvedValue(false);
    await rejected(f, 401, 'INVALID_CREDENTIALS');
    expect(f.hasher.verify.mock.calls.length === 1 && f.hasher.hash.mock.calls.length === 0).toBe(true);
  });
  test('unknown dependency exception getters are never consulted', async () => {
    const f = fixture();
    let getters = 0;
    const thrown = Object.defineProperties({}, {
      message: { get: () => { getters++; return oldPassword; } },
      getStatus: { get: () => { getters++; return () => 401; } },
      getResponse: { get: () => { getters++; return () => newPhc; } },
    });
    f.hasher.verify.mockRejectedValue(thrown);
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(getters === 0).toBe(true);
  });
  const drifts: Array<[string, number, string, (f: Fixture) => void]> = [
    ['owner version', 401, 'INVALID_CREDENTIALS', f => { f.root.accounts[0].version = 5; }],
    ['owner password', 401, 'INVALID_CREDENTIALS', f => { f.root.accounts[0].passwordHash = 'concurrent-private-phc'; }],
    ['owner mandatory flag', 401, 'INVALID_CREDENTIALS', f => { f.root.accounts[0].mustChangePassword = false; }],
    ['owner inactive', 401, 'SESSION_EXPIRED', f => { f.root.accounts[0].active = false; }],
    ['session gone', 401, 'SESSION_EXPIRED', f => { f.root.sessions.splice(0, 1); }],
    ['session revoked', 401, 'SESSION_EXPIRED', f => { f.root.sessions[0].revokedAt = new Date(baseTime); }],
    ['session owner', 401, 'SESSION_EXPIRED', f => { f.root.sessions[0].adminUserId = f.root.accounts[1].id; }],
    ['nonce version', 403, 'CSRF_INVALID', f => { proofChange(f); }],
    ['envelope only', 403, 'CSRF_INVALID', f => { proofChange(f, false); }],
    ['absolute expiry', 401, 'SESSION_EXPIRED', f => { f.setTime(baseTime + 3600000); }],
    ['idle expiry', 401, 'SESSION_EXPIRED', f => { f.setTime(baseTime + 900000); }],
    ['clock corruption', 503, 'SERVICE_UNAVAILABLE', f => { f.setTime(NaN); }],
    ['stored corruption', 503, 'SERVICE_UNAVAILABLE', f => { f.root.sessions[0].nonceVersion = NaN; }],
  ];
  for (const phase of ['verify', 'hash', 'transaction'] as const) {
    test.each(drifts)('drift after ' + phase + ': %s', async (_label, status, code, alter) => {
      const f = fixture();
      let observed = false;
      let expected = copies.clone(f.root);
      const change = () => {
        if (observed) return;
        observed = true;
        alter(f);
        expected = copies.clone(f.root);
      };
      if (phase === 'verify') f.hasher.verify.mockImplementation(async () => { change(); return true; });
      if (phase === 'hash') f.hasher.hash.mockImplementation(async () => { change(); return newPhc; });
      if (phase === 'transaction') f.setHook(stage => { if (stage === 'transaction:enter') change(); });
      await rejected(f, status, code, f.request, () => expected);
      expect(observed).toBe(true);
      expect(f.hasher.verify.mock.calls.length === 1 && f.hasher.hash.mock.calls.length <= 1).toBe(true);
    });
  }
  test.each(['accounts:write', 'sessions:write', 'sessions:create'])('rollback after real mutation: %s', async stage => {
    const f = fixture();
    const before = copies.clone(f.root);
    let reached = false;
    f.setHook((current, _reply, buffer, mutations) => {
      if (current !== stage || !buffer || !mutations) return;
      reached = changedRows(before, buffer) > 0 && buffer.writes > before.writes;
      if (reached) throw new Error('private');
    });
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(reached).toBe(true);
  });
  // Service cipher failure checks complete state; it does not claim a preceding mutation.
  test('service encryption failure preserves complete state without prescribing order', async () => {
    const f = fixture();
    f.cipherMethods.encrypt.mockImplementation(() => { throw new Error('private'); });
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(f.cipherMethods.encrypt.mock.calls.length === 1).toBe(true);
  });
  test('fresh ID collision fails without a blind retry', async () => {
    const f = fixture();
    f.randomBytes.mockReturnValue(Buffer.alloc(32, 7));
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(f.randomBytes.mock.calls.length <= 2).toBe(true);
  });
  test('successful cipher calls are not rewound by a later database fault', async () => {
    const f = fixture();
    const before = f.registry.stats().encryptions;
    f.setHook(stage => { if (stage === 'sessions:create') throw new Error('private'); });
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(f.registry.stats().encryptions > before).toBe(true);
  });
  test('old proof remains retired after a committed change', async () => {
    const f = fixture();
    await succeeded(f);
    await rejected(f, 401, 'SESSION_EXPIRED');
  });
  test.each(['retired proof', 'database admission'] as const)(
    'concurrent old-proof loser: %s', async mode => {
      const f = fixture();
      const before = copies.clone(f.root);
      const ready = barrier<void>();
      const firstGate = barrier<boolean>();
      const secondGate = barrier<boolean>();
      let entered = 0;
      if (mode === 'retired proof') {
        f.hasher.verify.mockImplementation(() => {
          const gate = ++entered === 1 ? firstGate : secondGate;
          if (entered === 2) ready.release();
          return gate.promise;
        });
      } else {
        f.setAdmissionGate(async () => {
          if (++entered === 2) ready.release();
          await ready.promise;
        });
      }
      await observeLogs(f, f.request, async () => {
        const first = settle(() => f.service.changePassword(f.request));
        const second = settle(() => f.service.changePassword(f.request));
        const reached = await Promise.race([
          ready.promise.then(() => true), first.then(() => false), second.then(() => false),
        ]);
        if (!reached) {
          ready.release();
          firstGate.release(true);
          secondGate.release(true);
          await Promise.all([first, second]);
        }
        expect(reached && entered === 2).toBe(true);
        firstGate.release(true);
        const firstResult = await first;
        secondGate.release(true);
        const outcomes = [firstResult, await second];
        const winners = outcomes.filter(outcome => outcome.kind === 'resolved');
        const losers = outcomes.filter(outcome => outcome.kind === 'rejected');
        expect(winners.length === 1 && losers.length === 1).toBe(true);
        if (winners.length !== 1 || losers.length !== 1) return fail();
        const metadata = readChangePasswordError(losers[0].value);
        const status = mode === 'retired proof' ? 401 : 503;
        const code = mode === 'retired proof' ? 'SESSION_EXPIRED' : 'SERVICE_UNAVAILABLE';
        expect(metadata?.status === status && metadata.code === code).toBe(true);
        expect(f.kernel.admissionAborts() === (mode === 'database admission' ? 1 : 0)).toBe(true);
        await committed(f, before, winners[0].value);
        expect(privateFree(losers[0].value, 0, privateTexts(f, f.request))).toBe(true);
        expect(f.hasher.verify.mock.calls.length === 2).toBe(true);
        expect(f.hasher.hash.mock.calls.length === (mode === 'retired proof' ? 1 : 2)).toBe(true);
      });
    });
});

describe('fixture fidelity controls', () => {
  test('committed numeric increment is numeric, with stable root arrays', async () => {
    const f = fixture();
    const accounts = f.root.accounts;
    const sessions = f.root.sessions;
    await f.transaction(async tx => {
      const account = await tx.adminUser.updateMany({ where: { id: f.owner, version: 4 },
        data: { version: { increment: 1 }, mustChangePassword: false } });
      const session = await tx.authSession.updateMany({ where: { id: hashId(token(9)), adminUserId: f.owner,
        adminUser: { is: { id: f.owner, active: true } }, revokedAt: null,
        absoluteExpiresAt: { gt: new Date(baseTime) }, idleExpiresAt: { gt: new Date(baseTime) } },
        data: { revokedAt: new Date(baseTime) } });
      expect(account.count === 1 && session.count === 1).toBe(true);
    });
    expect(f.root.accounts === accounts && f.root.sessions === sessions).toBe(true);
    expect(f.root.accounts[0].version === 5 && f.root.accounts[0].mustChangePassword === false).toBe(true);
    expect(f.root.sessions[1].revokedAt instanceof Date && f.root.sessions[2].revokedAt === null).toBe(true);
    expect(same(f.root.sessions[3].revokedAt, new Date(baseTime - 10000)) && f.root.writes === 2).toBe(true);
  });
  test.each(['account', 'session'])('rollback after actual %s mutation', async target => {
    const f = fixture();
    const before = copies.clone(f.root);
    const outcome = await capture(() => f.transaction(async tx => {
      if (target === 'account') await tx.adminUser.updateMany({ where: { id: f.owner }, data: { mustChangePassword: false } });
      else await tx.authSession.updateMany({ where: { id: hashId(token(9)) }, data: { revokedAt: new Date(baseTime) } });
      throw new Error('MODEL_CONTROL_FAILURE');
    }));
    expect(outcome instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test('owner predicates and date boundaries select no foreign or expired rows', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    const result = await f.ports.authSession.updateMany({ where: { adminUserId: f.owner,
      adminUser: { is: { id: f.owner, active: false } }, revokedAt: null },
      data: { revokedAt: new Date(baseTime) } });
    expect(result.count === 0 && copies.equal(f.root, before)).toBe(true);
    const expired = await f.ports.authSession.updateMany({ where: { id: hashId(token(7)),
      idleExpiresAt: { gt: new Date(baseTime + 900000) } }, data: { revokedAt: new Date(baseTime) } });
    expect(expired.count === 0 && copies.equal(f.root, before)).toBe(true);
  });
  test.each([
    ['invalid column', { where: { imaginary: true }, data: { active: false } }],
    ['inherited filter, no match', { where: { id: 'absent', constructor: Buffer.alloc(1) }, data: { active: false } }],
    ['inherited patch, no match', { where: { id: 'absent' }, data: { toString: Buffer.alloc(1) } }],
    ['invalid scalar', { where: { version: '4' }, data: { active: false } }],
    ['invalid increment', { where: { id: 'absent' }, data: { version: { increment: 0 } } }],
    ['unsupported operator', { where: { id: { startsWith: 'x' } }, data: { active: false } }],
    ['invalid update', { where: { id: 'absent' }, data: { imaginary: true } }],
  ])('invalid query changes no rows or counters: %s', async (_label, args) => {
    const f = fixture();
    const before = copies.clone(f.root);
    const outcome = await capture(() => f.ports.adminUser.updateMany(args));
    expect(outcome instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  const invalidSelections: Array<[Row]> = [
    [{}],
    [{ id: false }],
    [{ imaginary: true }],
    [{ adminUser: { select: {} } }],
    [{ constructor: true }],
    [{ toString: true }],
  ];
  test.each(invalidSelections)(
    'invalid selection is rejected without mutation', async select => {
      const f = fixture();
      const before = copies.clone(f.root);
      const id = Object.hasOwn(select, 'constructor') || Object.hasOwn(select, 'toString') ? 'absent' : hashId(token(7));
      const outcome = await capture(() => f.ports.authSession.findUnique({ where: { id }, select }));
      expect(outcome instanceof Error && copies.equal(f.root, before)).toBe(true);
    });
  test('projection is detached, including native dates and bytes', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    const projected = await f.ports.authSession.findUnique({ where: { id: hashId(token(7)) },
      select: { id: true, createdAt: true, nonceCiphertext: true, adminUser: { select: { id: true } } } });
    if (!projected || !(projected.createdAt instanceof Date) || !types.isUint8Array(projected.nonceCiphertext)) return fail();
    projected.createdAt.setTime(0);
    projected.nonceCiphertext[0] = 99;
    record(projected.adminUser).id = 'changed';
    expect(Object.keys(projected).sort().join() === 'adminUser,createdAt,id,nonceCiphertext').toBe(true);
    expect(copies.equal(f.root, before)).toBe(true);
  });
  test('facade rejects use after its transaction closes', async () => {
    const f = fixture();
    let escaped: ReturnType<typeof facade> | undefined;
    await f.transaction(async tx => { escaped = tx; });
    const before = copies.clone(f.root);
    if (!escaped) return fail();
    const port = escaped;
    const result = await capture(() => port.adminUser.updateMany({ where: { id: f.owner }, data: { active: false } }));
    expect(result instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test('parallel admission is refused synchronously', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    let release: () => void = () => undefined;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = f.transaction(async () => hold);
    const second = await capture(() => f.transaction(async () => undefined));
    release();
    await first;
    expect(second instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test('root facade is unavailable during a transaction', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    const result = await capture(() => f.transaction(async () =>
      f.ports.adminUser.findUnique({ where: { id: f.owner }, select: { id: true } })));
    expect(result instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test('caught mutator failure still poisons the transaction', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    const result = await capture(() => f.transaction(async tx => {
      await tx.adminUser.updateMany({ where: { id: f.owner }, data: { mustChangePassword: false } });
      await capture(() => tx.adminUser.updateMany({ where: { id: f.owner }, data: { version: { increment: 0 } } }));
    }));
    expect(result instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test.each(['outside', 'transaction'] as const)('accepted %s mutation cannot publish escaped aliases', async mode => {
    const f = fixture();
    const expected = copies.clone(f.root);
    expected.accounts[0].mustChangePassword = false;
    expected.writes = 1;
    let escaped: ModelRows<Row, Row> | undefined;
    const mutate = async (port: ModelPort<Row, Row>) => {
      port.write(rows => { rows.accounts[0].mustChangePassword = false; escaped = rows; }, () => {
        if (!escaped) return fail();
        escaped.accounts[0].passwordHash = 'unpublished-private-value';
      });
    };
    await (mode === 'outside' ? mutate(f.kernel.outside) : f.kernel.transaction(mutate));
    expect(copies.equal(f.root, expected)).toBe(true);
  });
  test('foreign root changes abort publication without being undone', async () => {
    const f = fixture();
    let expected = copies.clone(f.root);
    const result = await capture(() => f.transaction(async tx => {
      await tx.adminUser.updateMany({ where: { id: f.owner }, data: { mustChangePassword: false } });
      f.root.accounts[1].version = 9;
      f.root.writes++;
      expected = copies.clone(f.root);
    }));
    expect(result instanceof Error && copies.equal(f.root, expected)).toBe(true);
  });
  test('cipher keeps prior envelopes, copies nonce, and binds the complete tuple', () => {
    const registry = makeMockCipher([]);
    const id = hashId(token(7));
    const input = Buffer.alloc(32, 8);
    const first = registry.encrypt('session', id, 1, input);
    const second = registry.encrypt('session', id, 1, Buffer.alloc(32, 9));
    input[0] = 99;
    expect(registry.decrypt('session', id, 1, first).equals(Buffer.alloc(32, 8))).toBe(true);
    expect(registry.decrypt('session', id, 1, second).equals(Buffer.alloc(32, 9))).toBe(true);
    const wrong = [() => registry.decrypt('preauth', id, 1, first),
      () => registry.decrypt('session', id, 2, first),
      () => registry.decrypt('session', hashId(token(9)), 1, first),
      () => registry.decrypt('session', id, 1, { ...first, tag: Buffer.alloc(16, 42) })];
    expect(wrong.every(run => { try { run(); return false; } catch { return true; } })).toBe(true);
  });
  test('metadata reader performs no arbitrary getter reads', () => {
    let reads = 0;
    const value = Object.defineProperties({}, { status: { get: () => { reads++; return 401; } },
      code: { get: () => { reads++; return 'INVALID_CREDENTIALS'; } } });
    expect(readChangePasswordError(value) === undefined && reads === 0).toBe(true);
    expect(readChangePasswordError(null) === undefined && readChangePasswordError('unknown') === undefined).toBe(true);
  });
  test('fixture never constructs Prisma or a real cipher', () => {
    fixture();
    expect(jest.mocked(PrismaService).mock.calls.length === 0).toBe(true);
    expect(jest.mocked(CsrfNonceCipher).mock.calls.length === 0).toBe(true);
  });
});

function privateTexts(f: Fixture, request: ChangePasswordRequest, randomSecrets = true): string[] {
  const secrets = [oldPassword, nextPassword, oldPhc, newPhc, token(7), token(8)];
  const bodyValue = Object.getOwnPropertyDescriptor(request, 'body')?.value;
  if (bodyValue && typeof bodyValue === 'object' && !types.isProxy(bodyValue)) {
    for (const key of ['currentPassword', 'newPassword']) {
      const value = Object.getOwnPropertyDescriptor(bodyValue, key)?.value;
      if (typeof value === 'string' && value.length) secrets.push(value, value.normalize('NFC'));
    }
  }
  for (const row of f.root.accounts) {
    const value = Object.getOwnPropertyDescriptor(row, 'passwordHash')?.value;
    if (typeof value === 'string') secrets.push(value);
  }
  for (const result of randomSecrets ? f.randomBytes.mock.results : []) {
    if (result.type === 'return' && types.isUint8Array(result.value)) {
      const copied = scalar(result.value);
      if (!Buffer.isBuffer(copied)) return fail();
      secrets.push(copied.toString('base64url'), copied.toString('hex'));
    }
  }
  return secrets;
}
describe('explicit coverage-gap witnesses', () => {
  test('body getters are rejected without being executed', async () => {
    const f = fixture();
    let reads = 0;
    const bad = Object.defineProperties({}, {
      currentPassword: { enumerable: true, get: () => { reads++; return oldPassword; } },
      newPassword: { enumerable: true, value: nextPassword },
    });
    await rejected(f, 400, 'VALIDATION_ERROR', { ...f.request, body: bad });
    expect(reads === 0 && f.hasher.verify.mock.calls.length === 0).toBe(true);
  });
  test.each(['bad session id', 'dangling owner', 'getter metadata'])(
    'corrupt canonical lookup before any projection: %s', async defect => {
      const f = fixture();
      let introduced = false;
      let getterReads = 0;
      f.setHook((stage, _reply, rows) => {
        if (stage !== 'schema:read' || !rows || introduced) return;
        const current = rows.sessions[0];
        if (defect === 'bad session id') {
          current.id = 7;
          introduced = Object.getOwnPropertyDescriptor(current, 'id')?.value === 7;
        } else if (defect === 'dangling owner') {
          current.adminUserId = 'absent-owner';
          introduced = !rows.accounts.some(owner => owner.id === current.adminUserId);
        } else {
          Object.defineProperty(current, 'nonceVersion', {
            enumerable: true, configurable: true, get: () => { getterReads++; return 1; } });
          const descriptor = Object.getOwnPropertyDescriptor(current, 'nonceVersion');
          introduced = !!descriptor && !('value' in descriptor);
        }
      });
      await rejected(f, 503, 'SERVICE_UNAVAILABLE');
      expect(introduced && getterReads === 0).toBe(true);
    });
  test.each(['accounts:write', 'sessions:write', 'sessions:create'])(
    'clock expires while transaction is open: %s', async stage => {
      const f = fixture();
      let reached = false;
      f.setHook(current => {
        if (current !== stage || reached) return;
        reached = true;
        f.setTime(baseTime + 900000);
      });
      await rejected(f, 401, 'SESSION_EXPIRED');
      expect(reached).toBe(true);
    });
  test('old nonce cannot authorize the newly committed session', async () => {
    const f = fixture();
    const raw = await f.service.changePassword(f.request);
    const cookie = /abar_admin_session=([A-Za-z0-9_-]{43})/.exec(raw.sessionCookie)?.[1];
    if (!cookie) return fail();
    await rejected(f, 403, 'CSRF_INVALID', { ...f.request,
      cookieHeader: 'abar_admin_session=' + cookie, csrfToken: token(8) });
  });
  test('raw privacy predicate rejects nonce and PHC even in nested errors', () => {
    const f = fixture();
    expect(!privateFree({ cause: { nonce: token(8) } }, 0, privateTexts(f, f.request))).toBe(true);
    expect(!privateFree({ cause: { message: oldPhc } }, 0, privateTexts(f, f.request))).toBe(true);
    expect(!privateFree({ payload: Buffer.alloc(32, 8) })).toBe(true);
  });
  test('database admission failure has exactly unavailable, not a stale-proof code', async () => {
    const f = fixture();
    let reached = false;
    f.setHook(stage => {
      if (stage === 'transaction:enter') { reached = true; throw new Error('MODEL_TRANSACTION_ACTIVE'); }
    });
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(reached).toBe(true);
  });
  test('closed facade cannot become valid in a later transaction', async () => {
    const f = fixture();
    let stale: ReturnType<typeof facade> | undefined;
    await f.transaction(async tx => { stale = tx; });
    const before = copies.clone(f.root);
    const outcome = await capture(() => f.transaction(async () => {
      if (!stale) return fail();
      await stale.adminUser.updateMany({ where: { id: f.owner }, data: { active: false } });
    }));
    expect(outcome instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test('cipher rejects accessor envelopes without executing getters', () => {
    const f = fixture();
    let reads = 0;
    const envelope = Object.defineProperty({}, 'ciphertext', { get: () => { reads++; return Buffer.alloc(32); } });
    const result = (() => {
      try {
        f.cipherMethods.decrypt('session', hashId(token(7)), 1, envelope as MockEnvelope);
        return false;
      } catch { return true; }
    })();
    expect(result && reads === 0).toBe(true);
  });
});

describe('settlement discriminator control', () => {
  test('the same object is distinguished when returned and thrown', async () => {
    const value = new Error('MODEL_SETTLEMENT_CONTROL');
    const resolved = await settle(async () => value);
    const rejected = await settle(async () => { throw value; });
    expect(resolved.kind === 'resolved' && resolved.value === value).toBe(true);
    expect(rejected.kind === 'rejected' && rejected.value === value).toBe(true);
  });
});

describe('integrity and accepted-buffer controls', () => {
  test('invalid owner and duplicate email preserve all rows and counters', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    const owner = await capture(() => f.ports.authSession.updateMany({
      where: { id: hashId(token(7)) }, data: { adminUserId: 'absent' } }));
    const email = await capture(() => f.ports.adminUser.updateMany({
      where: { id: f.owner }, data: { email: f.root.accounts[1].email } }));
    expect(owner instanceof Error && email instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
  test('valid owner transfer is permitted and counted as one changed row', async () => {
    const f = fixture();
    const result = await f.ports.authSession.updateMany({ where: { id: hashId(token(7)) },
      data: { adminUserId: f.root.accounts[1].id } });
    expect(result.count === 1 && f.root.sessions[0].adminUserId === f.root.accounts[1].id &&
      f.root.writes === 1).toBe(true);
  });
  // Kernel-only accepted-buffer control, not proof of service cipher-after-write ordering.
  test('kernel cipher fault after accepted mutation poisons even when caught', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    let accepted = false;
    f.cipherMethods.encrypt.mockImplementation(() => { throw new Error('MODEL_ACCEPTED_BUFFER_FAULT'); });
    const result = await capture(() => f.kernel.transaction(async port => {
      try {
        port.write(rows => { rows.accounts[0].passwordHash = newPhc; }, () => {
          accepted = port.read(rows => rows.accounts[0].passwordHash === newPhc &&
            rows.writes === before.writes + 1);
          f.cipherMethods.encrypt('session', hashId(token(7)), 1, Buffer.alloc(32, 9));
        });
      } catch {}
    }));
    expect(accepted && f.cipherMethods.encrypt.mock.calls.length === 1 &&
      result instanceof Error && copies.equal(f.root, before)).toBe(true);
  });
});

// Trusted fixture construction only; never sanitize an observed service error or log.
function publicDataStack<Value extends Error>(error: Value): Value {
  Object.defineProperty(error, 'stack', { value: 'public fixture stack', writable: false, enumerable: false, configurable: true });
  return error;
}
describe('privacy predicate and remaining ordering controls', () => {
  const controls: Array<[string, () => unknown, boolean]> = [
    ['own secret-bearing key', () => ({ [oldPassword]: 'public' }), false],
    ['symbol secret-bearing key', () => ({ [Symbol(oldPassword)]: 'public' }), false],
    ['inherited secret-bearing key', () => Object.create({ [oldPassword]: 'public' }), false],
    ['inherited private value', () => Object.create({ detail: newPhc }), false],
    ['public plain record', () => ({ status: 204, detail: 'public' }), true],
    ['public native error', () => publicDataStack(new Error('public')), true],
    ['public Error subclass', () => publicDataStack(new (class PublicServiceError extends Error {})('public')), true],
    ['Error subclass inherited secret', () => {
      class PrivateServiceError extends Error {}
      Object.defineProperty(PrivateServiceError.prototype, 'detail', { value: oldPassword });
      return new PrivateServiceError('public');
    }, false],
    ['public constructor ancestry', () => {
      class ParentError extends Error {}
      Object.defineProperty(ParentError, 'detail', { value: 'public' });
      return publicDataStack(new (class ChildError extends ParentError {})('public'));
    }, true],
    ['constructor ancestor private value', () => {
      class ParentError extends Error {}
      Object.defineProperty(ParentError, 'detail', { value: oldPassword });
      return new (class ChildError extends ParentError {})('public');
    }, false],
    ['constructor ancestor secret symbol key', () => {
      class ParentError extends Error {}
      Object.defineProperty(ParentError, Symbol(oldPassword), { value: 'public' });
      return new (class ChildError extends ParentError {})('public');
    }, false],
    ['public detached constructor ancestry', () => {
      class ConstructorAncestor extends Error {}
      class DetachedError extends Error {}
      Object.defineProperty(ConstructorAncestor, 'detail', { value: 'public' });
      Object.setPrototypeOf(DetachedError, ConstructorAncestor);
      return publicDataStack(new DetachedError('public'));
    }, true],
    ['detached constructor inherited private value', () => {
      class ConstructorAncestor extends Error {}
      class DetachedError extends Error {}
      Object.defineProperty(ConstructorAncestor, 'detail', { value: oldPassword });
      Object.setPrototypeOf(DetachedError, ConstructorAncestor);
      return new DetachedError('public');
    }, false],
    ['public inherited data', () => Object.create({ detail: 'public' }), true],
    ['private stack data', () => Object.defineProperty(publicDataStack(new Error('public')), 'stack', { value: oldPassword }), false],
    ['unknown stack accessor', () => Object.defineProperty(publicDataStack(new Error('public')), 'stack', { get: () => { throw new Error('MODEL_GETTER_EXECUTED'); } }), false],
  ];
  test.each(controls)('privacy predicate: %s', (_label, build, expected) => {
    expect(privateFree(build()) === expected).toBe(true);
  });
  test('host-context native metadata still screens inherited private data and accessors', () => {
    const publicRecord: object = runInThisContext('({ detail: "public" })');
    expect(privateFree(publicRecord)).toBe(true);
    const hostPrototype = Object.getPrototypeOf(publicRecord);
    const inherited = Object.create(hostPrototype, { detail: { value: oldPassword } });
    expect(privateFree(Object.create(inherited))).toBe(false);
    const keyed = Object.create(hostPrototype, { [oldPassword]: { value: 'public' } });
    expect(privateFree(Object.create(keyed))).toBe(false);
    const symbolKeyed = Object.create(hostPrototype, { [Symbol(oldPassword)]: { value: 'public' } });
    expect(privateFree(Object.create(symbolKeyed))).toBe(false);
    let reads = 0;
    const accessor = Object.create(hostPrototype, {
      detail: { get: () => { reads++; return oldPassword; } },
    });
    expect(privateFree(Object.create(accessor))).toBe(false);
    expect(reads).toBe(0);
    const unknownFunction = Object.create(hostPrototype, { detail: { value: () => 'public' } });
    expect(privateFree(unknownFunction)).toBe(false);
  });
  test('cyclic graphs still screen private siblings and accessors on every call', () => {
    const value: Row = { detail: 'public' };
    value.self = value;
    expect(privateFree(value)).toBe(true);
    value.detail = oldPassword;
    expect(privateFree(value)).toBe(false);
    value.detail = 'public';
    let reads = 0;
    Object.defineProperty(value, 'hidden', { get: () => { reads++; return oldPassword; } });
    expect(privateFree(value)).toBe(false);
    expect(reads).toBe(0);
  });
  test('privacy screening does not execute an accessor', () => {
    let reads = 0;
    const value = Object.defineProperty({}, 'detail', { get: () => { reads++; return oldPassword; } });
    expect(privateFree(value)).toBe(false);
    expect(reads).toBe(0);
  });
  test('detached constructor ancestry accessor is rejected without invocation', () => {
    let reads = 0;
    class ConstructorAncestor extends Error {}
    class DetachedError extends Error {}
    Object.defineProperty(ConstructorAncestor, 'detail', { get: () => { reads++; return oldPassword; } });
    Object.setPrototypeOf(DetachedError, ConstructorAncestor);
    const value = new DetachedError('public');
    expect(privateFree(value)).toBe(false);
    expect(reads).toBe(0);
  });
  test('current credential whitespace is passed unchanged to the verifier', async () => {
    const f = fixture();
    const current = '  A\u0301bCdEfGhIjKlMnOp  ';
    f.hasher.verify.mockImplementation(async (_phc, password) => password === current);
    await succeeded(f, { ...f.request, body: { currentPassword: current, newPassword: nextPassword } });
    expect(f.hasher.verify.mock.calls[0]?.[1] === current).toBe(true);
  });
  test.each(['inherited fields', 'symbol extra', 'new accessor'])('own-data body boundary: %s', async defect => {
    const f = fixture();
    let reads = 0;
    const value = defect === 'inherited fields'
      ? Object.create({ currentPassword: oldPassword, newPassword: nextPassword })
      : { currentPassword: oldPassword, newPassword: nextPassword };
    if (defect === 'symbol extra') Object.defineProperty(value, Symbol('extra'), { value: true });
    if (defect === 'new accessor') Object.defineProperty(value, 'newPassword', {
      enumerable: true, get: () => { reads++; return nextPassword; } });
    await rejected(f, 400, 'VALIDATION_ERROR', { ...f.request, body: value });
    expect(reads).toBe(0);
    expect(f.hasher.verify.mock.calls.length).toBe(0);
    expect(f.hasher.hash.mock.calls.length).toBe(0);
  });
  test('unknown error toString is not invoked or forwarded', async () => {
    const f = fixture();
    let reads = 0;
    const foreign = Object.defineProperty({}, 'toString', { get: () => {
      reads++;
      throw new Error('PRIVATE_FOREIGN_TOSTRING');
    } });
    f.hasher.verify.mockRejectedValue(foreign);
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(reads).toBe(0);
  });
  test.each([
    ['corrupt over retired proof', 503, 'SERVICE_UNAVAILABLE'],
    ['retired proof over nonce and password', 401, 'SESSION_EXPIRED'],
    ['inactive owner over nonce and password', 401, 'SESSION_EXPIRED'],
    ['owner transfer over nonce and password', 401, 'SESSION_EXPIRED'],
    ['expiry over nonce and password', 401, 'SESSION_EXPIRED'],
    ['valid nonce over password', 403, 'CSRF_INVALID'],
  ] as const)('simultaneous drift priority: %s', async (label, status, code) => {
    const f = fixture();
    let expected = copies.clone(f.root);
    let changed = false;
    f.hasher.verify.mockImplementation(async () => {
      changed = true;
      f.root.accounts[0].passwordHash = 'concurrent-private-phc';
      proofChange(f);
      if (label === 'retired proof over nonce and password' || label === 'corrupt over retired proof') {
        f.root.sessions[0].revokedAt = new Date(baseTime);
      }
      if (label === 'inactive owner over nonce and password') f.root.accounts[0].active = false;
      if (label === 'owner transfer over nonce and password') f.root.sessions[0].adminUserId = f.root.accounts[1].id;
      if (label === 'expiry over nonce and password') f.setTime(baseTime + 900000);
      if (label === 'corrupt over retired proof') f.root.sessions[0].nonceVersion = NaN;
      expected = copies.clone(f.root);
      return true;
    });
    await rejected(f, status, code, f.request, () => expected);
    expect(changed).toBe(true);
    expect(f.hasher.verify.mock.calls.length).toBe(1);
    expect(f.hasher.hash.mock.calls.length).toBe(0);
  });
});

describe('corrected lookup logging and nullable controls', () => {
  test('blocklist receives NFC lowercase new-password digest, not raw or current input', async () => {
    const f = fixture();
    const value = '  A\u0301bCdEfGhIjKlMnOp  ';
    const expected = blocklistIndex(value);
    const rawDigest = createHash('sha256').update(value.toLowerCase(), 'utf8').digest('hex');
    const caseDigest = createHash('sha256').update(value.normalize('NFC'), 'utf8').digest('hex');
    expect(expected === rawDigest).toBe(false);
    expect(expected === caseDigest).toBe(false);
    expect(expected === blocklistIndex(oldPassword)).toBe(false);
    f.blocklist.hasDigest.mockImplementation(digest => digest === expected);
    await rejected(f, 400, 'PASSWORD_POLICY', body(f, value));
    expect(f.blocklist.hasDigest.mock.calls[0]?.[0] === expected).toBe(true);
    expect(f.hasher.hash.mock.calls.length).toBe(0);
  });
  test.each(consoleChannels)('privacy capture includes console.%s', async method => {
    const f = fixture();
    const before = copies.clone(f.root);
    const safe = await capture(() => observeLogs(f, f.request, async () => { console[method]('public'); }));
    expect(safe === undefined).toBe(true);
    const leaked = await capture(() => observeLogs(f, f.request, async () => { console[method](oldPassword); }));
    expect(leaked instanceof Error).toBe(true);
    expect(copies.equal(f.root, before)).toBe(true);
  });
  test.each([['non-null unequal', baseTime, 1], ['non-null equal', baseTime - 10000, 0],
    ['not null', null, 1]] as const)('nullable NOT: %s', async (_label, value, count) => {
    const f = fixture();
    const expected = copies.clone(f.root);
    const target = value === null ? null : new Date(value);
    const result = await f.ports.authSession.updateMany({
      where: { revokedAt: { not: target } }, data: { nonceVersion: { increment: 1 } } });
    if (count === 1) expected.sessions[3].nonceVersion = 2;
    expected.writes = count;
    expect(result.count).toBe(count);
    expect(copies.equal(f.root, expected)).toBe(true);
  });
});

describe('compound nullable truth controls', () => {
  test.each([
    ['negated date', { NOT: { revokedAt: new Date(baseTime) } }, 1],
    ['negated equal date', { NOT: { revokedAt: new Date(baseTime - 10000) } }, 0],
    ['null OR date', { OR: [{ revokedAt: null }, { revokedAt: new Date(baseTime - 10000) }] }, 4],
    ['null AND inequality', { AND: [{ revokedAt: null }, { revokedAt: { not: new Date(baseTime) } }] }, 0],
  ] as const)('nullable truth: %s', async (_label, query, count) => {
    const f = fixture();
    const expected = copies.clone(f.root);
    const result = await f.ports.authSession.updateMany({ where: query, data: { nonceVersion: { increment: 1 } } });
    if (count === 1) expected.sessions[3].nonceVersion = 2;
    if (count === 4) expected.sessions.forEach(row => { row.nonceVersion = 2; });
    expected.writes = count;
    expect(result.count).toBe(count);
    expect(copies.equal(f.root, expected)).toBe(true);
  });
});

describe('early precedence and service interference', () => {
  test.each([
    ['body', 400, 'VALIDATION_ERROR'], ['session', 401, 'SESSION_EXPIRED'],
    ['csrf', 403, 'CSRF_INVALID'], ['verifier', 401, 'INVALID_CREDENTIALS'],
  ] as const)('competing failures stop at %s', async (stage, status, code) => {
    const f = fixture();
    let databaseReads = 0;
    f.setHook(current => { if (current === 'schema:read') databaseReads++; });
    f.hasher.verify.mockResolvedValue(false);
    const request: { body: unknown; origin?: unknown; cookieHeader?: unknown; csrfToken?: unknown } =
      { ...f.request, body: { currentPassword: oldPassword, newPassword: 'short' } };
    if (stage === 'body') request.body = null;
    if (stage === 'session' || stage === 'body') request.cookieHeader = undefined;
    if (stage !== 'verifier') request.csrfToken = undefined;
    await rejected(f, status, code, request);
    expect(f.hasher.verify.mock.calls.length).toBe(stage === 'verifier' ? 1 : 0);
    expect(f.hasher.hash.mock.calls.length).toBe(0);
    expect(f.blocklist.hasDigest.mock.calls.length).toBe(0);
    expect(f.randomBytes.mock.calls.length).toBe(0);
    if (stage === 'body') expect(databaseReads).toBe(0);
  });
  test('service abort preserves a foreign actor after an accepted own write', async () => {
    const f = fixture();
    let changed = false;
    const before = copies.clone(f.root);
    let expected = copies.clone(before);
    f.setHook((stage, _reply, buffer, mutations) => {
      if (changed || !buffer || !mutations || buffer.writes <= before.writes ||
        changedRows(before, buffer) === 0 ||
        !['accounts:write', 'sessions:write', 'sessions:create'].includes(stage)) return;
      changed = true;
      f.root.accounts[1].version = 9;
      f.root.writes++;
      expected = copies.clone(f.root);
    });
    await rejected(f, 503, 'SERVICE_UNAVAILABLE', f.request, () => expected);
    expect(changed).toBe(true);
  });
});

describe('remaining prototype mutation and lookup boundaries', () => {
  test.each([Object.prototype, Error.prototype, Array.prototype])(
    'intrinsic-like inherited data is screened without modifying globals', prototype => {
      const synthetic = Object.create(null, Object.getOwnPropertyDescriptors(prototype));
      const intrinsics = new Map(nativeMetadata);
      intrinsics.set(synthetic, nativeMetadata.get(prototype)!);
      const value = Object.create(synthetic);
      expect(privateFree(value, 0, [oldPassword], intrinsics)).toBe(true);
      Object.defineProperty(synthetic, 'unexpected', { value: oldPassword });
      expect(privateFree(value, 0, [oldPassword], intrinsics)).toBe(false);
    });
  test('no-match update hooks do not claim accepted mutations', async () => {
    const f = fixture();
    const before = copies.clone(f.root);
    let effects: number | undefined;
    let buffered: ModelRows<Row, Row> | undefined;
    f.setHook((stage, _reply, buffer, mutations) => {
      if (stage === 'accounts:write') { effects = mutations; buffered = buffer; }
    });
    const result = await f.ports.adminUser.updateMany({
      where: { id: 'absent' }, data: { mustChangePassword: false } });
    expect(result.count).toBe(0);
    expect(effects).toBe(0);
    expect(!!buffered && copies.equal(buffered, before) && copies.equal(f.root, before)).toBe(true);
  });
  test('lookup accessor failure is unavailable without inspecting its cause', async () => {
    const f = fixture();
    let reads = 0;
    let causeReads = 0;
    const cause = Object.defineProperty({}, 'toString', { get: () => { causeReads++; return oldPassword; } });
    Object.defineProperty(f.blocklist, 'hasDigest', { get: () => { reads++; throw cause; } });
    await rejected(f, 503, 'SERVICE_UNAVAILABLE');
    expect(reads).toBe(1);
    expect(causeReads).toBe(0);
    expect(f.hasher.hash.mock.calls.length).toBe(0);
  });
  test.each([undefined, null, 0, 1, 'true', {}, Promise.resolve(false)])(
    'lookup requires a synchronous boolean, case %#', async value => {
      const f = fixture();
      Object.defineProperty(f.blocklist, 'hasDigest', { value: () => value });
      await rejected(f, 503, 'SERVICE_UNAVAILABLE');
      expect(f.hasher.hash.mock.calls.length).toBe(0);
    });
});
