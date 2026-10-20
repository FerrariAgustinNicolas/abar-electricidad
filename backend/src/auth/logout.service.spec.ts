import { HttpException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { AuthController } from './auth.controller';
import { AUTH_RUNTIME } from './auth-runtime.module';
import { AuthModule } from './auth.module';
import { CSRF_NONCE_CIPHER } from './csrf.service';
import { configureApplication } from '../configure-application';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { AuthConfig, validateAuthConfig } from './auth.config';
import { CsrfEnvelope, CsrfNonceCipher } from './csrf-nonce.cipher';
import { LogoutResult, LogoutService } from './logout.service';
import { PrismaService } from '../prisma/prisma.service';

const TEST_KEY = Buffer.alloc(32, 73).toString('base64url');
const NOW = Date.UTC(2026, 9, 9, 12);
const LOOPBACK_CONFIG = validateAuthConfig({ NODE_ENV: 'test' });
const SECURE_CONFIG = validateAuthConfig({
  NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'https://admin.example.test',
});

type LogoutFixtureOptions = {
  tokenByte?: number;
  nonceByte?: number;
  preauthTokenByte?: number;
  preauthNonceByte?: number;
  mustChangePassword?: boolean;
  active?: boolean;
  missingRow?: boolean;
  revokedAt?: Date | null;
  absoluteExpiresAt?: Date;
  idleExpiresAt?: Date;
  failSessionLookup?: boolean;
  failSessionUpdate?: boolean;
  unavailableCipher?: boolean;
  corruptNonce?: boolean;
  malformedMetadata?: 'absolute-expiry' | 'nonce-version' | 'missing-relation' | 'invalid-active' | 'relation-mismatch' | 'invalid-revocation';
  conditionalWriteRace?: 'revoked' | 'nonce-rotation' | 'deactivated' | 'relation-change';
  clock?: number;
  onSessionLookup?: (count: number, setNow: (value: number) => void, stored: any) => void;
};

function copyState<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map(copyState) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyState(item)])) as T;
  }
  return value;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function logoutFixture(options: LogoutFixtureOptions = {}, config: AuthConfig = LOOPBACK_CONFIG) {
  const sessionToken = Buffer.alloc(32, options.tokenByte ?? 51).toString('base64url');
  const sessionId = tokenHash(sessionToken);
  const nonce = Buffer.alloc(32, options.nonceByte ?? 52);
  const realCipher = new CsrfNonceCipher(TEST_KEY);
  const envelope = realCipher.encrypt('session', sessionId, 1, nonce);
  const adminUser: any = {
    id: '00000000-0000-4000-8000-000000000023',
    active: options.active ?? true,
    mustChangePassword: options.mustChangePassword ?? false,
  };
  const row: any = {
    id: sessionId,
    adminUserId: adminUser.id,
    nonceCiphertext: Buffer.from(envelope.ciphertext),
    nonceIv: Buffer.from(envelope.iv),
    nonceTag: options.corruptNonce ? Buffer.alloc(16, 91) : Buffer.from(envelope.tag),
    nonceVersion: 1,
    createdAt: new Date(NOW - 60_000),
    lastActivityAt: new Date(NOW - 30_000),
    absoluteExpiresAt: options.absoluteExpiresAt ?? new Date(NOW + 60 * 60_000),
    idleExpiresAt: options.idleExpiresAt ?? new Date(NOW + 30 * 60_000),
    revokedAt: options.revokedAt ?? null,
    adminUser,
  };
  if (options.malformedMetadata === 'absolute-expiry') row.absoluteExpiresAt = new Date(Number.NaN);
  if (options.malformedMetadata === 'nonce-version') row.nonceVersion = 0;
  if (options.malformedMetadata === 'missing-relation') row.adminUser = null;
  if (options.malformedMetadata === 'invalid-active') row.adminUser = { ...adminUser, active: 'true' };
  if (options.malformedMetadata === 'relation-mismatch') row.adminUser = { ...adminUser, id: '00000000-0000-4000-8000-000000000024' };
  if (options.malformedMetadata === 'invalid-revocation') row.revokedAt = 'invalid-date';
  const stored = options.missingRow ? null : row;

  const preauthToken = Buffer.alloc(32, options.preauthTokenByte ?? 61).toString('base64url');
  const preauthId = tokenHash(preauthToken);
  const preauthNonce = Buffer.alloc(32, options.preauthNonceByte ?? 62);
  const preauthEnvelope = realCipher.encrypt('preauth', preauthId, 1, preauthNonce);
  const preauthRow = {
    id: preauthId,
    nonceCiphertext: Buffer.from(preauthEnvelope.ciphertext),
    nonceIv: Buffer.from(preauthEnvelope.iv),
    nonceTag: Buffer.from(preauthEnvelope.tag),
    nonceVersion: 1,
    expiresAt: new Date(NOW + 10 * 60_000),
  };

  let currentNow = options.clock ?? NOW;
  let sessionReadCount = 0;
  let successfulConditionalWrites = 0;
  let raceApplied = false;
  const setNow = (value: number) => { currentNow = value; };
  const findUnique = jest.fn(async ({ where }: { where: { id: string } }) => {
    sessionReadCount++;
    if (options.failSessionLookup) throw new Error('synthetic storage failure');
    options.onSessionLookup?.(sessionReadCount, setNow, stored);
    return where.id === sessionId && stored ? copyState(stored) : null;
  });
  const sessionOtherWrites = {
    create: jest.fn(), createMany: jest.fn(), update: jest.fn(), upsert: jest.fn(),
    delete: jest.fn(), deleteMany: jest.fn(),
  };
  const updateMany = jest.fn(async (args: any) => {
    if (options.failSessionUpdate) throw new Error('synthetic storage failure');
    if (!raceApplied && stored && options.conditionalWriteRace) {
      raceApplied = true;
      if (options.conditionalWriteRace === 'revoked') stored.revokedAt = new Date(currentNow);
      if (options.conditionalWriteRace === 'nonce-rotation') {
        const nextVersion = stored.nonceVersion + 1;
        const next = realCipher.encrypt('session', sessionId, nextVersion, Buffer.alloc(32, 94));
        stored.nonceVersion = nextVersion;
        stored.nonceCiphertext = Buffer.from(next.ciphertext);
        stored.nonceIv = Buffer.from(next.iv);
        stored.nonceTag = Buffer.from(next.tag);
      }
      if (options.conditionalWriteRace === 'deactivated' && stored.adminUser) stored.adminUser.active = false;
      if (options.conditionalWriteRace === 'relation-change' && stored.adminUser) {
        stored.adminUser.id = '00000000-0000-4000-8000-000000000024';
      }
    }
    if (!stored) return { count: 0 };

    const where = args?.where ?? {};
    const ownerRelation = where.adminUser;
    const ownerFilter = ownerRelation?.is ?? ownerRelation ?? {};
    const data = args?.data ?? {};
    const absoluteGuard = where.absoluteExpiresAt?.gt;
    const idleGuard = where.idleExpiresAt?.gt;
    const allowedWhereKeys = new Set(['id', 'adminUserId', 'adminUser', 'nonceVersion', 'revokedAt', 'absoluteExpiresAt', 'idleExpiresAt']);
    const allowedOwnerKeys = new Set(['id', 'active', 'mustChangePassword']);
    const shapeMatches = Object.keys(where).every(key => allowedWhereKeys.has(key)) &&
      Object.keys(ownerFilter).every(key => allowedOwnerKeys.has(key)) &&
      (!ownerRelation || !('is' in ownerRelation) || Object.keys(ownerRelation).every(key => key === 'is'));
    const ownerIdentityGuard = where.adminUserId !== undefined || ownerFilter.id !== undefined;
    const ownerMatches = ownerIdentityGuard &&
      (where.adminUserId === undefined || where.adminUserId === stored.adminUserId) &&
      (ownerFilter.id === undefined || ownerFilter.id === stored.adminUser?.id) &&
      stored.adminUser !== null && stored.adminUser !== undefined && stored.adminUser.id === stored.adminUserId;
    const accountMatches = ownerFilter.active === true && stored.adminUser?.active === true &&
      (ownerFilter.mustChangePassword === undefined || ownerFilter.mustChangePassword === stored.adminUser.mustChangePassword);
    const dataIsOnlyRevocation = Object.keys(data).length === 1 && validDate(data.revokedAt);
    const predicatesMatch = shapeMatches && where.id === sessionId && where.id === stored.id && ownerMatches &&
      Number.isSafeInteger(where.nonceVersion) && where.nonceVersion === stored.nonceVersion &&
      where.revokedAt === null && stored.revokedAt === null &&
      validDate(absoluteGuard) && validDate(stored.absoluteExpiresAt) && stored.absoluteExpiresAt.getTime() > absoluteGuard.getTime() &&
      validDate(idleGuard) && validDate(stored.idleExpiresAt) && stored.idleExpiresAt.getTime() > idleGuard.getTime() && accountMatches;
    if (!predicatesMatch || !dataIsOnlyRevocation) return { count: 0 };
    stored.revokedAt = new Date(data.revokedAt.getTime());
    successfulConditionalWrites++;
    return { count: 1 };
  });
  const preauthFindUnique = jest.fn(async ({ where }: { where: { id: string } }) =>
    where.id === preauthId ? copyState(preauthRow) : null);
  const preauthWrites = {
    create: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    upsert: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
  };
  const prisma = {
    authSession: { findUnique, updateMany, ...sessionOtherWrites },
    authPreAuthContext: { findUnique: preauthFindUnique, ...preauthWrites },
  };
  const cipher = {
    available: !options.unavailableCipher,
    decrypt: jest.fn((kind: 'session' | 'preauth', id: string, version: number, value: CsrfEnvelope) =>
      realCipher.decrypt(kind, id, version, value)),
  };
  const service = new LogoutService(
    prisma as unknown as PrismaService,
    cipher as unknown as CsrfNonceCipher,
    config,
    () => currentNow,
  );
  return {
    service, prisma, config, sessionToken, sessionId, nonceToken: nonce.toString('base64url'),
    wrongNonceToken: Buffer.alloc(32, 99).toString('base64url'),
    preauthToken, preauthNonceToken: preauthNonce.toString('base64url'),
    cookieHeader: `abar_admin_session=${sessionToken}`,
    adminUser, row, stored, findUnique, updateMany, preauthFindUnique, cipher,
    sessionOtherWrites, preauthWrites, setNow,
    get now() { return currentNow; }, get successfulConditionalWrites() { return successfulConditionalWrites; },
  };
}

