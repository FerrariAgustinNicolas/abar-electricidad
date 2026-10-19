import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthConfig } from './auth.config';
import { CsrfNonceCipher } from './csrf-nonce.cipher';
import { PrismaService } from '../prisma/prisma.service';

export const CSRF_NONCE_CIPHER = Symbol('CSRF_NONCE_CIPHER');
export type CsrfMetadata = Readonly<{ csrfToken: string; headerName: 'X-CSRF-Token' }>;
export type CsrfResult = Readonly<{ metadata: CsrfMetadata; setCookie?: string }>;
export type CsrfRequest = Readonly<{ cookieHeader?: string; clientIp: string }>;

export type CsrfRouteErrorMetadata = Readonly<{
  status: number;
  code?: 'PASSWORD_CHANGE_REQUIRED' | 'RATE_LIMITED';
  retryAfter?: number;
}>;
const csrfRouteErrors = new WeakMap<object, CsrfRouteErrorMetadata>();

/** Owns safe route metadata outside the enumerable exception object. */
export class CsrfRouteException extends HttpException {
  constructor(status: number, code: string, retryAfter?: number) {
    super(code, status);
    const isRestricted = status === HttpStatus.FORBIDDEN && code === 'PASSWORD_CHANGE_REQUIRED';
    const isLimited = status === HttpStatus.TOO_MANY_REQUESTS && code === 'RATE_LIMITED';
    const safeRetry = isLimited && Number.isSafeInteger(retryAfter) && retryAfter! > 0 && retryAfter! <= 3600
      ? retryAfter : undefined;
    csrfRouteErrors.set(this, Object.freeze({
      status,
      code: isRestricted || isLimited ? code as CsrfRouteErrorMetadata['code'] : undefined,
      retryAfter: safeRetry,
    }));
  }
}

export function getCsrfRouteErrorMetadata(exception: unknown): CsrfRouteErrorMetadata | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  return csrfRouteErrors.get(exception);
}

type RateEntry = { startedAt: number; count: number };
const SESSION_COOKIE = 'abar_admin_session';
const PREAUTH_COOKIE = 'abar_auth_context';
const COOKIE_ID = /^[A-Za-z0-9_-]{43}$/;
const MAX_RATE_KEYS = 10000;

@Injectable()
export class CsrfService {
  private readonly rates = new Map<string, RateEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CsrfNonceCipher,
    private readonly config: AuthConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async getMetadata(request: CsrfRequest): Promise<CsrfResult> {
    const now = this.now();
    this.consumeRate(request.clientIp, now);
    if (!this.cipher.available) throw new ServiceUnavailableException();

    const cookies = this.parseCookies(request.cookieHeader);
    const sessionToken = cookies.get(SESSION_COOKIE);
    if (sessionToken !== undefined && COOKIE_ID.test(sessionToken) &&
        Buffer.from(sessionToken, 'base64url').toString('base64url') === sessionToken) {
      return this.sessionResult(sessionToken, cookies.get(PREAUTH_COOKIE), now);
    }
    return this.preauthResult(cookies.get(PREAUTH_COOKIE), now);
  }

