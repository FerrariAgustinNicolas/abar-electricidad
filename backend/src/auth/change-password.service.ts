import { createHash, timingSafeEqual } from 'node:crypto';
import { types } from 'node:util';
import { PasswordPolicyError, validateNewPassword } from './password-policy';
import type { AuthConfig } from './auth.config';
import type { CsrfNonceCipher } from './csrf-nonce.cipher';
import type { PasswordBlocklistLookup } from './password-policy';
import type { PrismaService } from '../prisma/prisma.service';

export type ChangePasswordErrorCode =
  | 'VALIDATION_ERROR' | 'PASSWORD_POLICY' | 'SESSION_EXPIRED' | 'INVALID_CREDENTIALS'
  | 'ORIGIN_INVALID' | 'CSRF_INVALID' | 'SERVICE_UNAVAILABLE';

export type ChangePasswordRequest = Readonly<{
  body: unknown;
  origin?: unknown;
  csrfToken?: unknown;
  cookieHeader?: unknown;
}>;

export type ChangePasswordResult = Readonly<{
  status: 204;
  sessionCookie: string;
  csrfToken: string;
}>;

export type ChangePasswordDependencies = Readonly<{
  prisma: PrismaService;
  hasher: Readonly<{ verify(phc: unknown, password: unknown): Promise<boolean>; hash(password: unknown): Promise<string> }>;
  blocklist: PasswordBlocklistLookup;
  cipher: CsrfNonceCipher;
  config: AuthConfig;
  now: () => number;
  randomBytes: (size: number) => Buffer;
}>;

export type ChangePasswordOwnedError = Readonly<{
  status: 400 | 401 | 403 | 503;
  code: ChangePasswordErrorCode;
}>;
const ownedChangePasswordErrors = new WeakMap<object, ChangePasswordOwnedError>();
export function readChangePasswordError(value: unknown): ChangePasswordOwnedError | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  return ownedChangePasswordErrors.get(value);
}

type Database = Pick<PrismaService, 'adminUser' | 'authSession'>;
type Data = Record<string, unknown>;
type Reject = (status: ChangePasswordOwnedError['status'], code: ChangePasswordErrorCode) => never;
type Snapshot = Readonly<{
  id: string;
  adminUserId: string;
  nonceVersion: number;
  nonceCiphertext: Buffer;
  nonceIv: Buffer;
  nonceTag: Buffer;
  createdAt: number;
  lastActivityAt: number;
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  revokedAt: number | null;
  owner: Readonly<{
    id: string;
    active: boolean;
    mustChangePassword: boolean;
    passwordHash: string;
    version: number;
  }>;
}>;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VERSION = 2147483647;
const byteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype), 'length',
)!.get!;
const selectSession = {
  id: true, adminUserId: true, nonceVersion: true,
  nonceCiphertext: true, nonceIv: true, nonceTag: true,
  createdAt: true, lastActivityAt: true, absoluteExpiresAt: true,
  idleExpiresAt: true, revokedAt: true,
  adminUser: { select: {
    id: true, name: true, email: true, passwordHash: true, active: true,
    mustChangePassword: true, version: true, createdAt: true, updatedAt: true,
  } },
} as const;