type LogoutFixture = ReturnType<typeof logoutFixture>;

function safeErrorSummary(error: unknown) {
  if (!(error instanceof HttpException)) return { status: undefined, code: undefined };
  try {
    const status = error.getStatus();
    const response = error.getResponse();
    const candidate = typeof response === 'string' ? response
      : response && typeof response === 'object' && 'code' in response ? response.code : undefined;
    const code = candidate === 'ORIGIN_INVALID' || candidate === 'CSRF_INVALID' || candidate === 'SERVICE_UNAVAILABLE'
      ? candidate : undefined;
    return { status: status === 403 || status === 503 ? status : undefined, code };
  } catch {
    return { status: undefined, code: undefined };
  }
}

async function resultOf(operation: () => Promise<unknown>) {
  try { return { value: await operation(), error: undefined }; }
  catch (error) { return { value: undefined, error }; }
}

function clearCookie(config: AuthConfig): string {
  return `abar_admin_session=; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${new Date(0).toUTCString()}${config.cookieSecure ? '; Secure' : ''}`;
}

function sameDateOrValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return Object.is(left.getTime(), right.getTime());
  return left === right;
}

function sameSession(left: any, right: any): boolean {
  if (left === null || right === null) return left === right;
  if (!left || !right) return left === right;
  const sameBuffer = (a: unknown, b: unknown) => Buffer.isBuffer(a) && Buffer.isBuffer(b) ? a.equals(b) : a === b;
  const sameOwner = left.adminUser === null || right.adminUser === null
    ? left.adminUser === right.adminUser
    : left.adminUser === undefined || right.adminUser === undefined
      ? left.adminUser === right.adminUser
      : left.adminUser.id === right.adminUser.id && left.adminUser.active === right.adminUser.active &&
        left.adminUser.mustChangePassword === right.adminUser.mustChangePassword;
  return left.id === right.id && left.adminUserId === right.adminUserId && Object.is(left.nonceVersion, right.nonceVersion) &&
    sameBuffer(left.nonceCiphertext, right.nonceCiphertext) && sameBuffer(left.nonceIv, right.nonceIv) &&
    sameBuffer(left.nonceTag, right.nonceTag) && sameDateOrValue(left.createdAt, right.createdAt) &&
    sameDateOrValue(left.lastActivityAt, right.lastActivityAt) && sameDateOrValue(left.absoluteExpiresAt, right.absoluteExpiresAt) &&
    sameDateOrValue(left.idleExpiresAt, right.idleExpiresAt) && sameDateOrValue(left.revokedAt, right.revokedAt) && sameOwner;
}

