import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AuthConfig } from './auth.config';
import type { CsrfNonceCipher } from './csrf-nonce.cipher';
import type { PrismaService } from '../prisma/prisma.service';

export type SessionErrorCode = 'SESSION_EXPIRED' | 'SERVICE_UNAVAILABLE';
export type SessionErrorMetadata = Readonly<{ status: number; code: SessionErrorCode }>;
export type SessionRestoreRequest = Readonly<{ cookieHeader?: string }>;
export type AdminSessionView = Readonly<{
  admin: Readonly<{ id: string; name: string; email: string; mustChangePassword: boolean }>;
  expiresAt: string;
}>;
export type SessionRestoreResult = Readonly<{ session: AdminSessionView; csrfToken: string }>;

const sessionErrors = new WeakMap<object, SessionErrorMetadata>();
const sessionErrorStatuses = new Map<SessionErrorCode, number>([
  ['SESSION_EXPIRED', HttpStatus.UNAUTHORIZED],
  ['SERVICE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE],
]);

/** Owns safe session-route status/code metadata outside the exception object. */
export class SessionRouteException extends HttpException {
  constructor(status: number, code: SessionErrorCode) {
    const safeStatus = sessionErrorStatuses.get(code) === status ? status : HttpStatus.SERVICE_UNAVAILABLE;
    const safeCode: SessionErrorCode = safeStatus === HttpStatus.UNAUTHORIZED ? 'SESSION_EXPIRED' : 'SERVICE_UNAVAILABLE';
    super(safeCode, safeStatus);
    sessionErrors.set(this, Object.freeze({ status: safeStatus, code: safeCode }));
  }
}

export function getSessionRouteErrorMetadata(exception: unknown): SessionErrorMetadata | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  return sessionErrors.get(exception);
}

