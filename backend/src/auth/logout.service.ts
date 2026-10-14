import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { LoginRouteException, getLoginRouteErrorMetadata } from './login.service';
import type { AuthConfig } from './auth.config';
import type { CsrfNonceCipher } from './csrf-nonce.cipher';
import type { PrismaService } from '../prisma/prisma.service';

export type LogoutRequest = Readonly<{
  origin?: string;
  csrfToken?: string;
  cookieHeader?: string;
}>;

export type LogoutResult = Readonly<{ clearSessionCookie: string }>;

type SessionState = Readonly<{
  id: string;
  adminUserId: string;
  nonceVersion: number;
  nonceCiphertext: Buffer;
  nonceIv: Buffer;
  nonceTag: Buffer;
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  revokedAt: number | null;
  owner: Readonly<{ id: string; active: boolean; mustChangePassword: boolean }>;
}>;

const SESSION_COOKIE = 'abar_admin_session';
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000a-\u001f\u007f]/;

function routeError(status: number, code: 'ORIGIN_INVALID' | 'CSRF_INVALID' | 'SERVICE_UNAVAILABLE'): LoginRouteException {
  return new LoginRouteException(status, code);
}

function unavailable(): LoginRouteException {
  return routeError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
}

function validTime(value: unknown): number | undefined {
  if (!(value instanceof Date)) return undefined;
  const time = value.getTime();
  return Number.isFinite(time) ? time : undefined;
}

function bytes(value: unknown): Buffer | undefined {
  return value instanceof Uint8Array ? Buffer.from(value) : undefined;
}

function canonicalToken(value: unknown): value is string {
  if (typeof value !== 'string' || !OPAQUE_TOKEN.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}

function sessionToken(cookieHeader: unknown): string | undefined {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 16_384 || FORBIDDEN_CONTROLS.test(cookieHeader)) return undefined;
  let token: string | undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    if (token !== undefined) return undefined;
    token = part.slice(separator + 1).trim();
  }
  return canonicalToken(token) ? token : undefined;
}