function sameSessionExceptRevocation(left: any, right: any): boolean {
  if (!left || !right) return false;
  const leftCopy = copyState(left);
  const rightCopy = copyState(right);
  leftCopy.revokedAt = null;
  rightCopy.revokedAt = null;
  return sameSession(leftCopy, rightCopy);
}

function writeSummary(f: LogoutFixture) {
  const query = f.updateMany.mock.calls[0]?.[0] as any;
  const where = query?.where ?? {};
  const ownerFilter = where.adminUser?.is ?? where.adminUser ?? {};
  const data = query?.data ?? {};
  const absoluteGuard = where.absoluteExpiresAt?.gt;
  const idleGuard = where.idleExpiresAt?.gt;
  return {
    attempts: f.updateMany.mock.calls.length,
    successfulWrites: f.successfulConditionalWrites,
    selectedSession: where.id === f.sessionId,
    ownerGuard: where.adminUserId === f.adminUser.id || ownerFilter.id === f.adminUser.id,
    nonceVersionGuard: where.nonceVersion === f.row.nonceVersion,
    unrevokedGuard: where.revokedAt === null,
    absoluteExpiryGuard: validDate(absoluteGuard) && absoluteGuard.getTime() === f.now && validDate(f.row.absoluteExpiresAt) && f.row.absoluteExpiresAt > absoluteGuard,
    idleExpiryGuard: validDate(idleGuard) && idleGuard.getTime() === f.now && validDate(f.row.idleExpiresAt) && f.row.idleExpiresAt > idleGuard,
    activeAccountGuard: ownerFilter.active === true,
    dataOnlyRevokedAt: Object.keys(data).length === 1 && validDate(data.revokedAt),
    revokedAtIsCurrentTime: validDate(data.revokedAt) && data.revokedAt.getTime() === f.now,
  };
}

function otherMutationCalls(f: LogoutFixture): number {
  return Object.values(f.sessionOtherWrites).reduce((count, mock) => count + mock.mock.calls.length, 0) +
    Object.values(f.preauthWrites).reduce((count, mock) => count + mock.mock.calls.length, 0);
}

