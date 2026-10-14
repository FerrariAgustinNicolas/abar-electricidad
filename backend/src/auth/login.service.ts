import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { AuthConfig } from './auth.config';
import type { CsrfNonceCipher } from './csrf-nonce.cipher';
import type { PrismaService } from '../prisma/prisma.service';
import { normalizeCredentialPassword, PasswordPolicyError } from './password-policy';

export type LoginErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'ORIGIN_INVALID'
  | 'CSRF_INVALID'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE';

export type LoginOwnedErrorMetadata = Readonly<{
  status: number;
  code: LoginErrorCode;
  retryAfter?: number;
}>;

const loginErrors = new WeakMap<object, LoginOwnedErrorMetadata>();
const allowedErrors = new Map<number, ReadonlySet<LoginErrorCode>>([
  [400, new Set(['VALIDATION_ERROR'])],
  [401, new Set(['INVALID_CREDENTIALS'])],
  [403, new Set(['ORIGIN_INVALID', 'CSRF_INVALID', 'PASSWORD_CHANGE_REQUIRED'])],
  [429, new Set(['RATE_LIMITED'])],
  [503, new Set(['SERVICE_UNAVAILABLE'])],
]);

/** Login-owned error identity is kept out of enumerable exception fields. */
export class LoginRouteException extends HttpException {
  constructor(status: number, code: LoginErrorCode, retryAfter?: number) {
    const valid = allowedErrors.get(status)?.has(code) === true;
    const safeStatus = valid ? status : HttpStatus.SERVICE_UNAVAILABLE;
    const safeCode: LoginErrorCode = valid ? code : 'SERVICE_UNAVAILABLE';
    super(safeCode, safeStatus);
    const safeRetry = valid && status === HttpStatus.TOO_MANY_REQUESTS && Number.isSafeInteger(retryAfter) && retryAfter! > 0 && retryAfter! <= 3600
      ? retryAfter : undefined;
    loginErrors.set(this, Object.freeze({ status: safeStatus, code: safeCode, retryAfter: safeRetry }));
  }
}

export function getLoginRouteErrorMetadata(exception: unknown): LoginOwnedErrorMetadata | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  return loginErrors.get(exception);
}

export type LoginOperationRequest = Readonly<{
  body: unknown;
  origin?: string;
  csrfToken?: string;
  cookieHeader?: string;
  clientIp: string;
}>;

type AdminSessionView = Readonly<{
  admin: Readonly<{ id: string; name: string; email: string; mustChangePassword: boolean }>;
  expiresAt: string;
}>;

export type LoginResult = Readonly<{
  session: AdminSessionView;
  sessionCookie: string;
  clearPreAuthCookie: string;
  csrfToken: string;
}>;

export type LoginServiceDependencies = Readonly<{
  prisma: PrismaService;
  hasher: Readonly<{ verify(phc: unknown, password: unknown): Promise<boolean> }>;
  cipher: CsrfNonceCipher;
  config: AuthConfig;
}>;

type Credentials = Readonly<{ email: string; password: string }>;
type RateEntry = { startedAt: number; count: number };
type LoginContext = Readonly<{
  kind: 'preauth';
  id: string;
  nonce: Buffer;
  nonceVersion: number;
  expiresAt: number;
}> | Readonly<{
  kind: 'session';
  id: string;
  nonce: Buffer;
  nonceVersion: number;
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  session: Readonly<{
    token: string;
    adminUser: Readonly<{ id: string; active: boolean; mustChangePassword: boolean; version: number }>;
  }>;
}>;

type Account = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
  mustChangePassword: boolean;
  version: number;
  updatedAt: Date;
};

const SESSION_COOKIE = 'abar_admin_session';
const PREAUTH_COOKIE = 'abar_auth_context';
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_RATE_KEYS = 10_000;
const DUMMY_PHC = `$argon2id$v=19$m=19456,t=2,p=1$${Buffer.alloc(16, 3).toString('base64').replace(/=+$/, '')}$${Buffer.alloc(32, 4).toString('base64').replace(/=+$/, '')}`;