// Untrusted records are inspected as own data only, never through getters.
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return undefined;
  const field = Object.getOwnPropertyDescriptor(value, key);
  return field && 'value' in field ? field.value : undefined;
}
function data(value: unknown, reject: Reject): Data {
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    return reject(503, 'SERVICE_UNAVAILABLE');
  }
  const result: Data = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !('value' in field)) {
      return reject(503, 'SERVICE_UNAVAILABLE');
    }
    result[key] = field.value;
  }
  return result;
}
function canonicalToken(value: unknown): value is string {
  if (typeof value !== 'string' || !TOKEN.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}
function cookieToken(header: unknown): string | undefined {
  // eslint-disable-next-line no-control-regex -- Intentionally reject HTTP control characters while allowing horizontal tabs.
  if (typeof header !== 'string' || header.length > 16384 || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(header)) {
    return undefined;
  }
  let found: string | undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== 'abar_admin_session') continue;
    if (found !== undefined) return undefined;
    found = part.slice(separator + 1).trim();
  }
  return canonicalToken(found) ? found : undefined;
}
function bytes(value: unknown, length: number, reject: Reject): Buffer {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !types.isUint8Array(value) ||
      ![Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(value)) ||
      byteLength.call(value) !== length || Reflect.ownKeys(value).length !== length) {
    return reject(503, 'SERVICE_UNAVAILABLE');
  }
  const copy = Buffer.alloc(length);
  for (let index = 0; index < length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !('value' in field)) return reject(503, 'SERVICE_UNAVAILABLE');
    copy[index] = field.value;
  }
  return copy;
}
function date(value: unknown, reject: Reject): number {
  if (types.isProxy(value) || !types.isDate(value)) return reject(503, 'SERVICE_UNAVAILABLE');
  const time = Date.prototype.getTime.call(value);
  if (!Number.isFinite(time)) return reject(503, 'SERVICE_UNAVAILABLE');
  return time;
}
function version(value: unknown, reject: Reject): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_VERSION) {
    return reject(503, 'SERVICE_UNAVAILABLE');
  }
  return value;
}
function snapshot(value: unknown, id: string, reject: Reject): Snapshot {
  const row = data(value, reject);
  const owner = data(row.adminUser, reject);
  if (row.id !== id || typeof row.adminUserId !== 'string' || !UUID.test(row.adminUserId) ||
      owner.id !== row.adminUserId || typeof owner.active !== 'boolean' ||
      typeof owner.mustChangePassword !== 'boolean' || typeof owner.passwordHash !== 'string' ||
      owner.passwordHash.length === 0 || typeof owner.name !== 'string' || typeof owner.email !== 'string') {
    return reject(503, 'SERVICE_UNAVAILABLE');
  }
  date(owner.createdAt, reject);
  date(owner.updatedAt, reject);
  return {
    id, adminUserId: row.adminUserId,
    nonceVersion: version(row.nonceVersion, reject),
    nonceCiphertext: bytes(row.nonceCiphertext, 32, reject),
    nonceIv: bytes(row.nonceIv, 12, reject),
    nonceTag: bytes(row.nonceTag, 16, reject),
    createdAt: date(row.createdAt, reject),
    lastActivityAt: date(row.lastActivityAt, reject),
    absoluteExpiresAt: date(row.absoluteExpiresAt, reject),
    idleExpiresAt: date(row.idleExpiresAt, reject),
    revokedAt: row.revokedAt === null ? null : date(row.revokedAt, reject),
    owner: {
      id: row.adminUserId, active: owner.active, mustChangePassword: owner.mustChangePassword,
      passwordHash: owner.passwordHash, version: version(owner.version, reject),
    },
  };
}
function envelope(state: Snapshot) {
  return { ciphertext: state.nonceCiphertext, iv: state.nonceIv, tag: state.nonceTag };
}
function proofChanged(before: Snapshot, after: Snapshot): boolean {
  return before.nonceVersion !== after.nonceVersion ||
    !before.nonceCiphertext.equals(after.nonceCiphertext) ||
    !before.nonceIv.equals(after.nonceIv) || !before.nonceTag.equals(after.nonceTag);
}

/** Validates old proof, then atomically rotates credentials without renewing expiry. */
export class ChangePasswordService {
  constructor(private readonly dependencies: ChangePasswordDependencies) {}