function resolveOpenApiReference(document: any, value: any): any {
  const reference = value?.$ref;
  if (typeof reference !== 'string' || !reference.startsWith('#/')) return value;
  return reference.slice(2).split('/').map((part: string) => decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~')))
    .reduce((current: any, part: string) => current?.[part], document);
}

function responseRecorder() {
  const response: any = {
    statusCode: 0, body: undefined,
    setHeader(name: string, value: unknown) { response.headers[name.toLowerCase()] = value; return response; },
    status(value: number) { response.statusCode = value; return response; },
    headers: {} as Record<string, unknown>,
  };
  response.end = jest.fn((..._args: unknown[]) => response);
  response.send = jest.fn((..._args: unknown[]) => response);
  return response;
}

function observeResponse(response: any, handlerReturn: unknown) {
  return {
    sendPayloads: response.send.mock.calls.map((call: unknown[]) => call[0]),
    endPayloads: response.end.mock.calls.map((call: unknown[]) => call[0]),
    handlerReturn,
  };
}

function isBodylessCompletion(observation: ReturnType<typeof observeResponse>, response: unknown): boolean {
  const payloads = [...observation.sendPayloads, ...observation.endPayloads];
  return payloads.length > 0 && payloads.every(payload => payload === undefined) &&
    (observation.handlerReturn === undefined || observation.handlerReturn === response);
}

async function compileAuthModule(f: LogoutFixture, logoutService?: unknown) {
  const builder = Test.createTestingModule({ imports: [AuthModule] })
    .overrideProvider(PrismaService).useValue(f.prisma)
    .overrideProvider(AUTH_RUNTIME).useValue({
      config: f.config, hasher: { verify: async () => false }, blocklist: { hasDigest: () => false },
    })
    .overrideProvider(CSRF_NONCE_CIPHER).useValue(f.cipher);
  if (logoutService !== undefined) builder.overrideProvider(LogoutService).useValue(logoutService);
  return builder.compile();
}

function validConditionalWrite(f: LogoutFixture) {
  return {
    where: {
      id: f.sessionId,
      adminUserId: f.adminUser.id,
      adminUser: { is: { id: f.adminUser.id, active: true } },
      nonceVersion: f.row.nonceVersion,
      revokedAt: null,
      absoluteExpiresAt: { gt: new Date(f.now) },
      idleExpiresAt: { gt: new Date(f.now) },
    },
    data: { revokedAt: new Date(f.now) },
  };
}

describe('conditional revocation predicate model controls (not production behavior evidence)', () => {
  it('accepts a valid conditional predicate only for the current eligible stored row', async () => {
    const f = logoutFixture();
    const before = copyState(f.stored);
    const result = await f.updateMany(validConditionalWrite(f));
    expect({
      count: result.count,
      attempts: f.updateMany.mock.calls.length,
      successfulWrites: f.successfulConditionalWrites,
      onlyRevocationChanged: sameSessionExceptRevocation(f.stored, before),
      revokedAtIsCurrent: f.stored.revokedAt instanceof Date && f.stored.revokedAt.getTime() === f.now,
    }).toEqual({ count: 1, attempts: 1, successfulWrites: 1, onlyRevocationChanged: true, revokedAtIsCurrent: true });
  });

  const predicateMismatches: Array<[string, (f: LogoutFixture, query: any) => void]> = [
    ['current row already revoked', f => { f.row.revokedAt = new Date(NOW - 1); }],
    ['current owner inactive', f => { f.row.adminUser.active = false; }],
    ['wrong relation identity predicate', (_f, query) => { query.where.adminUser.is.id = '00000000-0000-4000-8000-000000000024'; }],
    ['wrong session hash predicate', (_f, query) => { query.where.id = '0'.repeat(64); }],
    ['current nonce version changed', f => { f.row.nonceVersion++; }],
    ['absolute expiry at submitted bound', f => { f.row.absoluteExpiresAt = new Date(NOW); }],
    ['idle expiry at submitted bound', f => { f.row.idleExpiresAt = new Date(NOW); }],
    ['stored relation no longer matches owner key', f => { f.row.adminUser.id = '00000000-0000-4000-8000-000000000024'; }],
  ];
  it.each(predicateMismatches)('rejects %s without changing the stored row', async (_label, mismatch) => {
    const f = logoutFixture();
    const query = validConditionalWrite(f);
    mismatch(f, query);
    const before = copyState(f.stored);
    const result = await f.updateMany(query);
    expect({
      count: result.count,
      attempts: f.updateMany.mock.calls.length,
      successfulWrites: f.successfulConditionalWrites,
      rowUnchanged: sameSession(f.stored, before),
    }).toEqual({ count: 0, attempts: 1, successfulWrites: 0, rowUnchanged: true });
  });
});

describe('LogoutService behavior (neutral RED scaffold)', () => {
  const activeCases = [
    ['ordinary loopback session', false, LOOPBACK_CONFIG, 'http://localhost:4200'],
    ['restricted loopback session', true, LOOPBACK_CONFIG, 'http://localhost:4200'],
    ['ordinary secure-origin session', false, SECURE_CONFIG, 'https://admin.example.test'],
    ['restricted secure-origin session', true, SECURE_CONFIG, 'https://admin.example.test'],
  ] as const;

  it.each(activeCases)('revokes only the selected session and clears its cookie for %s', async (_label, restricted, config, origin) => {
    const f = logoutFixture({ mustChangePassword: restricted }, config);
    const before = copyState(f.stored);
    const outcome = await resultOf(() => f.service.logout({ origin, csrfToken: f.nonceToken, cookieHeader: f.cookieHeader }));
    const result = outcome.value as LogoutResult | null | undefined;
    const error = safeErrorSummary(outcome.error);
    expect({
      completed: result !== null && result !== undefined && outcome.error === undefined,
      clearCookieMatches: result?.clearSessionCookie === clearCookie(config),
      outputKeys: result ? Object.keys(result).sort() : [],
      error,
      sessionReads: f.findUnique.mock.calls.length,
      sessionDecryptions: f.cipher.decrypt.mock.calls.length,
      preauthReads: f.preauthFindUnique.mock.calls.length,
      otherMutationCalls: otherMutationCalls(f),
      revoke: writeSummary(f),
      rowRevokedAtSet: f.stored?.revokedAt instanceof Date && f.stored.revokedAt.getTime() === NOW,
      allOtherSessionFieldsUnchanged: sameSessionExceptRevocation(f.stored, before),
    }).toEqual({
      completed: true,
      clearCookieMatches: true,
      outputKeys: ['clearSessionCookie'],
      error: { status: undefined, code: undefined },
      sessionReads: 1,
      sessionDecryptions: 1,
      preauthReads: 0,
      otherMutationCalls: 0,
      revoke: {
        attempts: 1, successfulWrites: 1, selectedSession: true, ownerGuard: true, nonceVersionGuard: true, unrevokedGuard: true,
        absoluteExpiryGuard: true, idleExpiryGuard: true, activeAccountGuard: true,
        dataOnlyRevokedAt: true, revokedAtIsCurrentTime: true,
      },
      rowRevokedAtSet: true,
      allOtherSessionFieldsUnchanged: true,
    });
  });

  type StaleScenario = {
    label: string;
    options: LogoutFixtureOptions;
    cookie: (f: LogoutFixture) => string | undefined;
    csrf: (f: LogoutFixture) => string | undefined;
    expectedSessionReads: number;
  };
  const staleScenarios: StaleScenario[] = [
    { label: 'missing cookie', options: {}, cookie: () => undefined, csrf: () => 'invalid-but-ignored', expectedSessionReads: 0 },
    { label: 'unknown session', options: { missingRow: true }, cookie: f => f.cookieHeader, csrf: () => 'invalid-but-ignored', expectedSessionReads: 1 },
    { label: 'absolute expiry boundary', options: { absoluteExpiresAt: new Date(NOW) }, cookie: f => f.cookieHeader, csrf: () => 'invalid-but-ignored', expectedSessionReads: 1 },
    { label: 'idle expiry boundary', options: { idleExpiresAt: new Date(NOW) }, cookie: f => f.cookieHeader, csrf: () => 'invalid-but-ignored', expectedSessionReads: 1 },
    { label: 'revoked session', options: { revokedAt: new Date(NOW - 1) }, cookie: f => f.cookieHeader, csrf: () => 'invalid-but-ignored', expectedSessionReads: 1 },
    { label: 'known inactive owner', options: { active: false }, cookie: f => f.cookieHeader, csrf: () => 'invalid-but-ignored', expectedSessionReads: 1 },
    { label: 'malformed token', options: {}, cookie: () => 'abar_admin_session=not-canonical', csrf: () => 'invalid-but-ignored', expectedSessionReads: 0 },
    { label: 'duplicate session cookie', options: {}, cookie: f => `${f.cookieHeader}; ${f.cookieHeader}`, csrf: f => f.nonceToken, expectedSessionReads: 0 },
    { label: 'CRLF before embedded token', options: {}, cookie: f => `abar_admin_session=\r\n${f.sessionToken}`, csrf: f => f.nonceToken, expectedSessionReads: 0 },
    { label: 'CRLF after embedded token', options: {}, cookie: f => `abar_admin_session=${f.sessionToken}\r\n`, csrf: f => f.nonceToken, expectedSessionReads: 0 },
    { label: 'CRLF inside embedded token', options: {}, cookie: f => `abar_admin_session=${f.sessionToken.slice(0, 21)}\r\n${f.sessionToken.slice(21)}`, csrf: f => f.nonceToken, expectedSessionReads: 0 },
    { label: 'NUL inside embedded token', options: {}, cookie: f => `abar_admin_session=${f.sessionToken.slice(0, 21)}\0${f.sessionToken.slice(21)}`, csrf: f => f.nonceToken, expectedSessionReads: 0 },
    { label: 'DEL inside embedded token', options: {}, cookie: f => `abar_admin_session=${f.sessionToken.slice(0, 21)}\x7f${f.sessionToken.slice(21)}`, csrf: f => f.nonceToken, expectedSessionReads: 0 },
    { label: 'pre-auth-only cookie and proof', options: {}, cookie: f => `abar_auth_context=${f.preauthToken}`, csrf: f => f.preauthNonceToken, expectedSessionReads: 0 },
  ];

  it.each(staleScenarios.map(scenario => [scenario.label, scenario] as const))(
    'returns no-active-session success and clears only the session cookie for %s', async (_label, scenario) => {
      const f = logoutFixture(scenario.options);
      const before = copyState(f.stored);
      const outcome = await resultOf(() => f.service.logout({
        origin: f.config.allowedOrigins[0], csrfToken: scenario.csrf(f), cookieHeader: scenario.cookie(f),
      }));
      const result = outcome.value as LogoutResult | null | undefined;
      expect({
        completed: result !== null && result !== undefined && outcome.error === undefined,
        clearCookieMatches: result?.clearSessionCookie === clearCookie(f.config),
        outputKeys: result ? Object.keys(result).sort() : [],
        error: safeErrorSummary(outcome.error),
        sessionReads: f.findUnique.mock.calls.length,
        expectedSessionReads: scenario.expectedSessionReads,
        sessionDecryptions: f.cipher.decrypt.mock.calls.length,
        preauthReads: f.preauthFindUnique.mock.calls.length,
        conditionalAttempts: f.updateMany.mock.calls.length,
        successfulConditionalWrites: f.successfulConditionalWrites,
        otherMutationCalls: otherMutationCalls(f),
        rowUnchanged: sameSession(f.stored, before),
      }).toEqual({
        completed: true,
        clearCookieMatches: true,
        outputKeys: ['clearSessionCookie'],
        error: { status: undefined, code: undefined },
        sessionReads: scenario.expectedSessionReads,
        expectedSessionReads: scenario.expectedSessionReads,
        sessionDecryptions: 0,
        preauthReads: 0,
        conditionalAttempts: 0,
        successfulConditionalWrites: 0,
        otherMutationCalls: 0,
        rowUnchanged: true,
      });
    },
  );

  it.each([
    ['missing Origin before a storage failure', { failSessionLookup: true }, undefined],
    ['wrong Origin with a stale cookie', { missingRow: true }, 'https://attacker.invalid'],
    ['wrong Origin before an invalid clock', { clock: Number.NaN }, 'https://attacker.invalid'],
  ] as const)('rejects %s before any session or pre-auth lookup', async (_label, options, origin) => {
    const f = logoutFixture(options);
    const outcome = await resultOf(() => f.service.logout({ origin, csrfToken: f.nonceToken, cookieHeader: f.cookieHeader }));
    expect({
      error: safeErrorSummary(outcome.error),
      sessionReads: f.findUnique.mock.calls.length,
      decryptions: f.cipher.decrypt.mock.calls.length,
      preauthReads: f.preauthFindUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
    }).toEqual({
      error: { status: 403, code: 'ORIGIN_INVALID' }, sessionReads: 0, decryptions: 0, preauthReads: 0,
      conditionalAttempts: 0, successfulConditionalWrites: 0, otherMutationCalls: 0,
    });
  });

  const proofCases = [
    ['missing proof', (_f: LogoutFixture) => undefined, (f: LogoutFixture) => f.cookieHeader],
    ['wrong active-session proof', (f: LogoutFixture) => f.wrongNonceToken, (f: LogoutFixture) => f.cookieHeader],
    ['pre-auth-only proof with an active session', (f: LogoutFixture) => f.preauthNonceToken,
      (f: LogoutFixture) => `${f.cookieHeader}; abar_auth_context=${f.preauthToken}`],
  ] as const;
  it.each(proofCases)('rejects %s for an active session without mutation', async (_label, proofFor, cookieFor) => {
    const f = logoutFixture();
    const before = copyState(f.stored);
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: proofFor(f), cookieHeader: cookieFor(f),
    }));
    expect({
      error: safeErrorSummary(outcome.error),
      sessionWasRead: f.findUnique.mock.calls.length > 0,
      preauthReads: f.preauthFindUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      rowUnchanged: sameSession(f.stored, before),
    }).toEqual({
      error: { status: 403, code: 'CSRF_INVALID' }, sessionWasRead: true, preauthReads: 0,
      conditionalAttempts: 0, successfulConditionalWrites: 0, otherMutationCalls: 0, rowUnchanged: true,
    });
  });

  it.each([
    ['session database lookup failure', { failSessionLookup: true }, 0],
    ['unavailable cipher for an active proof', { unavailableCipher: true }, 0],
    ['corrupt active-session nonce', { corruptNonce: true }, 0],
    ['conditional revocation storage failure', { failSessionUpdate: true }, 1],
  ] as const)('fails safely with SERVICE_UNAVAILABLE on %s', async (_label, options, expectedAttempts) => {
    const f = logoutFixture(options);
    const before = copyState(f.stored);
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    expect({
      error: safeErrorSummary(outcome.error),
      preauthReads: f.preauthFindUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      submittedWrite: expectedAttempts === 1 ? writeSummary(f) : undefined,
      otherMutationCalls: otherMutationCalls(f),
      rowUnchanged: sameSession(f.stored, before),
    }).toEqual({
      error: { status: 503, code: 'SERVICE_UNAVAILABLE' }, preauthReads: 0,
      conditionalAttempts: expectedAttempts, successfulConditionalWrites: 0,
      submittedWrite: expectedAttempts === 1 ? {
        attempts: 1, successfulWrites: 0, selectedSession: true, ownerGuard: true, nonceVersionGuard: true,
        unrevokedGuard: true, absoluteExpiryGuard: true, idleExpiryGuard: true, activeAccountGuard: true,
        dataOnlyRevokedAt: true, revokedAtIsCurrentTime: true,
      } : undefined,
      otherMutationCalls: 0, rowUnchanged: true,
    });
  });

  it.each([
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('fails closed with SERVICE_UNAVAILABLE for an invalid clock (%s)', async (_label, clock) => {
    const f = logoutFixture({ clock });
    const before = copyState(f.stored);
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    expect({
      error: safeErrorSummary(outcome.error),
      decryptions: f.cipher.decrypt.mock.calls.length,
      preauthReads: f.preauthFindUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      rowUnchanged: sameSession(f.stored, before),
    }).toEqual({
      error: { status: 503, code: 'SERVICE_UNAVAILABLE' }, decryptions: 0, preauthReads: 0,
      conditionalAttempts: 0, successfulConditionalWrites: 0, otherMutationCalls: 0, rowUnchanged: true,
    });
  });

  it.each([
    ['invalid absolute expiry', 'absolute-expiry'],
    ['invalid nonce version', 'nonce-version'],
    ['missing owner relation', 'missing-relation'],
    ['non-boolean active metadata', 'invalid-active'],
    ['relation/foreign-key mismatch', 'relation-mismatch'],
    ['invalid revocation metadata', 'invalid-revocation'],
  ] as const)('fails closed with SERVICE_UNAVAILABLE for %s', async (_label, malformedMetadata) => {
    const f = logoutFixture({ malformedMetadata });
    const before = copyState(f.stored);
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    expect({
      error: safeErrorSummary(outcome.error),
      sessionReads: f.findUnique.mock.calls.length,
      preauthReads: f.preauthFindUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      rowUnchanged: sameSession(f.stored, before),
    }).toEqual({
      error: { status: 503, code: 'SERVICE_UNAVAILABLE' }, sessionReads: 1, preauthReads: 0,
      conditionalAttempts: 0, successfulConditionalWrites: 0, otherMutationCalls: 0, rowUnchanged: true,
    });
  });

  it('rechecks expiry after lookup and clears a session that expired while storage was pending', async () => {
    const expiry = new Date(NOW + 1_000);
    const f = logoutFixture({
      absoluteExpiresAt: expiry,
      onSessionLookup: (count, setNow) => { if (count === 1) setNow(expiry.getTime()); },
    });
    const before = copyState(f.stored);
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    const result = outcome.value as LogoutResult | null | undefined;
    expect({
      completed: result !== null && result !== undefined && outcome.error === undefined,
      clearCookieMatches: result?.clearSessionCookie === clearCookie(f.config),
      sessionReads: f.findUnique.mock.calls.length,
      decryptions: f.cipher.decrypt.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      rowUnchanged: sameSession(f.stored, before),
    }).toEqual({
      completed: true, clearCookieMatches: true, sessionReads: 1, decryptions: 0,
      conditionalAttempts: 0, successfulConditionalWrites: 0, otherMutationCalls: 0, rowUnchanged: true,
    });
  });

  it('treats a concurrent completed logout as idempotent after the conditional write loses', async () => {
    const f = logoutFixture({ conditionalWriteRace: 'revoked' });
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    const result = outcome.value as LogoutResult | null | undefined;
    expect({
      completed: result !== null && result !== undefined && outcome.error === undefined,
      clearCookieMatches: result?.clearSessionCookie === clearCookie(f.config),
      sessionReads: f.findUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      preauthReads: f.preauthFindUnique.mock.calls.length,
      rowIsRevoked: f.stored?.revokedAt instanceof Date,
    }).toEqual({
      completed: true, clearCookieMatches: true, sessionReads: 2, conditionalAttempts: 1,
      successfulConditionalWrites: 0, otherMutationCalls: 0, preauthReads: 0, rowIsRevoked: true,
    });
  });

  it('observes a concurrent owner deactivation before declaring revocation success', async () => {
    const f = logoutFixture({ conditionalWriteRace: 'deactivated' });
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    const result = outcome.value as LogoutResult | null | undefined;
    expect({
      completed: result !== null && result !== undefined && outcome.error === undefined,
      clearCookieMatches: result?.clearSessionCookie === clearCookie(f.config),
      sessionReads: f.findUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      ownerInactive: f.stored?.adminUser?.active === false,
      sessionStillUnrevoked: f.stored?.revokedAt === null,
    }).toEqual({
      completed: true, clearCookieMatches: true, sessionReads: 2, conditionalAttempts: 1,
      successfulConditionalWrites: 0, otherMutationCalls: 0, ownerInactive: true, sessionStillUnrevoked: true,
    });
  });

  it('fails safely after a concurrent owner-relation identity change', async () => {
    const f = logoutFixture({ conditionalWriteRace: 'relation-change' });
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    expect({
      error: safeErrorSummary(outcome.error),
      sessionReads: f.findUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      relationNoLongerMatchesOwnerKey: f.stored?.adminUser?.id !== f.stored?.adminUserId,
      sessionStillUnrevoked: f.stored?.revokedAt === null,
    }).toEqual({
      error: { status: 503, code: 'SERVICE_UNAVAILABLE' }, sessionReads: 2, conditionalAttempts: 1,
      successfulConditionalWrites: 0, otherMutationCalls: 0, relationNoLongerMatchesOwnerKey: true, sessionStillUnrevoked: true,
    });
  });

  it('does not turn an active nonce-version race into stale-cookie success', async () => {
    const f = logoutFixture({ conditionalWriteRace: 'nonce-rotation' });
    const outcome = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
    }));
    expect({
      error: safeErrorSummary(outcome.error),
      sessionReads: f.findUnique.mock.calls.length,
      conditionalAttempts: f.updateMany.mock.calls.length,
      successfulConditionalWrites: f.successfulConditionalWrites,
      otherMutationCalls: otherMutationCalls(f),
      preauthReads: f.preauthFindUnique.mock.calls.length,
      stillActive: f.stored?.revokedAt === null,
      versionChanged: f.stored?.nonceVersion !== 1,
    }).toEqual({
      error: { status: 403, code: 'CSRF_INVALID' }, sessionReads: 2, conditionalAttempts: 1,
      successfulConditionalWrites: 0, otherMutationCalls: 0, preauthReads: 0, stillActive: true, versionChanged: true,
    });
  });
});