function routeError(status: number, code: LoginErrorCode, retryAfter?: number): LoginRouteException {
  return new LoginRouteException(status, code, retryAfter);
}

function unavailable(): LoginRouteException {
  return routeError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
}

function canonicalToken(value: unknown): value is string {
  if (typeof value !== 'string' || !OPAQUE_TOKEN.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}

function validPhc(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256 || [...value].some((ch) => ch.charCodeAt(0) > 0x7f)) return false;
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== '' || parts[1] !== 'argon2id' || parts[2] !== 'v=19' || parts[3] !== 'm=19456,t=2,p=1') return false;
  const validPart = (part: string, bytes: number): boolean => {
    if (!/^[A-Za-z0-9+/]+$/.test(part)) return false;
    const decoded = Buffer.from(part, 'base64');
    return decoded.length === bytes && decoded.toString('base64').replace(/=+$/, '') === part;
  };
  return validPart(parts[4], 16) && validPart(parts[5], 32);
}

function hashToken(token: string): string {
  try {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  } catch {
    throw unavailable();
  }
}

function parseCredentials(body: unknown): Credentials {
  try {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    const prototype = Object.getPrototypeOf(body);
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    const keys = Reflect.ownKeys(body);
    if (keys.length !== 2 || !keys.includes('email') || !keys.includes('password')) throw new Error();
    const emailDescriptor = Object.getOwnPropertyDescriptor(body, 'email');
    const passwordDescriptor = Object.getOwnPropertyDescriptor(body, 'password');
    if (!emailDescriptor || !passwordDescriptor || !('value' in emailDescriptor) || !('value' in passwordDescriptor)) throw new Error();
    const rawEmail: unknown = emailDescriptor.value;
    if (typeof rawEmail !== 'string') throw new Error();
    const email = rawEmail.trim().toLowerCase();
    if ([...email].length < 1 || [...email].length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error();
    let password: string;
    try {
      password = normalizeCredentialPassword(passwordDescriptor.value);
    } catch (error) {
      if (error instanceof PasswordPolicyError) throw error;
      throw new PasswordPolicyError('invalid');
    }
    return Object.freeze({ email, password });
  } catch {
    throw routeError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }
}

function readCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (header === undefined || header === '') return cookies;
  if (typeof header !== 'string' || header.length > 16_384) throw routeError(403, 'CSRF_INVALID');
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE && name !== PREAUTH_COOKIE) continue;
    if (cookies.has(name)) throw routeError(403, 'CSRF_INVALID');
    cookies.set(name, part.slice(separator + 1).trim());
  }
  return cookies;
}

function validTime(value: unknown): number | undefined {
  if (!(value instanceof Date)) return undefined;
  const result = value.getTime();
  return Number.isFinite(result) ? result : undefined;
}

/** Owns the integrated credential-to-session login operation. */
export class LoginService {
  private readonly ipRates = new Map<string, RateEntry>();
  private readonly accountRates = new Map<string, RateEntry>();

  private readNow(): number {
    let now: number;
    try {
      now = this.now();
      if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('invalid clock');
    } catch {
      throw unavailable();
    }
    return now;
  }

  private assertContextCurrent(context: LoginContext, now: number): void {
    if (context.kind === 'preauth') {
      if (context.expiresAt <= now) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    } else if (context.absoluteExpiresAt <= now || context.idleExpiresAt <= now) {
      throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    }
  }

  constructor(
    private readonly dependencies: LoginServiceDependencies,
    private readonly now: () => number = Date.now,
  ) {}