  async changePassword(request: ChangePasswordRequest): Promise<ChangePasswordResult> {
    const localErrors = new WeakSet<object>();
    const reject: Reject = (status, code) => {
      const error: object = Object.freeze(Object.assign(Object.create(null), { message: code }));
      ownedChangePasswordErrors.set(error, Object.freeze({ status, code }));
      localErrors.add(error);
      throw error;
    };
    // Each dependency boundary discards arbitrary exceptions without inspecting them.
    const sync = <Value>(work: () => Value): Value => {
      try { return work(); } catch { return reject(503, 'SERVICE_UNAVAILABLE'); }
    };
    const io = async <Value>(work: () => Promise<Value>): Promise<Value> => {
      try { return await work(); } catch { return reject(503, 'SERVICE_UNAVAILABLE'); }
    };
    const now = (): number => {
      const value = sync(() => this.dependencies.now());
      if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) {
        return reject(503, 'SERVICE_UNAVAILABLE');
      }
      return value;
    };
    const live = (state: Snapshot, time: number, owner = state.adminUserId): void => {
      if (state.adminUserId !== owner || !state.owner.active || state.revokedAt !== null ||
          state.absoluteExpiresAt <= time || state.idleExpiresAt <= time) {
        reject(401, 'SESSION_EXPIRED');
      }
    };
    const read = async (database: Database, id: string): Promise<Snapshot | null> => {
      const row = await io(() => database.authSession.findUnique({ where: { id }, select: selectSession }));
      return row === null ? null : snapshot(row, id, reject);
    };
    const decrypt = (state: Snapshot): Buffer => {
      const available = sync(() => this.dependencies.cipher.available);
      if (available !== true) return reject(503, 'SERVICE_UNAVAILABLE');
      return bytes(sync(() => this.dependencies.cipher.decrypt(
        'session', state.id, state.nonceVersion, envelope(state),
      )), 32, reject);
    };
    const recheck = async (database: Database, original: Snapshot): Promise<Snapshot> => {
      const current = await read(database, original.id);
      const time = now();
      if (!current) return reject(401, 'SESSION_EXPIRED');
      // Validate changed envelopes before classifying a valid nonce race.
      if (proofChanged(original, current)) decrypt(current).fill(0);
      live(current, time, original.adminUserId);
      if (proofChanged(original, current)) return reject(403, 'CSRF_INVALID');
      if (current.owner.passwordHash !== original.owner.passwordHash ||
          current.owner.version !== original.owner.version ||
          current.owner.mustChangePassword !== original.owner.mustChangePassword) {
        return reject(401, 'INVALID_CREDENTIALS');
      }
      return current;
    };

    try {
      const origin = own(request, 'origin');
      const allowed = sync(() => this.dependencies.config.allowedOrigins);
      if (typeof origin !== 'string' || !allowed.includes(origin)) reject(403, 'ORIGIN_INVALID');

      const body = own(request, 'body');
      if (!body || typeof body !== 'object' || types.isProxy(body) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(body))) reject(400, 'VALIDATION_ERROR');
      const keys = Reflect.ownKeys(body);
      const currentPassword = own(body, 'currentPassword');
      const newInput = own(body, 'newPassword');
      if (keys.length !== 2 || !keys.every(key => key === 'currentPassword' || key === 'newPassword') ||
          typeof currentPassword !== 'string' || typeof newInput !== 'string') reject(400, 'VALIDATION_ERROR');

      const token = cookieToken(own(request, 'cookieHeader'));
      if (!token) return reject(401, 'SESSION_EXPIRED');
      const id = createHash('sha256').update(token, 'utf8').digest('hex');
      now();
      const original = await read(this.dependencies.prisma, id);
      if (!original) return reject(401, 'SESSION_EXPIRED');
      live(original, now());
      const nonce = decrypt(original);
      const csrf = own(request, 'csrfToken');
      try {
        if (!canonicalToken(csrf) || !timingSafeEqual(nonce, Buffer.from(csrf, 'base64url'))) {
          reject(403, 'CSRF_INVALID');
        }
      } finally { nonce.fill(0); }

      const verified = await io(() => this.dependencies.hasher.verify(original.owner.passwordHash, currentPassword));
      if (verified === false) return reject(401, 'INVALID_CREDENTIALS');
      if (verified !== true) return reject(503, 'SERVICE_UNAVAILABLE');
      await recheck(this.dependencies.prisma, original);