describe('logout application integration (RED checkpoint)', () => {
  it('registers and exercises the actual LogoutService from the real AuthModule', async () => {
    const f = logoutFixture();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    let module: Awaited<ReturnType<typeof compileAuthModule>> | undefined;
    try {
      module = await compileAuthModule(f);
      const service = module.get(LogoutService, { strict: false });
      expect(service).toBeInstanceOf(LogoutService);
      const result = await service.logout({
        origin: f.config.allowedOrigins[0], csrfToken: f.nonceToken, cookieHeader: f.cookieHeader,
      });
      expect(result).toEqual({ clearSessionCookie: clearCookie(f.config) });
      expect({
        sessionReads: f.findUnique.mock.calls.length,
        decryptions: f.cipher.decrypt.mock.calls.length,
        conditionalWrites: f.updateMany.mock.calls.length,
        successfulWrites: f.successfulConditionalWrites,
      }).toEqual({ sessionReads: 1, decryptions: 1, conditionalWrites: 1, successfulWrites: 1 });
    } finally {
      clock.mockRestore();
      await module?.close();
    }
  });

  it('publishes the logout route in the public production Swagger document', async () => {
    const f = logoutFixture();
    const module = await compileAuthModule(f);
    const app = module.createNestApplication<NestExpressApplication>();
    const setup = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    try {
      configureApplication(app);
      const document = setup.mock.calls[0]?.[2] as any;
      const operation = document?.paths?.['/api/v1/auth/logout']?.post;
      expect(operation).toBeDefined();
      if (!operation) return;
      expect(operation).toMatchObject({
        operationId: 'logoutAdmin',
        security: [{}, { AdminSessionCookie: [] }],
        responses: {
          '204': { headers: { 'Cache-Control': expect.any(Object), 'Set-Cookie': expect.any(Object) } },
          '403': expect.any(Object), '503': expect.any(Object),
        },
        'x-abar-errors': { '403': ['ORIGIN_INVALID', 'CSRF_INVALID'], '503': ['SERVICE_UNAVAILABLE'] },
      });
      expect(Object.keys(operation.responses).sort()).toEqual(['204', '403', '503']);
      expect(operation.responses['204']).not.toHaveProperty('content');
      const originParameter = resolveOpenApiReference(document,
        operation.parameters.find((parameter: any) => resolveOpenApiReference(document, parameter)?.name === 'Origin'));
      const csrfParameter = resolveOpenApiReference(document,
        operation.parameters.find((parameter: any) => resolveOpenApiReference(document, parameter)?.name === 'X-CSRF-Token'));
      expect(originParameter).toMatchObject({ name: 'Origin', in: 'header', required: true });
      expect(resolveOpenApiReference(document, originParameter.schema)).toMatchObject({ type: 'string', minLength: 1 });
      expect(originParameter.description).toMatch(/exact.{0,40}(allowlist|allowed origins)|(allowlist|allowed origins).{0,40}exact|only.{0,30}(configured )?origins/i);
      expect(originParameter.description).toMatch(/\b(?:never|not|no|without)\b.{0,60}(?:forwarded|proxy)|(?:forwarded|proxy).{0,60}\b(?:never|not|no|without)\b/i);
      expect(originParameter.description).toMatch(/\b(?:no|never|without|not)\b.{0,50}(?:referer|fallback)|(?:referer|fallback).{0,50}\b(?:no|never|not|without)\b/i);
      expect(originParameter.description).toContain('http://127.0.0.1:4200');
      expect(originParameter.description).toContain('http://localhost:4200');
      expect(csrfParameter).toMatchObject({ name: 'X-CSRF-Token', in: 'header', required: false });
      expect(csrfParameter.description).toMatch(/active session/i);
      expect(csrfParameter.description).toMatch(/(?:bound|tied).{0,30}session|session.{0,30}(?:bound|tied)/i);
      expect(resolveOpenApiReference(document, csrfParameter.schema)).toMatchObject({
        type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$',
      });
      const responseHeaders = operation.responses['204'].headers;
      const noStore = resolveOpenApiReference(document, responseHeaders['Cache-Control']);
      expect(noStore.schema).toMatchObject({ type: 'string', enum: ['no-store'] });
      const clearCookieHeader = resolveOpenApiReference(document, responseHeaders['Set-Cookie']);
      expect(clearCookieHeader.description).toMatch(/abar_admin_session/i);
      expect(clearCookieHeader.description).toMatch(/matching (?:path(?:\/| and )?)?attributes/i);
      expect(clearCookieHeader.description).toMatch(/Max-Age=0/i);
      expect(clearCookieHeader.description).toMatch(/past Expires|Expires in the past/i);
      expect(clearCookieHeader.schema).toMatchObject({ type: 'string' });
      expect(operation.security).not.toContainEqual(expect.objectContaining({ AuthPreauthCookie: expect.anything() }));
    } finally {
      setup.mockRestore();
      await app.close();
    }
  });

  it('maps request headers through the real AuthModule controller and completes without a body', async () => {
    const handler = (AuthController.prototype as unknown as Record<string, unknown>).logout;
    expect(typeof handler).toBe('function');
    if (typeof handler !== 'function') return;

    const clearCookieValue = 'abar_admin_session=; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=0';
    const service = { logout: jest.fn().mockResolvedValue({ clearSessionCookie: clearCookieValue }) };
    const module = await compileAuthModule(logoutFixture(), service);
    try {
      const controller = module.get(AuthController) as unknown as Record<string, unknown>;
      const response = responseRecorder();
      const request = { headers: {
        origin: 'http://localhost:4200', 'x-csrf-token': 'fixture-csrf-proof', cookie: 'abar_admin_session=fixture-session',
      } };
      const handlerReturn = await Reflect.apply(handler, controller, [request, response]);
      const observation = observeResponse(response, handlerReturn);
      expect(service.logout).toHaveBeenCalledWith({
        origin: request.headers.origin, csrfToken: request.headers['x-csrf-token'], cookieHeader: request.headers.cookie,
      });
      expect(response.statusCode).toBe(204);
      expect(response.body).toBeUndefined();
      expect(isBodylessCompletion(observation, response)).toBe(true);
      expect(response.headers).toMatchObject({ 'cache-control': 'no-store', 'set-cookie': clearCookieValue });
    } finally {
      await module.close();
    }
  });

  it('accepts empty completion and rejects payloads observed through the controller recorder', () => {
    const emptySend = responseRecorder();
    emptySend.send();
    const emptySendObservation = observeResponse(emptySend, undefined);
    expect(emptySendObservation.sendPayloads).toEqual([undefined]);
    expect(isBodylessCompletion(emptySendObservation, emptySend)).toBe(true);

    const emptyEnd = responseRecorder();
    const chainReturn = emptyEnd.end();
    const emptyEndObservation = observeResponse(emptyEnd, chainReturn);
    expect(emptyEndObservation.endPayloads).toEqual([undefined]);
    expect(isBodylessCompletion(emptyEndObservation, emptyEnd)).toBe(true);

    const send = responseRecorder();
    const sendPayload = { unexpected: 'send body' };
    send.send(sendPayload);
    const sendObservation = observeResponse(send, undefined);
    expect(sendObservation.sendPayloads).toEqual([sendPayload]);
    expect(isBodylessCompletion(sendObservation, send)).toBe(false);

    const end = responseRecorder();
    const endPayload = 'unexpected end body';
    end.end(endPayload);
    const endObservation = observeResponse(end, undefined);
    expect(endObservation.endPayloads).toEqual([endPayload]);
    expect(isBodylessCompletion(endObservation, end)).toBe(false);

    const returnedDto = { clearSessionCookie: 'secret' };
    const returnedObservation = observeResponse(emptySend, returnedDto);
    expect(returnedObservation.sendPayloads).toEqual([undefined]);
    expect(returnedObservation.handlerReturn).toBe(returnedDto);
    expect(isBodylessCompletion(returnedObservation, emptySend)).toBe(false);
  });

  it('filters actual LogoutService-owned errors using raw safe responses without matched route metadata', async () => {
    const f = logoutFixture();
    const originError = await resultOf(() => f.service.logout({ origin: 'https://untrusted.example' }));
    const csrfError = await resultOf(() => f.service.logout({
      origin: f.config.allowedOrigins[0], csrfToken: f.wrongNonceToken, cookieHeader: f.cookieHeader,
    }));
    const storageFixture = logoutFixture({ failSessionLookup: true });
    const storageError = await resultOf(() => storageFixture.service.logout({
      origin: storageFixture.config.allowedOrigins[0], csrfToken: storageFixture.nonceToken,
      cookieHeader: storageFixture.cookieHeader,
    }));
    const cases = [
      [originError.error, 403, 'ORIGIN_INVALID', 'Origen no permitido'],
      [csrfError.error, 403, 'CSRF_INVALID', 'Solicitud inválida'],
      [storageError.error, 503, 'SERVICE_UNAVAILABLE', 'Servicio temporalmente no disponible'],
    ] as const;
    const filter = new ApiExceptionFilter();
    for (const [error, status, code, message] of cases) {
      expect(error).toBeInstanceOf(Error);
      const secretFixture = `${f.sessionToken} ${f.nonceToken} ${f.cookieHeader}`;
      let statusReads = 0;
      let codeReads = 0;
      Object.defineProperties(error as object, {
        getStatus: { configurable: true, get: () => { statusReads++; throw new Error('status getter invoked'); } },
        code: { configurable: true, get: () => { codeReads++; throw new Error('code getter invoked'); } },
      });
      for (const request of [
        { path: '/unmatched', route: undefined },
        { path: '/api/v1/auth/logout', route: undefined },
        { path: '/spoofed', route: { path: '/api/v1/auth/logout' } },
      ]) {
        const headers: Record<string, string> = {};
        const response = {
          statusCode: 0, body: undefined as unknown,
          setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; return this; },
          status(value: number) { this.statusCode = value; return this; },
          json(value: unknown) { this.body = value; return this; },
        };
        const req = { ...request, requestId: '00000000-0000-4000-8000-000000000091' };
        filter.catch(error, { switchToHttp: () => ({ getRequest: () => req, getResponse: () => response }) } as never);
        expect(response.statusCode).toBe(status);
        expect(response.body).toEqual({ code, message, requestId: req.requestId });
        expect(JSON.stringify(response.body)).not.toContain(secretFixture);
        expect(headers['cache-control']).toBe('no-store');
      }
      expect({ statusReads, codeReads }).toEqual({ statusReads: 0, codeReads: 0 });
    }
  });
});
