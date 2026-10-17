import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { CsrfNonceCipher } from './csrf-nonce.cipher';
import type { AuthConfig } from './auth.config';
import { PasswordPolicyError, validateNewPassword, type PasswordBlocklistLookup } from './password-policy';

export type AdminUsersRequest = Readonly<{
  cookieHeader?: string;
  origin?: string;
  csrfToken?: string;
  body?: unknown;
  id?: string;
  query?: Readonly<Record<string, unknown>>;
}>;

export type AdminUsersErrorCode = 'VALIDATION_ERROR' | 'PASSWORD_POLICY' | 'ORIGIN_INVALID' | 'CSRF_INVALID' |
  'PASSWORD_CHANGE_REQUIRED' | 'SESSION_EXPIRED' | 'EMAIL_IN_USE' | 'VERSION_CONFLICT' |
  'LAST_ACTIVE_ADMIN' | 'USER_NOT_FOUND' | 'SERVICE_UNAVAILABLE';
export type AdminUsersErrorMetadata = Readonly<{ status: number; code: AdminUsersErrorCode }>;
const errors = new WeakMap<object, AdminUsersErrorMetadata>();
const messages: Record<AdminUsersErrorCode, string> = {
  VALIDATION_ERROR: 'Los datos enviados no son válidos',
  PASSWORD_POLICY: 'La contraseña no cumple la política de seguridad',
  ORIGIN_INVALID: 'Origen no permitido',
  CSRF_INVALID: 'Solicitud inválida',
  PASSWORD_CHANGE_REQUIRED: 'Se requiere cambiar la contraseña',
  SESSION_EXPIRED: 'La sesión ha expirado',
  EMAIL_IN_USE: 'El correo electrónico ya está en uso',
  VERSION_CONFLICT: 'El usuario fue modificado por otra operación',
  LAST_ACTIVE_ADMIN: 'No se puede desactivar el último administrador activo',
  USER_NOT_FOUND: 'No se encontró el usuario',
  SERVICE_UNAVAILABLE: 'Servicio temporalmente no disponible',
};
const errorStatuses: Record<AdminUsersErrorCode, number> = {
  VALIDATION_ERROR: 400, PASSWORD_POLICY: 400, ORIGIN_INVALID: 403, CSRF_INVALID: 403,
  PASSWORD_CHANGE_REQUIRED: 403, SESSION_EXPIRED: 401, EMAIL_IN_USE: 409,
  VERSION_CONFLICT: 409, LAST_ACTIVE_ADMIN: 409, USER_NOT_FOUND: 404, SERVICE_UNAVAILABLE: 503,
};

export class AdminUsersRouteException extends HttpException {
  constructor(code: AdminUsersErrorCode) {
    const status = errorStatuses[code];
    super(code, status);
    errors.set(this, Object.freeze({ status, code }));
  }
}

export function getAdminUsersErrorMetadata(error: unknown): AdminUsersErrorMetadata | undefined {
  return typeof error === 'object' && error !== null ? errors.get(error) : undefined;
}

export function getAdminUsersErrorMessage(code: AdminUsersErrorCode): string { return messages[code]; }

const SESSION_COOKIE = 'abar_admin_session';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const USER_SELECT = {
  id: true, name: true, email: true, active: true, mustChangePassword: true, version: true,
  createdAt: true, updatedAt: true,
} as const;
type Authenticated = Readonly<{
  sessionId: string;
  adminUserId: string;
  nonceVersion: number;
  nonceCiphertext: Buffer;
  nonceIv: Buffer;
  nonceTag: Buffer;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  csrfToken: string;
}>;
type PageQuery = Readonly<{ page: number; pageSize: number; sortField: 'name' | 'email' | 'createdAt'; direction: 'asc' | 'desc' }>;
export type AdminUserView = Readonly<{
  id: string; name: string; email: string; active: boolean; mustChangePassword: boolean; version: number;
  createdAt: string; updatedAt: string;
}>;
export type AdminUserList = Readonly<{
  items: readonly AdminUserView[];
  pageInfo: Readonly<{ page: number; pageSize: number; totalItems: number; totalPages: number }>;
}>;