      let normalized: string;
      try { normalized = validateNewPassword(newInput, this.dependencies.blocklist); }
      catch (error) {
        // Only the policy helper's own fresh errors are interpreted; it discards resource causes.
        if (error && typeof error === 'object' && !types.isProxy(error) &&
            Object.getPrototypeOf(error) === PasswordPolicyError.prototype) {
          const kind = own(error, 'kind');
          if (kind === 'invalid' || kind === 'blocked') reject(400, 'PASSWORD_POLICY');
        }
        return reject(503, 'SERVICE_UNAVAILABLE');
      }
      const hash = await io(() => this.dependencies.hasher.hash(normalized));
      if (typeof hash !== 'string' || hash.length === 0) return reject(503, 'SERVICE_UNAVAILABLE');
      await recheck(this.dependencies.prisma, original);
      if (original.owner.version === MAX_VERSION) return reject(503, 'SERVICE_UNAVAILABLE');
      const secure = sync(() => this.dependencies.config.cookieSecure);
      if (typeof secure !== 'boolean') return reject(503, 'SERVICE_UNAVAILABLE');
      const freshToken = bytes(sync(() => this.dependencies.randomBytes(32)), 32, reject).toString('base64url');
      const freshId = createHash('sha256').update(freshToken, 'utf8').digest('hex');
      if (freshId === original.id) return reject(503, 'SERVICE_UNAVAILABLE');
      const freshNonce = bytes(sync(() => this.dependencies.randomBytes(32)), 32, reject);
      let result: ChangePasswordResult | undefined;
      try {
        await this.dependencies.prisma.$transaction(async tx => {
          await recheck(tx, original);
          const collision = await io(() => tx.authSession.findUnique({ where: { id: freshId }, select: { id: true } }));
          if (collision !== null) reject(503, 'SERVICE_UNAVAILABLE');
          const oldNonce = decrypt(original);
          try {
            if (timingSafeEqual(oldNonce, freshNonce)) reject(503, 'SERVICE_UNAVAILABLE');
          } finally { oldNonce.fill(0); }
          const encrypted = data(sync(() => this.dependencies.cipher.encrypt('session', freshId, 1, freshNonce)), reject);
          const ciphertext = bytes(encrypted.ciphertext, 32, reject);
          const iv = bytes(encrypted.iv, 12, reject);
          const tag = bytes(encrypted.tag, 16, reject);
          const writeTime = now();
          live(original, writeTime);
          const changed = await io(() => tx.adminUser.updateMany({
            where: {
              id: original.owner.id, active: true, version: original.owner.version,
              passwordHash: original.owner.passwordHash, mustChangePassword: original.owner.mustChangePassword,
            },
            data: { passwordHash: hash, version: { increment: 1 }, mustChangePassword: false },
          }));
          if (changed.count !== 1) {
            await recheck(tx, original);
            reject(503, 'SERVICE_UNAVAILABLE');
          }
          live(original, now());
          const retired = await io(() => tx.authSession.updateMany({
            where: {
              id: original.id, adminUserId: original.adminUserId, revokedAt: null,
              nonceVersion: original.nonceVersion, nonceCiphertext: Uint8Array.from(original.nonceCiphertext),
              nonceIv: Uint8Array.from(original.nonceIv), nonceTag: Uint8Array.from(original.nonceTag),
              absoluteExpiresAt: { gt: new Date(writeTime) }, idleExpiresAt: { gt: new Date(writeTime) },
              adminUser: { is: { id: original.owner.id, active: true } },
            },
            data: { revokedAt: new Date(writeTime) },
          }));
          if (retired.count !== 1) {
            await recheck(tx, {
              ...original, owner: { ...original.owner, passwordHash: hash,
                version: original.owner.version + 1, mustChangePassword: false },
            });
            reject(503, 'SERVICE_UNAVAILABLE');
          }
          live(original, now());
          const others = await io(() => tx.authSession.updateMany({
            where: { adminUserId: original.adminUserId, revokedAt: null, NOT: { id: original.id } },
            data: { revokedAt: new Date(writeTime) },
          }));
          if (!Number.isSafeInteger(others.count) || others.count < 0) reject(503, 'SERVICE_UNAVAILABLE');
          live(original, now());
          await io(() => tx.authSession.create({ data: {
            id: freshId, adminUserId: original.adminUserId, nonceVersion: 1,
            nonceCiphertext: Uint8Array.from(ciphertext), nonceIv: Uint8Array.from(iv), nonceTag: Uint8Array.from(tag),
            createdAt: new Date(original.createdAt), lastActivityAt: new Date(original.lastActivityAt),
            absoluteExpiresAt: new Date(original.absoluteExpiresAt), idleExpiresAt: new Date(original.idleExpiresAt),
            revokedAt: null,
          } }));
          const finalTime = now();
          live(original, finalTime);
          const seconds = Math.floor((Math.min(original.absoluteExpiresAt, original.idleExpiresAt) - finalTime) / 1000);
          result = Object.freeze({
            status: 204,
            sessionCookie: `abar_admin_session=${freshToken}; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`,
            csrfToken: freshNonce.toString('base64url'),
          });
        });
      } finally { freshNonce.fill(0); }
      // A dependency returning without running its callback cannot produce success.
      if (!result) return reject(503, 'SERVICE_UNAVAILABLE');
      return result;
    } catch (error) {
      // Preserve only errors minted by this invocation, never another call's error.
      if (error && typeof error === 'object' && localErrors.has(error)) throw error;
      return reject(503, 'SERVICE_UNAVAILABLE');
    }
  }
}