const SESSION_COOKIE = 'abar_admin_session';
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const unavailable = (): SessionRouteException => new SessionRouteException(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
const expired = (): SessionRouteException => new SessionRouteException(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED');

type SessionSnapshot = {
  id: string;
  adminUserId: string;
  nonceVersion: number;
  nonceCiphertext: Buffer;
  nonceIv: Buffer;
  nonceTag: Buffer;
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  revokedAt: number | null;
  admin: { id: string; name: string; email: string; active: boolean; mustChangePassword: boolean };
};

function canonicalToken(value: unknown): value is string {
  if (typeof value !== 'string' || !OPAQUE_TOKEN.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}

function parseSessionCookie(header: unknown): string | undefined {
  if (header === undefined || header === '') return undefined;
  // eslint-disable-next-line no-control-regex -- Intentionally reject HTTP control characters while allowing horizontal tabs.
  if (typeof header !== 'string' || header.length > 16_384 || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(header)) return undefined;
  let token: string | undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    if (token !== undefined) return undefined;
    token = part.slice(separator + 1).trim();
  }
  return canonicalToken(token) ? token : undefined;
}

function validDate(value: unknown): number | undefined {
  if (!(value instanceof Date)) return undefined;
  const time = value.getTime();
  return Number.isSafeInteger(time) && Number.isFinite(new Date(time).getTime()) ? time : undefined;
}

function bytes(value: unknown, length: number): Buffer | undefined {
  if (!(Buffer.isBuffer(value) || value instanceof Uint8Array) || value.byteLength !== length) return undefined;
  return Buffer.from(value);
}

function snapshot(row: any, expectedId: string): SessionSnapshot | undefined {
  try {
    const absoluteExpiresAt = validDate(row?.absoluteExpiresAt);
    const idleExpiresAt = validDate(row?.idleExpiresAt);
    const revokedAt = row?.revokedAt === null ? null : validDate(row?.revokedAt);
    const ciphertext = bytes(row?.nonceCiphertext, 32);
    const iv = bytes(row?.nonceIv, 12);
    const tag = bytes(row?.nonceTag, 16);
    const admin = row?.adminUser;
    if (row?.id !== expectedId || !UUID.test(row?.adminUserId) || !Number.isSafeInteger(row?.nonceVersion) || row.nonceVersion < 1 ||
        absoluteExpiresAt === undefined || idleExpiresAt === undefined || (row.revokedAt !== null && revokedAt === undefined) ||
        !ciphertext || !iv || !tag || admin?.id !== row.adminUserId || typeof admin.active !== 'boolean' ||
        typeof admin.mustChangePassword !== 'boolean' || typeof admin.name !== 'string' || admin.name.length < 1 || [...admin.name].length > 100 ||
        typeof admin.email !== 'string' || admin.email.length > 254 || !EMAIL.test(admin.email)) return undefined;
    if (revokedAt === undefined) return undefined;
    return {
      id: row.id, adminUserId: row.adminUserId, nonceVersion: row.nonceVersion,
      nonceCiphertext: ciphertext, nonceIv: iv, nonceTag: tag,
      absoluteExpiresAt, idleExpiresAt, revokedAt,
      admin: { id: admin.id, name: admin.name, email: admin.email, active: admin.active, mustChangePassword: admin.mustChangePassword },
    };
  } catch {
    return undefined;
  }
}

function sameSnapshot(left: SessionSnapshot, right: SessionSnapshot): boolean {
  return left.id === right.id && left.adminUserId === right.adminUserId && left.nonceVersion === right.nonceVersion &&
    left.absoluteExpiresAt === right.absoluteExpiresAt && left.idleExpiresAt === right.idleExpiresAt && left.revokedAt === right.revokedAt &&
    left.nonceCiphertext.equals(right.nonceCiphertext) && left.nonceIv.equals(right.nonceIv) && left.nonceTag.equals(right.nonceTag) &&
    left.admin.id === right.admin.id && left.admin.name === right.admin.name && left.admin.email === right.admin.email &&
    left.admin.active === right.admin.active && left.admin.mustChangePassword === right.admin.mustChangePassword;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CsrfNonceCipher,
    _config: AuthConfig,
    private readonly now: () => number = Date.now,
  ) {}

  private readNow(): number {
    try {
      const value = this.now();
      if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) throw new Error('invalid clock');
      return value;
    } catch {
      throw unavailable();
    }
  }

  private async findSnapshot(id: string): Promise<SessionSnapshot | undefined> {
    let row: unknown;
    try {
      row = await this.prisma.authSession.findUnique({
        where: { id },
        select: {
          id: true, adminUserId: true, nonceVersion: true, nonceCiphertext: true, nonceIv: true, nonceTag: true,
          absoluteExpiresAt: true, idleExpiresAt: true, revokedAt: true,
          adminUser: { select: { id: true, name: true, email: true, active: true, mustChangePassword: true } },
        },
      });
    } catch {
      throw unavailable();
    }
    if (row === null) return undefined;
    const current = snapshot(row, id);
    if (!current) throw unavailable();
    return current;
  }

  private assertLive(session: SessionSnapshot, now: number): void {
    if (session.revokedAt !== null || session.absoluteExpiresAt <= now || session.idleExpiresAt <= now || !session.admin.active) {
      throw expired();
    }
  }

  async restoreSession(request: SessionRestoreRequest): Promise<SessionRestoreResult> {
    const token = parseSessionCookie(request?.cookieHeader);
    if (!token) throw expired();
    const id = createHash('sha256').update(token, 'utf8').digest('hex');
    let available: boolean;
    try { available = this.cipher.available; } catch { throw unavailable(); }
    if (!available) throw unavailable();

    const initial = await this.findSnapshot(id);
    if (!initial) throw expired();
    this.assertLive(initial, this.readNow());

    let nonce: Buffer;
    try {
      nonce = this.cipher.decrypt('session', id, initial.nonceVersion, {
        ciphertext: Buffer.from(initial.nonceCiphertext), iv: Buffer.from(initial.nonceIv), tag: Buffer.from(initial.nonceTag),
      });
      if (!Buffer.isBuffer(nonce) || nonce.length !== 32) throw new Error('invalid nonce');
    } catch {
      throw unavailable();
    }

    try {
      const current = await this.findSnapshot(id);
      if (!current) throw expired();
      this.assertLive(current, this.readNow());
      if (!sameSnapshot(initial, current)) throw unavailable();
      const finalNow = this.readNow();
      this.assertLive(current, finalNow);
      const result: SessionRestoreResult = Object.freeze({
        session: Object.freeze({
          admin: Object.freeze({
            id: current.admin.id, name: current.admin.name, email: current.admin.email,
            mustChangePassword: current.admin.mustChangePassword,
          }),
          expiresAt: new Date(current.absoluteExpiresAt).toISOString(),
        }),
        csrfToken: nonce.toString('base64url'),
      });
      return result;
    } catch (error) {
      if (getSessionRouteErrorMetadata(error)) throw error;
      throw unavailable();
    } finally {
      nonce.fill(0);
    }
  }
}