  private async sessionResult(token: string, preauthCookie: string | undefined, now: number): Promise<CsrfResult> {
    const id = this.hash(token);
    let row: any;
    try {
      row = await this.prisma.authSession.findUnique({ where: { id }, include: { adminUser: true } });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!row) return this.preauthResult(preauthCookie, now);

    let absoluteExpiry: number;
    let idleExpiry: number;
    try {
      absoluteExpiry = row.absoluteExpiresAt.getTime();
      idleExpiry = row.idleExpiresAt.getTime();
      if (!Number.isFinite(absoluteExpiry) || !Number.isFinite(idleExpiry) || typeof row.adminUser?.active !== 'boolean' ||
          typeof row.adminUser.mustChangePassword !== 'boolean') {
        throw new Error('invalid session row');
      }
    } catch {
      throw new ServiceUnavailableException();
    }
    if (row.revokedAt || absoluteExpiry <= now || idleExpiry <= now || !row.adminUser.active) {
      return this.preauthResult(preauthCookie, now);
    }
    if (row.adminUser.mustChangePassword) {
      throw new CsrfRouteException(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED');
    }

    let nonce: Buffer;
    try {
      nonce = this.cipher.decrypt('session', row.id, row.nonceVersion, {
        ciphertext: Buffer.from(row.nonceCiphertext), iv: Buffer.from(row.nonceIv), tag: Buffer.from(row.nonceTag),
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    try {
      const activity = new Date(now);
      const idle = new Date(Math.min(now + this.config.sessionIdleSeconds * 1000, absoluteExpiry));
      let guard;
      try {
        guard = await this.prisma.authSession.updateMany({
          where: {
            id: row.id,
            revokedAt: null,
            absoluteExpiresAt: { gt: new Date(now) },
            idleExpiresAt: { gt: new Date(now), lte: idle },
            lastActivityAt: { lte: activity },
            nonceVersion: row.nonceVersion,
            adminUser: { is: { active: true, mustChangePassword: false } },
          },
          data: { lastActivityAt: activity, idleExpiresAt: idle },
        });
      } catch {
        throw new ServiceUnavailableException();
      }
      if (guard.count !== 1) {
        let fresh: any;
        try {
          fresh = await this.prisma.authSession.findUnique({ where: { id }, include: { adminUser: true } });
        } catch {
          throw new ServiceUnavailableException();
        }
        if (!fresh) return this.preauthResult(preauthCookie, now);
        let freshAbsolute: number;
        let freshIdle: number;
        try {
          freshAbsolute = fresh.absoluteExpiresAt.getTime();
          freshIdle = fresh.idleExpiresAt.getTime();
          if (!Number.isFinite(freshAbsolute) || !Number.isFinite(freshIdle) || typeof fresh.adminUser?.active !== 'boolean' ||
              typeof fresh.adminUser.mustChangePassword !== 'boolean') {
            throw new Error('invalid session row');
          }
        } catch {
          throw new ServiceUnavailableException();
        }
        if (fresh.revokedAt || freshAbsolute <= now || freshIdle <= now || !fresh.adminUser.active) {
          return this.preauthResult(preauthCookie, now);
        }
        if (fresh.adminUser.mustChangePassword) {
          throw new CsrfRouteException(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED');
        }
        throw new ServiceUnavailableException();
      }
      return Object.freeze({ metadata: this.metadata(nonce) });
    } finally {
      nonce.fill(0);
    }
  }

  private async preauthResult(cookie: string | undefined, now: number): Promise<CsrfResult> {
    try {
      let row: any;
      let token: string;
      if (cookie !== undefined && COOKIE_ID.test(cookie) && Buffer.from(cookie, 'base64url').toString('base64url') === cookie) {
        const id = this.hash(cookie);
        const found = await this.prisma.authPreAuthContext.findUnique({ where: { id } });
        if (found && found.expiresAt.getTime() > now) {
          row = found;
          token = cookie;
        }
      }
      if (!row) {
        token = randomBytes(32).toString('base64url');
        const id = this.hash(token);
        const nonce = randomBytes(32);
        const version = 1;
        try {
          const envelope = this.cipher.encrypt('preauth', id, version, nonce);
          row = await this.prisma.authPreAuthContext.create({
            data: {
              id, nonceCiphertext: new Uint8Array(envelope.ciphertext), nonceIv: new Uint8Array(envelope.iv), nonceTag: new Uint8Array(envelope.tag),
              nonceVersion: version, expiresAt: new Date(now + this.config.preAuthSeconds * 1000),
            },
          });
        } finally {
          nonce.fill(0);
        }
      }
      const nonce = this.cipher.decrypt('preauth', row.id, row.nonceVersion, {
        ciphertext: Buffer.from(row.nonceCiphertext), iv: Buffer.from(row.nonceIv), tag: Buffer.from(row.nonceTag),
      });
      return Object.freeze({
        metadata: this.metadata(nonce),
        setCookie: this.cookie(
          PREAUTH_COOKIE, token!, Math.max(0, Math.floor((row.expiresAt.getTime() - now) / 1000)), row.expiresAt,
        ),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  private metadata(nonce: Buffer): CsrfMetadata {
    if (nonce.length !== 32) throw new ServiceUnavailableException();
    const csrfToken = nonce.toString('base64url');
    nonce.fill(0);
    return Object.freeze({ csrfToken, headerName: 'X-CSRF-Token' });
  }

  private cookie(name: string, value: string, maxAge: number, expiresAt?: Date): string {
    const expires = (expiresAt ?? new Date(this.now() + maxAge * 1000)).toUTCString();
    return `${name}=${value}; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}${this.config.cookieSecure ? '; Secure' : ''}`;
  }

  private parseCookies(header: string | undefined): Map<string, string> {
    const result = new Map<string, string>();
    if (!header) return result;
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 1) continue;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if ((key === SESSION_COOKIE || key === PREAUTH_COOKIE) && result.has(key)) {
        throw new ServiceUnavailableException();
      }
      if (key === SESSION_COOKIE || key === PREAUTH_COOKIE) result.set(key, value);
    }
    return result;
  }

  private consumeRate(ip: string, now: number): void {
    if (typeof ip !== 'string' || !ip) ip = 'unknown';
    const windowSeconds = this.config.csrfIpWindowSeconds;
    const windowMs = windowSeconds * 1000;
    for (const [key, value] of this.rates) {
      if (now >= value.startedAt && now - value.startedAt >= windowMs) this.rates.delete(key);
    }

    let entry = this.rates.get(ip);
    if (entry && now >= entry.startedAt && now - entry.startedAt >= windowMs) {
      this.rates.delete(ip);
      entry = undefined;
    }
    if (!entry) {
      if (this.rates.size >= MAX_RATE_KEYS) {
        throw new CsrfRouteException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', windowSeconds);
      }
      entry = { startedAt: now, count: 0 };
      this.rates.set(ip, entry);
    }

    if (entry.count >= this.config.csrfIpLimit) {
      const expiry = entry.startedAt + windowMs;
      const remainingSeconds = Math.ceil((expiry - now) / 1000);
      const retryAfter = Math.min(windowSeconds, Math.max(1, remainingSeconds));
      throw new CsrfRouteException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', retryAfter);
    }
    entry.count++;
  }

  private hash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
}