/** Owns logout proof validation and guarded revocation; it never renews session activity. */
@Injectable()
export class LogoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CsrfNonceCipher,
    private readonly config: AuthConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async logout(request: LogoutRequest): Promise<LogoutResult> {
    if (typeof request?.origin !== 'string' || !this.config.allowedOrigins.includes(request.origin)) {
      throw routeError(HttpStatus.FORBIDDEN, 'ORIGIN_INVALID');
    }

    const token = sessionToken(request.cookieHeader);
    if (token === undefined) return this.clearSessionCookie();

    const sessionId = createHash('sha256').update(token, 'utf8').digest('hex');
    this.readNow();
    const selected = await this.findSession(sessionId);
    if (selected === null) return this.clearSessionCookie();

    const now = this.readNow();
    if (this.isInactive(selected, now)) return this.clearSessionCookie();

    let cipherAvailable: boolean;
    try {
      cipherAvailable = this.cipher.available;
    } catch {
      throw unavailable();
    }
    if (!cipherAvailable) throw unavailable();

    let nonce: Buffer | undefined;
    let suppliedNonce: Buffer | undefined;
    try {
      try {
        nonce = this.cipher.decrypt('session', selected.id, selected.nonceVersion, {
          ciphertext: selected.nonceCiphertext,
          iv: selected.nonceIv,
          tag: selected.nonceTag,
        });
      } catch {
        throw unavailable();
      }
      if (!Buffer.isBuffer(nonce) || nonce.length !== 32) throw unavailable();

      if (!canonicalToken(request.csrfToken)) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
      suppliedNonce = Buffer.from(request.csrfToken, 'base64url');
      if (!timingSafeEqual(nonce, suppliedNonce)) throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    } finally {
      nonce?.fill(0);
      suppliedNonce?.fill(0);
    }

    const writeNow = this.readNow();
    if (this.isInactive(selected, writeNow)) return this.clearSessionCookie();

    let result: { count: number };
    try {
      result = await this.prisma.authSession.updateMany({
        where: {
          id: selected.id,
          adminUserId: selected.adminUserId,
          adminUser: { is: { id: selected.owner.id, active: true } },
          nonceVersion: selected.nonceVersion,
          revokedAt: null,
          absoluteExpiresAt: { gt: new Date(writeNow) },
          idleExpiresAt: { gt: new Date(writeNow) },
        },
        data: { revokedAt: new Date(writeNow) },
      });
    } catch {
      throw unavailable();
    }
    if (!result || (result.count !== 0 && result.count !== 1)) throw unavailable();
    if (result.count === 1) return this.clearSessionCookie();

    const current = await this.findSession(sessionId);
    if (current === null) return this.clearSessionCookie();
    const currentNow = this.readNow();
    if (this.isInactive(current, currentNow)) return this.clearSessionCookie();
    if (this.proofStateChanged(selected, current)) {
      throw routeError(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    }
    throw unavailable();
  }

  private readNow(): number {
    try {
      const now = this.now();
      if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime())) throw new Error();
      return now;
    } catch {
      throw unavailable();
    }
  }

  private async findSession(id: string): Promise<SessionState | null> {
    let row: any;
    try {
      row = await this.prisma.authSession.findUnique({
        where: { id },
        select: {
          id: true,
          adminUserId: true,
          nonceCiphertext: true,
          nonceIv: true,
          nonceTag: true,
          nonceVersion: true,
          absoluteExpiresAt: true,
          idleExpiresAt: true,
          revokedAt: true,
          adminUser: { select: { id: true, active: true, mustChangePassword: true } },
        },
      });
    } catch {
      throw unavailable();
    }
    if (row === null) return null;

    try {
      const ciphertext = bytes(row?.nonceCiphertext);
      const iv = bytes(row?.nonceIv);
      const tag = bytes(row?.nonceTag);
      const absoluteExpiresAt = validTime(row?.absoluteExpiresAt);
      const idleExpiresAt = validTime(row?.idleExpiresAt);
      const revokedAt = row?.revokedAt === null ? null : validTime(row?.revokedAt);
      const owner = row?.adminUser;
      if (row?.id !== id || typeof row?.adminUserId !== 'string' || !UUID.test(row.adminUserId) ||
          !Number.isSafeInteger(row?.nonceVersion) || row.nonceVersion < 1 ||
          !ciphertext || ciphertext.length !== 32 || !iv || iv.length !== 12 || !tag || tag.length !== 16 ||
          absoluteExpiresAt === undefined || idleExpiresAt === undefined || revokedAt === undefined ||
          !owner || typeof owner.id !== 'string' || !UUID.test(owner.id) || owner.id !== row.adminUserId ||
          typeof owner.active !== 'boolean' || typeof owner.mustChangePassword !== 'boolean') {
        throw unavailable();
      }
      return {
        id,
        adminUserId: row.adminUserId,
        nonceVersion: row.nonceVersion,
        nonceCiphertext: ciphertext,
        nonceIv: iv,
        nonceTag: tag,
        absoluteExpiresAt,
        idleExpiresAt,
        revokedAt,
        owner: { id: owner.id, active: owner.active, mustChangePassword: owner.mustChangePassword },
      };
    } catch (error) {
      if (getLoginRouteErrorMetadata(error)) throw error;
      throw unavailable();
    }
  }

  private isInactive(session: SessionState, now: number): boolean {
    return session.revokedAt !== null || session.absoluteExpiresAt <= now || session.idleExpiresAt <= now || !session.owner.active;
  }

  private proofStateChanged(previous: SessionState, current: SessionState): boolean {
    return previous.nonceVersion !== current.nonceVersion ||
      !previous.nonceCiphertext.equals(current.nonceCiphertext) ||
      !previous.nonceIv.equals(current.nonceIv) ||
      !previous.nonceTag.equals(current.nonceTag);
  }

  private clearSessionCookie(): LogoutResult {
    return Object.freeze({
      clearSessionCookie: `${SESSION_COOKIE}=; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${new Date(0).toUTCString()}${this.config.cookieSecure ? '; Secure' : ''}`,
    });
  }
}
