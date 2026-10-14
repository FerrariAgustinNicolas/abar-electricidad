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

/** Fail-closed RED-stage API scaffold; it performs no password-change work. */
export class ChangePasswordService {
  constructor(private readonly dependencies: ChangePasswordDependencies) {}

  async changePassword(_request: ChangePasswordRequest): Promise<ChangePasswordResult> {
    void this.dependencies;
    const error = Object.freeze(Object.assign(Object.create(null), { message: 'SERVICE_UNAVAILABLE' }));
    ownedChangePasswordErrors.set(error, Object.freeze({ status: 503, code: 'SERVICE_UNAVAILABLE' }));
    throw error;
  }
}

export type ChangePasswordOwnedError = Readonly<{
  status: 400 | 401 | 403 | 503;
  code: ChangePasswordErrorCode;
}>;
const ownedChangePasswordErrors = new WeakMap<object, ChangePasswordOwnedError>();
export function readChangePasswordError(value: unknown): ChangePasswordOwnedError | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  return ownedChangePasswordErrors.get(value);
}