function fail(code: AdminUsersErrorCode): never { throw new AdminUsersRouteException(code); }
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactObject(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  try {
    if (!isRecord(value)) return fail('VALIDATION_ERROR');
    const keys = Reflect.ownKeys(value);
    const allowed = new Set([...required, ...optional]);
    if (keys.some((key) => typeof key !== 'string' || !allowed.has(key)) || required.some((key) => !keys.includes(key))) {
      return fail('VALIDATION_ERROR');
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return fail('VALIDATION_ERROR');
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (getAdminUsersErrorMetadata(error)) throw error;
    return fail('VALIDATION_ERROR');
  }
}
function canonicalToken(value: unknown): value is string {
  if (typeof value !== 'string' || !TOKEN.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value;
}
function hasForbiddenControls(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code >= 0 && code <= 8) || (code >= 10 && code <= 31) || code === 127) return true;
  }
  return false;
}
function readSessionToken(header: unknown): string {
  if (typeof header !== 'string' || header.length > 16_384 || hasForbiddenControls(header)) return fail('SESSION_EXPIRED');
  let token: string | undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    if (token !== undefined) return fail('SESSION_EXPIRED');
    token = part.slice(separator + 1).trim();
  }
  return canonicalToken(token) ? token : fail('SESSION_EXPIRED');
}
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function validBytes(value: unknown, length: number): Buffer | undefined {
  return value instanceof Uint8Array && value.byteLength === length ? Buffer.from(value) : undefined;
}
function mapPolicyError(error: unknown): never {
  if (!(error instanceof PasswordPolicyError)) return fail('SERVICE_UNAVAILABLE');
  if (error.kind === 'unavailable') return fail('SERVICE_UNAVAILABLE');
  return fail('PASSWORD_POLICY');
}
function userView(row: any): AdminUserView {
  return {
    id: row.id, name: row.name, email: row.email, active: row.active, mustChangePassword: row.mustChangePassword,
    version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function validateUserRow(row: any): void {
  if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || typeof row.name !== 'string' ||
      [...row.name].length < 1 || [...row.name].length > 100 || typeof row.email !== 'string' ||
      row.email.length > 254 || !EMAIL.test(row.email) || typeof row.active !== 'boolean' ||
      typeof row.mustChangePassword !== 'boolean' || !Number.isSafeInteger(row.version) || row.version < 1 ||
      !validDate(row.createdAt) || !validDate(row.updatedAt)) fail('SERVICE_UNAVAILABLE');
}
function parsePageQuery(query: unknown): PageQuery {
  const input = query === undefined ? Object.create(null) : exactObject(query, [], ['page', 'pageSize', 'sort']);
  const positiveInt = (value: unknown, fallback: number, max: number): number => {
    if (value === undefined) return fallback;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max) return value;
    if (typeof value === 'string' && /^(?:[1-9][0-9]*)$/.test(value) && Number(value) <= max) return Number(value);
    return fail('VALIDATION_ERROR');
  };
  const page = positiveInt(input.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = positiveInt(input.pageSize, 20, 100);
  const sort = input.sort === undefined ? '-createdAt' : input.sort;
  if (typeof sort !== 'string' || !['name', '-name', 'email', '-email', 'createdAt', '-createdAt'].includes(sort)) fail('VALIDATION_ERROR');
  const descending = sort.startsWith('-');
  return Object.freeze({ page, pageSize, sortField: (descending ? sort.slice(1) : sort) as PageQuery['sortField'], direction: descending ? 'desc' : 'asc' });
}
function normalizedEmail(value: unknown): string {
  if (typeof value !== 'string') return fail('VALIDATION_ERROR');
  const email = value.trim().toLowerCase();
  if ([...email].length < 1 || [...email].length > 254 || !EMAIL.test(email)) return fail('VALIDATION_ERROR');
  return email;
}
function validName(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 100) return fail('VALIDATION_ERROR');
  return value;
}
function positiveVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return fail('VALIDATION_ERROR');
  return value as number;
}
function sanitizedReason(value: unknown, password: string): string {
  if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 500) return fail('VALIDATION_ERROR');
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    result += code <= 31 || code === 127 ? ' ' : character;
  }
  result = result.trim();
  if ([...result].length < 1 || [...result].length > 500) return fail('VALIDATION_ERROR');
  return result.normalize('NFC').includes(password) ? 'Redacted audit reason' : result;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CsrfNonceCipher,
    private readonly config: AuthConfig,
    private readonly hasher: Readonly<{ hash(password: unknown): Promise<string> }>,
    private readonly blocklist: PasswordBlocklistLookup,
    private readonly now: () => number = Date.now,
  ) {}

  async list(request: AdminUsersRequest): Promise<AdminUserList> {
    const auth = await this.authenticate(request, false);
    const query = parsePageQuery(request.query);
    const skip = (query.page - 1) * query.pageSize;
    if (!Number.isSafeInteger(skip)) fail('VALIDATION_ERROR');
    let rows: any[];
    let totalItems: number;
    try {
      [rows, totalItems] = await Promise.all([
        this.prisma.adminUser.findMany({
          select: USER_SELECT, skip, take: query.pageSize,
          orderBy: [{ [query.sortField]: query.direction }, { id: 'asc' }],
        }),
        this.prisma.adminUser.count(),
      ]) as [any[], number];
    } catch { return fail('SERVICE_UNAVAILABLE'); }
    const now = this.readNow();
    await this.assertStillAuthorized(this.prisma, auth, now, false);
    if (!Array.isArray(rows) || !Number.isSafeInteger(totalItems) || totalItems < 0 || rows.length > query.pageSize) fail('SERVICE_UNAVAILABLE');
    rows.forEach(validateUserRow);
    return Object.freeze({
      items: Object.freeze(rows.map(userView)),
      pageInfo: Object.freeze({ page: query.page, pageSize: query.pageSize, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) }),
    });
  }

  async create(request: AdminUsersRequest): Promise<AdminUserView> {
    const auth = await this.authenticate(request, true);
    const body = exactObject(request.body, ['name', 'email', 'temporaryPassword']);
    const name = validName(body.name);
    const email = normalizedEmail(body.email);
    let password: string;
    try { password = validateNewPassword(body.temporaryPassword, this.blocklist); } catch (error) { return mapPolicyError(error); }
    const passwordHash = await this.hashPassword(password);
    const now = this.readNow();
    try {
      const row = await this.prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1868787565)`;
        await this.assertStillAuthorized(tx, auth, now, true);
        try {
          const created = await tx.adminUser.create({ data: {
            name, email, passwordHash, active: true, mustChangePassword: true, version: 1,
            createdAt: new Date(now), updatedAt: new Date(now),
          }, select: USER_SELECT });
          validateUserRow(created);
          await tx.adminUserAudit.create({ data: {
            actorAdminUserId: auth.adminUserId, targetAdminUserId: created.id, action: 'CREATED', reason: null,
          } });
          return created;
        } catch (error) {
          if ((error as { code?: unknown })?.code === 'P2002') fail('EMAIL_IN_USE');
          throw error;
        }
      });
      return Object.freeze(userView(row));
    } catch (error) { return this.mapDatabaseError(error); }
  }

  async patch(request: AdminUsersRequest): Promise<AdminUserView> {
    const auth = await this.authenticate(request, true);
    if (typeof request.id !== 'string' || !UUID.test(request.id)) fail('VALIDATION_ERROR');
    const body = exactObject(request.body, ['expectedVersion'], ['name', 'active']);
    if (!Object.hasOwn(body, 'name') && !Object.hasOwn(body, 'active')) fail('VALIDATION_ERROR');
    const expectedVersion = positiveVersion(body.expectedVersion);
    const name = Object.hasOwn(body, 'name') ? validName(body.name) : undefined;
    if (Object.hasOwn(body, 'active') && typeof body.active !== 'boolean') fail('VALIDATION_ERROR');
    const active = body.active as boolean | undefined;
    const now = this.readNow();
    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1868787565)`;
        await this.assertStillAuthorized(tx, auth, now, true);
        if (active === false) await tx.$queryRaw`SELECT "id" FROM "AdminUser" WHERE "active" = TRUE ORDER BY "id" FOR UPDATE`;
        const current = await tx.adminUser.findUnique({ where: { id: request.id }, select: USER_SELECT });
        if (!current) fail('USER_NOT_FOUND');
        validateUserRow(current);
        if (current.version !== expectedVersion) fail('VERSION_CONFLICT');
        const changedName = name !== undefined && name !== current.name;
        const changedActive = active !== undefined && active !== current.active;
        if (!changedName && !changedActive) return current;
        if (changedActive && active === false) {
          const activeCount = await tx.adminUser.count({ where: { active: true } });
          if (activeCount <= 1) fail('LAST_ACTIVE_ADMIN');
        }
        const data: Record<string, unknown> = { version: { increment: 1 }, updatedAt: new Date(now) };
        if (changedName) data.name = name;
        if (changedActive) data.active = active;
        const updated = await tx.adminUser.updateMany({ where: { id: request.id, version: expectedVersion }, data });
        if (updated.count !== 1) fail('VERSION_CONFLICT');
        if (changedActive && active === false) {
          await tx.authSession.updateMany({ where: { adminUserId: request.id, revokedAt: null }, data: { revokedAt: new Date(now) } });
        }
        const view = await tx.adminUser.findUnique({ where: { id: request.id }, select: USER_SELECT });
        validateUserRow(view);
        await tx.adminUserAudit.create({ data: {
          actorAdminUserId: auth.adminUserId, targetAdminUserId: request.id,
          action: changedActive ? (active ? 'ACTIVATED' : 'DEACTIVATED') : 'UPDATED', reason: null,
        } });
        return view;
      });
      return Object.freeze(userView(result));
    } catch (error) { return this.mapDatabaseError(error); }
  }

  async resetPassword(request: AdminUsersRequest): Promise<void> {
    const auth = await this.authenticate(request, true);
    if (typeof request.id !== 'string' || !UUID.test(request.id)) fail('VALIDATION_ERROR');
    const body = exactObject(request.body, ['temporaryPassword', 'reason']);
    let password: string;
    try { password = validateNewPassword(body.temporaryPassword, this.blocklist); } catch (error) { return mapPolicyError(error); }
    const reason = sanitizedReason(body.reason, password);
    const passwordHash = await this.hashPassword(password);
    const now = this.readNow();
    try {
      await this.prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1868787565)`;
        await this.assertStillAuthorized(tx, auth, now, true);
        const target = await tx.adminUser.findUnique({ where: { id: request.id }, select: USER_SELECT });
        if (!target) fail('USER_NOT_FOUND');
        validateUserRow(target);
        const updated = await tx.adminUser.updateMany({
          where: { id: request.id }, data: {
            passwordHash, mustChangePassword: true, version: { increment: 1 }, updatedAt: new Date(now),
          },
        });
        if (updated.count !== 1) fail('USER_NOT_FOUND');
        await tx.authSession.updateMany({ where: { adminUserId: request.id, revokedAt: null }, data: { revokedAt: new Date(now) } });
        await tx.adminUserAudit.create({ data: {
          actorAdminUserId: auth.adminUserId, targetAdminUserId: request.id, action: 'PASSWORD_RESET', reason,
        } });
      });
    } catch (error) { this.mapDatabaseError(error); }
  }

  private async authenticate(request: AdminUsersRequest, mutation: boolean): Promise<Authenticated> {
    if (mutation && (typeof request.origin !== 'string' || !this.config.allowedOrigins.includes(request.origin))) fail('ORIGIN_INVALID');
    const token = readSessionToken(request.cookieHeader);
    if (mutation && !canonicalToken(request.csrfToken)) fail('CSRF_INVALID');
    let available: boolean;
    try { available = this.cipher.available; } catch { return fail('SERVICE_UNAVAILABLE'); }
    if (!available) fail('SERVICE_UNAVAILABLE');
    const id = createHash('sha256').update(token, 'utf8').digest('hex');
    let row: any;
    try {
      row = await this.prisma.authSession.findUnique({ where: { id }, select: {
        id: true, adminUserId: true, nonceVersion: true, nonceCiphertext: true, nonceIv: true, nonceTag: true,
        absoluteExpiresAt: true, idleExpiresAt: true, revokedAt: true,
        adminUser: { select: { id: true, active: true, mustChangePassword: true } },
      } });
    } catch { return fail('SERVICE_UNAVAILABLE'); }
    if (!row) fail('SESSION_EXPIRED');
    const ciphertext = validBytes(row.nonceCiphertext, 32);
    const iv = validBytes(row.nonceIv, 12);
    const tag = validBytes(row.nonceTag, 16);
    const owner = row.adminUser;
    if (row.id !== id || typeof row.adminUserId !== 'string' || !UUID.test(row.adminUserId) ||
        !Number.isSafeInteger(row.nonceVersion) || row.nonceVersion < 1 || !ciphertext || !iv || !tag ||
        !validDate(row.absoluteExpiresAt) || !validDate(row.idleExpiresAt) ||
        (row.revokedAt !== null && !validDate(row.revokedAt)) || owner?.id !== row.adminUserId ||
        typeof owner.active !== 'boolean' || typeof owner.mustChangePassword !== 'boolean') fail('SERVICE_UNAVAILABLE');
    if (row.revokedAt !== null || row.absoluteExpiresAt.getTime() <= this.readNow() ||
        row.idleExpiresAt.getTime() <= this.readNow() || !owner.active) fail('SESSION_EXPIRED');
    if (owner.mustChangePassword) fail('PASSWORD_CHANGE_REQUIRED');
    const auth: Authenticated = {
      sessionId: id, adminUserId: row.adminUserId, nonceVersion: row.nonceVersion,
      nonceCiphertext: ciphertext, nonceIv: iv, nonceTag: tag,
      absoluteExpiresAt: row.absoluteExpiresAt, idleExpiresAt: row.idleExpiresAt,
      csrfToken: request.csrfToken ?? '',
    };
    if (mutation) this.assertCsrf(auth, this.readNow());
    return auth;
  }

  private assertCsrf(auth: Authenticated, now: number): void {
    let nonce: Buffer | undefined;
    let supplied: Buffer | undefined;
    try {
      nonce = this.cipher.decrypt('session', auth.sessionId, auth.nonceVersion, {
        ciphertext: Buffer.from(auth.nonceCiphertext), iv: Buffer.from(auth.nonceIv), tag: Buffer.from(auth.nonceTag),
      });
      if (!Buffer.isBuffer(nonce) || nonce.length !== 32 || !canonicalToken(auth.csrfToken)) fail('SERVICE_UNAVAILABLE');
      supplied = Buffer.from(auth.csrfToken, 'base64url');
      if (!timingSafeEqual(nonce, supplied)) fail('CSRF_INVALID');
      if (auth.absoluteExpiresAt.getTime() <= now || auth.idleExpiresAt.getTime() <= now) fail('SESSION_EXPIRED');
    } catch (error) {
      if (getAdminUsersErrorMetadata(error)) throw error;
      fail('SERVICE_UNAVAILABLE');
    } finally { nonce?.fill(0); supplied?.fill(0); }
  }

  private async assertStillAuthorized(tx: any, auth: Authenticated, now: number, mutation: boolean): Promise<void> {
    if (mutation) {
      try {
        await tx.$queryRaw`SELECT "id" FROM "AdminUser" WHERE "id" = ${auth.adminUserId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id" = ${auth.sessionId} FOR UPDATE`;
      } catch { return fail('SERVICE_UNAVAILABLE'); }
    }
    let row: any;
    try {
      row = await tx.authSession.findUnique({ where: { id: auth.sessionId }, select: {
        id: true, adminUserId: true, nonceVersion: true, nonceCiphertext: true, nonceIv: true, nonceTag: true,
        absoluteExpiresAt: true, idleExpiresAt: true, revokedAt: true,
        adminUser: { select: { id: true, active: true, mustChangePassword: true } },
      } });
    } catch { return fail('SERVICE_UNAVAILABLE'); }
    if (!row) fail('SESSION_EXPIRED');
    const ciphertext = validBytes(row.nonceCiphertext, 32);
    const iv = validBytes(row.nonceIv, 12);
    const tag = validBytes(row.nonceTag, 16);
    if (row.id !== auth.sessionId || row.adminUserId !== auth.adminUserId ||
        !Number.isSafeInteger(row.nonceVersion) || row.nonceVersion < 1 || !ciphertext || !iv || !tag ||
        !validDate(row.absoluteExpiresAt) || !validDate(row.idleExpiresAt) ||
        (row.revokedAt !== null && !validDate(row.revokedAt)) ||
        typeof row.adminUser?.active !== 'boolean' || typeof row.adminUser?.mustChangePassword !== 'boolean') fail('SERVICE_UNAVAILABLE');
    if (row.revokedAt !== null || row.absoluteExpiresAt.getTime() <= now || row.idleExpiresAt.getTime() <= now ||
        row.adminUser.id !== auth.adminUserId || !row.adminUser.active) fail('SESSION_EXPIRED');
    if (row.adminUser.mustChangePassword) fail('PASSWORD_CHANGE_REQUIRED');
    if (row.nonceVersion !== auth.nonceVersion || !ciphertext.equals(auth.nonceCiphertext) ||
        !iv.equals(auth.nonceIv) || !tag.equals(auth.nonceTag)) fail('CSRF_INVALID');
    if (mutation) this.assertCsrf(auth, now);
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      const hash = await this.hasher.hash(password);
      if (typeof hash !== 'string' || hash.length < 1 || hash.length > 256) fail('SERVICE_UNAVAILABLE');
      return hash;
    } catch (error) {
      if (getAdminUsersErrorMetadata(error)) throw error;
      if (error instanceof PasswordPolicyError && error.kind === 'invalid') fail('PASSWORD_POLICY');
      fail('SERVICE_UNAVAILABLE');
    }
  }

  private async mapDatabaseError(error: unknown): Promise<never> {
    if (getAdminUsersErrorMetadata(error)) throw error;
    if ((error as { code?: unknown })?.code === 'P2002') fail('EMAIL_IN_USE');
    return fail('SERVICE_UNAVAILABLE');
  }

  private readNow(): number {
    try {
      const value = this.now();
      if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) throw new Error();
      return value;
    } catch { return fail('SERVICE_UNAVAILABLE'); }
  }
}