  async login(request: LoginOperationRequest): Promise<LoginResult> {
    const { email, password } = parseCredentials(request.body);
    if (typeof request.origin !== 'string' || !this.dependencies.config.allowedOrigins.includes(request.origin)) {
      throw routeError(HttpStatus.FORBIDDEN, 'ORIGIN_INVALID');
    }
    if (!this.dependencies.cipher.available) throw unavailable();
    const now = this.readNow();

    const context = await this.validateContext(request.cookieHeader, request.csrfToken, now);
    try {
      this.consumeRate(this.ipRates, request.clientIp, now, this.dependencies.config.loginIpLimit,
        this.dependencies.config.loginIpWindowSeconds);
      this.consumeRate(this.accountRates, email, now, this.dependencies.config.loginAccountLimit,
        this.dependencies.config.loginAccountWindowSeconds);

      let account: Account | null;
      try {
        account = await this.dependencies.prisma.adminUser.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, passwordHash: true, active: true,
            mustChangePassword: true, version: true, updatedAt: true },
        }) as Account | null;
      } catch {
        throw unavailable();
      }
      if (account && (typeof account.id !== 'string' || typeof account.name !== 'string' || [...account.name].length < 1 ||
          [...account.name].length > 100 || typeof account.email !== 'string' || account.email !== email ||
          typeof account.passwordHash !== 'string' || typeof account.active !== 'boolean' ||
          typeof account.mustChangePassword !== 'boolean' || !Number.isSafeInteger(account.version) ||
          validTime(account.updatedAt) === undefined)) throw unavailable();

      const phc = account?.active ? account.passwordHash : DUMMY_PHC;
      if (!validPhc(phc)) throw unavailable();
      let matches: boolean;
      try {
        matches = await this.dependencies.hasher.verify(phc, password);
        if (typeof matches !== 'boolean') throw new Error('invalid verifier result');
      } catch {
        throw unavailable();
      }
      const verifiedAt = this.readNow();
      if (!account || !account.active || !matches) {
        throw routeError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS');
      }
      this.assertContextCurrent(context, verifiedAt);
      return await this.issueSession(account, context);
    } finally {
      context.nonce.fill(0);
    }
  }

  private async validateContext(cookieHeader: string | undefined, csrfToken: string | undefined, now: number): Promise<LoginContext> {
    const cookies = readCookies(cookieHeader);
    const sessionToken = cookies.get(SESSION_COOKIE);
    const preauthToken = cookies.get(PREAUTH_COOKIE);
    if (sessionToken === undefined && preauthToken === undefined) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    if (!canonicalToken(csrfToken)) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');

    if (sessionToken !== undefined) {
      if (!canonicalToken(sessionToken)) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
      const sessionContext = await this.validateSessionContext(sessionToken, csrfToken, now);
      if (sessionContext) return sessionContext;
    }

    if (preauthToken === undefined || !canonicalToken(preauthToken)) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    return this.validatePreauthContext(preauthToken, csrfToken, now);
  }

  private async validateSessionContext(token: string, csrfToken: string, now: number): Promise<LoginContext | undefined> {
    const id = hashToken(token);
    let row: any;
    try {
      row = await this.dependencies.prisma.authSession.findUnique({ where: { id }, include: { adminUser: true } });
    } catch {
      throw unavailable();
    }
    if (!row) return undefined;
    const absolute = validTime(row.absoluteExpiresAt);
    const idle = validTime(row.idleExpiresAt);
    if (absolute === undefined || idle === undefined || (row.revokedAt !== null && validTime(row.revokedAt) === undefined) ||
        !Number.isSafeInteger(row.nonceVersion) || row.nonceVersion < 1 ||
        typeof row.adminUser?.id !== 'string' || row.adminUser.id !== row.adminUserId ||
        typeof row.adminUser?.active !== 'boolean' || typeof row.adminUser?.mustChangePassword !== 'boolean' ||
        !Number.isSafeInteger(row.adminUser?.version) || validTime(row.adminUser?.updatedAt) === undefined) throw unavailable();
    if (row.revokedAt || absolute <= now || idle <= now || !row.adminUser.active) return undefined;

    const nonce = this.decryptNonce('session', id, row.nonceVersion, row);
    if (!this.equalNonce(nonce, csrfToken)) {
      nonce.fill(0);
      throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    }
    if (row.adminUser.mustChangePassword) {
      nonce.fill(0);
      throw routeError(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED');
    }
    return Object.freeze({
      kind: 'session', id, nonce, nonceVersion: row.nonceVersion,
      absoluteExpiresAt: absolute, idleExpiresAt: idle,
      session: Object.freeze({
        token,
        adminUser: Object.freeze({
          id: row.adminUser.id, active: row.adminUser.active,
          mustChangePassword: row.adminUser.mustChangePassword, version: row.adminUser.version,
        }),
      }),
    });
  }

  private async validatePreauthContext(token: string, csrfToken: string, now: number): Promise<LoginContext> {
    const id = hashToken(token);
    let row: any;
    try {
      row = await this.dependencies.prisma.authPreAuthContext.findUnique({ where: { id } });
    } catch {
      throw unavailable();
    }
    if (!row) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    const expiry = validTime(row.expiresAt);
    if (expiry === undefined || !Number.isSafeInteger(row.nonceVersion) || row.nonceVersion < 1) throw unavailable();
    if (expiry <= now) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    const nonce = this.decryptNonce('preauth', id, row.nonceVersion, row);
    if (!this.equalNonce(nonce, csrfToken)) {
      nonce.fill(0);
      throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    }
    return Object.freeze({ kind: 'preauth', id, nonce, nonceVersion: row.nonceVersion, expiresAt: expiry });
  }

  private decryptNonce(kind: 'preauth' | 'session', id: string, version: number, row: any): Buffer {
    try {
      return this.dependencies.cipher.decrypt(kind, id, version, {
        ciphertext: Buffer.from(row.nonceCiphertext), iv: Buffer.from(row.nonceIv), tag: Buffer.from(row.nonceTag),
      });
    } catch {
      throw unavailable();
    }
  }

  private equalNonce(nonce: Buffer, token: string): boolean {
    if (!Buffer.isBuffer(nonce) || nonce.length !== 32) return false;
    const supplied = Buffer.from(token, 'base64url');
    return supplied.length === nonce.length && timingSafeEqual(nonce, supplied);
  }

  private consumeRate(map: Map<string, RateEntry>, keyInput: string, now: number, limit: number, windowSeconds: number): void {
    const key = typeof keyInput === 'string' && keyInput.length > 0 ? keyInput : 'unknown';
    const windowMs = windowSeconds * 1000;
    for (const [existingKey, entry] of map) {
      if (now >= entry.startedAt && now - entry.startedAt >= windowMs) map.delete(existingKey);
    }
    let entry = map.get(key);
    if (entry && now >= entry.startedAt && now - entry.startedAt >= windowMs) {
      map.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (map.size >= MAX_RATE_KEYS) throw routeError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', windowSeconds);
      entry = { startedAt: now, count: 0 };
      map.set(key, entry);
    }
    if (entry.count >= limit) {
      const remaining = Math.ceil((entry.startedAt + windowMs - now) / 1000);
      throw routeError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', Math.min(windowSeconds, Math.max(1, remaining)));
    }
    entry.count++;
  }

  private async issueSession(account: Account, context: LoginContext): Promise<LoginResult> {
    const sessionToken = this.randomToken(context.kind === 'session' ? context.session.token : undefined);
    const sessionId = hashToken(sessionToken);
    const nonce = this.randomNonce(context.nonce);
    const csrfToken = nonce.toString('base64url');
    const nonceVersion = 1;
    let now: number | undefined;
    let nowDate: Date | undefined;
    let absoluteExpiresAt: Date | undefined;
    let idleExpiresAt: Date | undefined;
    let envelope: ReturnType<CsrfNonceCipher['encrypt']>;
    try {
      envelope = this.dependencies.cipher.encrypt('session', sessionId, nonceVersion, nonce);
    } catch {
      nonce.fill(0);
      throw unavailable();
    }
    try {
      await this.dependencies.prisma.$transaction(async (tx) => {
        const userGuards = new Map<string, { row: Account | any; target: boolean }>();
        userGuards.set(account.id, { row: account, target: true });
        if (context.kind === 'session') {
          const owner = context.session.adminUser;
          userGuards.set(owner.id, { row: owner, target: owner.id === account.id });
        }
        for (const guard of [...userGuards.values()].sort((left, right) => left.row.id.localeCompare(right.row.id))) {
          const where: Record<string, unknown> = {
            id: guard.row.id, active: true, version: guard.row.version,
            mustChangePassword: guard.row.mustChangePassword,
          };
          if (guard.target) where.passwordHash = account.passwordHash;
          const current = await tx.adminUser.updateMany({ where, data: { updatedAt: guard.row.updatedAt } });
          if (current.count !== 1) {
            throw guard.target
              ? routeError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS')
              : routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
          }
        }

        now = this.readNow();
        nowDate = new Date(now);
        absoluteExpiresAt = new Date(now + this.dependencies.config.sessionAbsoluteSeconds * 1000);
        idleExpiresAt = new Date(Math.min(now + this.dependencies.config.sessionIdleSeconds * 1000, absoluteExpiresAt.getTime()));

        if (context.kind === 'preauth') {
          const consumed = await tx.authPreAuthContext.deleteMany({
            where: { id: context.id, nonceVersion: context.nonceVersion, expiresAt: { gt: nowDate } },
          });
          if (consumed.count !== 1) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
        } else {
          const revoked = await tx.authSession.updateMany({
            where: {
              id: context.id,
              revokedAt: null,
              nonceVersion: context.nonceVersion,
              absoluteExpiresAt: { gt: nowDate },
              idleExpiresAt: { gt: nowDate },
              adminUser: {
                is: {
                  id: context.session.adminUser.id,
                  active: true,
                  mustChangePassword: false,
                  version: context.session.adminUser.version,
                },
              },
            },
            data: { revokedAt: nowDate },
          });
          if (revoked.count !== 1) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
        }

        await tx.authSession.create({
          data: {
            id: sessionId, adminUserId: account.id,
            nonceCiphertext: new Uint8Array(envelope.ciphertext), nonceIv: new Uint8Array(envelope.iv),
            nonceTag: new Uint8Array(envelope.tag), nonceVersion,
            createdAt: nowDate, lastActivityAt: nowDate, absoluteExpiresAt, idleExpiresAt, revokedAt: null,
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (getLoginRouteErrorMetadata(error)) throw error;
      throw unavailable();
    } finally {
      nonce.fill(0);
    }

    if (now === undefined || !nowDate || !absoluteExpiresAt || !idleExpiresAt) throw unavailable();
    const maxAge = Math.max(1, Math.floor((absoluteExpiresAt.getTime() - now) / 1000));
    return Object.freeze({
      session: Object.freeze({
        admin: Object.freeze({ id: account.id, name: account.name, email: account.email, mustChangePassword: account.mustChangePassword }),
        expiresAt: absoluteExpiresAt.toISOString(),
      }),
      sessionCookie: this.cookie(SESSION_COOKIE, sessionToken, '/api/v1', maxAge, absoluteExpiresAt),
      clearPreAuthCookie: this.cookie(PREAUTH_COOKIE, '', '/api/v1/auth', 0, new Date(0)),
      csrfToken,
    });
  }

  private randomToken(avoid?: string): string {
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const token = randomBytes(32).toString('base64url');
        if (token !== avoid && canonicalToken(token)) return token;
      }
    } catch {
      throw unavailable();
    }
    throw unavailable();
  }

  private randomNonce(avoid: Buffer): Buffer {
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const nonce = randomBytes(32);
        if (!nonce.equals(avoid)) return nonce;
        nonce.fill(0);
      }
    } catch {
      throw unavailable();
    }
    throw unavailable();
  }

  private cookie(name: string, value: string, path: string, maxAge: number, expiresAt: Date): string {
    const expires = expiresAt.toUTCString();
    return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}${this.dependencies.config.cookieSecure ? '; Secure' : ''}`;
  }
}
