import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthConfig, validateAuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AUTH_RUNTIME } from './auth-runtime.module';
import { AuthModule } from './auth.module';
import { CSRF_NONCE_CIPHER, CsrfService, getCsrfRouteErrorMetadata } from './csrf.service';
import { CsrfNonceCipher } from './csrf-nonce.cipher';
import { PrismaService } from '../prisma/prisma.service';
import { configureApplication } from '../configure-application';
import {
  getLoginRouteErrorMetadata, LoginRouteException, LoginService, LoginServiceDependencies,
} from './login.service';

const TEST_KEY = Buffer.alloc(32, 5).toString('base64url'); // synthetic test-only key
const phcBase64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
const PHC = `$argon2id$v=19$m=19456,t=2,p=1$${phcBase64(Buffer.alloc(16, 1))}$${phcBase64(Buffer.alloc(32, 2))}`;
const DUMMY_PHC = `$argon2id$v=19$m=19456,t=2,p=1$${phcBase64(Buffer.alloc(16, 3))}$${phcBase64(Buffer.alloc(32, 4))}`;
const config: AuthConfig = validateAuthConfig({ NODE_ENV: 'test' });
const hashId = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = (byte: number) => Buffer.alloc(32, byte).toString('base64url');
const validPhc = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(value);
  if (!match) return false;
  return [[match[1], 16], [match[2], 32]].every(([encoded, size]) => {
    const decoded = Buffer.from(encoded as string, 'base64');
    return decoded.length === size && decoded.toString('base64').replace(/=+$/, '') === encoded;
  });
};

function responseDouble() {
  const headers: Record<string, unknown> = {};
  const response = {
    statusCode: 0, body: undefined as unknown,
    setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = value; return this; },
    status(value: number) { this.statusCode = value; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  return { response, headers };
}

const validRequest = () => ({
  body: { email: 'admin@example.test', password: '  correct horse  ' },
  origin: 'http://localhost:4200', csrfToken: opaque(22),
  cookieHeader: `abar_auth_context=${opaque(21)}`, clientIp: '127.0.0.1',
});

function fixture(options: {
  user?: { active?: boolean; mustChangePassword?: boolean; version?: number; passwordHash?: string } | null;
  verify?: boolean | Error;
  serviceCipher?: CsrfNonceCipher;
  failPreauthLookup?: boolean;
  failSessionLookup?: boolean;
  failSessionCreate?: boolean;
  failUserLookup?: boolean;
  beforeTransaction?: () => void;
  duringVerify?: () => Promise<void> | void;
} = {}) {
  let now = Date.UTC(2026, 9, 9, 12);
  const cipher = new CsrfNonceCipher(TEST_KEY);
  const preToken = opaque(21);
  const preId = hashId(preToken);
  const preNonce = Buffer.alloc(32, 22);
  const preEnvelope = cipher.encrypt('preauth', preId, 1, preNonce);
  const user = options.user === null ? null : {
    id: '00000000-0000-4000-8000-000000000017', name: 'Operator', email: 'admin@example.test',
    passwordHash: PHC, active: true, mustChangePassword: false, version: 1,
    createdAt: new Date(now - 1000), updatedAt: new Date(now - 1000), ...options.user,
  };
  const users = new Map<string, any>(user ? [[user.email, user]] : []);
  const preauth = new Map<string, any>([[preId, {
    id: preId, nonceCiphertext: preEnvelope.ciphertext, nonceIv: preEnvelope.iv, nonceTag: preEnvelope.tag,
    nonceVersion: 1, createdAt: new Date(now - 1000), expiresAt: new Date(now + 900_000),
  }]]);
  const sessions = new Map<string, any>();
  const events: string[] = [];
  const calls = { userLookup: 0, contextLookup: 0, preauthCreate: 0, sessionLookup: 0, sessionActivity: 0, transaction: 0, userGuard: 0, consume: 0, revokeSession: 0, createSession: 0 };
  const hasher = { verify: jest.fn(async (_phc: unknown, _password: unknown) => {
    if (options.verify instanceof Error) throw options.verify;
    await options.duringVerify?.();
    return options.verify ?? false;
  }) };
  let failSessionCreate = options.failSessionCreate ?? false;
  let failUserLookup = options.failUserLookup ?? false;
  let failPreauthLookup = options.failPreauthLookup ?? false;
  let failSessionLookup = options.failSessionLookup ?? false;
  let beforeTransaction = options.beforeTransaction;
  let transactionTail: Promise<void> = Promise.resolve();
  const cloneState = (value: any): any => {
    if (value instanceof Date) return new Date(value.getTime());
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (Array.isArray(value)) return value.map(cloneState);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneState(item)]));
    return value;
  };

  const prisma: any = {
    adminUser: { findUnique: jest.fn(async ({ where }: any) => {
      calls.userLookup++; events.push('user.lookup');
      if (failUserLookup) throw new Error('synthetic storage failure');
      const row = users.get(where.email);
      return row ? { ...row } : null;
    }) },
    authPreAuthContext: {
      findUnique: jest.fn(async ({ where }: any) => {
        calls.contextLookup++; events.push('context.lookup');
        if (failPreauthLookup) throw new Error('synthetic pre-auth storage failure');
        return preauth.get(where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        calls.preauthCreate++; events.push('context.create');
        if (preauth.has(data.id)) throw new Error('synthetic pre-auth unique constraint failure');
        const row = {
          ...data,
          nonceCiphertext: Buffer.from(data.nonceCiphertext), nonceIv: Buffer.from(data.nonceIv), nonceTag: Buffer.from(data.nonceTag),
        };
        preauth.set(data.id, row);
        return cloneState(row);
      }),
    },
    authSession: {
      findUnique: jest.fn(async ({ where }: any) => {
        calls.sessionLookup++; events.push('session.lookup');
        if (failSessionLookup) throw new Error('synthetic session storage failure');
        return sessions.get(where.id) ?? null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        events.push('session.activity.attempt');
        const row = sessions.get(where.id);
        const valid = row && row.revokedAt === where.revokedAt && row.nonceVersion === where.nonceVersion &&
          row.absoluteExpiresAt > where.absoluteExpiresAt.gt && row.idleExpiresAt > where.idleExpiresAt.gt &&
          row.adminUser?.active === where.adminUser.is.active &&
          row.adminUser?.mustChangePassword === where.adminUser.is.mustChangePassword;
        if (!valid) return { count: 0 };
        Object.assign(row, data);
        calls.sessionActivity++;
        return { count: 1 };
      }),
    },
    $transaction: jest.fn(async (work: (tx: any) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
      calls.transaction++; events.push('transaction.begin');
      beforeTransaction?.();
      const stagedPreauth = new Map([...preauth].map(([key, value]) => [key, cloneState(value)]));
      const stagedSessions = new Map([...sessions].map(([key, value]) => [key, cloneState(value)]));
      const stagedUsers = new Map([...users].map(([key, value]) => [key, cloneState(value)]));
      const tx = {
        adminUser: { updateMany: jest.fn(async ({ where, data }: any) => {
          calls.userGuard++; events.push('user.recheck');
          const row = [...stagedUsers.values()].find((candidate) => Object.entries(where).every(([key, value]) =>
            value instanceof Date && candidate[key] instanceof Date
              ? candidate[key].getTime() === value.getTime()
              : candidate[key] === value));
          if (!row) return { count: 0 };
          Object.assign(row, data); return { count: 1 };
        }) },
        authPreAuthContext: { deleteMany: jest.fn(async ({ where }: any) => {
          events.push('context.consume.attempt');
          const row = stagedPreauth.get(where.id);
          const valid = row && row.id === where.id &&
            (where.nonceVersion === undefined || row.nonceVersion === where.nonceVersion) &&
            (where.expiresAt?.gt === undefined || row.expiresAt > where.expiresAt.gt);
          if (!valid) return { count: 0 };
          calls.consume++; stagedPreauth.delete(where.id); return { count: 1 };
        }) },
        authSession: {
          updateMany: jest.fn(async ({ where, data }: any) => {
            events.push('session.revoke.attempt');
            const row = stagedSessions.get(where.id);
            const valid = row && row.revokedAt === null && row.nonceVersion === where.nonceVersion &&
              row.absoluteExpiresAt > where.absoluteExpiresAt.gt && row.idleExpiresAt > where.idleExpiresAt.gt &&
              row.adminUser?.id === where.adminUser.is.id && row.adminUser?.active === true &&
              row.adminUser?.mustChangePassword === false && row.adminUser?.version === where.adminUser.is.version;
            if (!valid) return { count: 0 };
            Object.assign(row, data); calls.revokeSession++; return { count: 1 };
          }),
          create: jest.fn(async ({ data }: any) => {
            events.push('session.create.attempt'); calls.createSession++;
            if (failSessionCreate) throw new Error('synthetic session write failure');
            const accountRow = [...stagedUsers.values()].find((candidate) => candidate.id === data.adminUserId);
            stagedSessions.set(data.id, {
              ...data, nonceCiphertext: Buffer.from(data.nonceCiphertext), nonceIv: Buffer.from(data.nonceIv), nonceTag: Buffer.from(data.nonceTag),
              adminUser: accountRow,
            }); return stagedSessions.get(data.id);
          }),
        },
      };
      try {
        const result = await work(tx);
        preauth.clear(); for (const [key, value] of stagedPreauth) preauth.set(key, value);
        sessions.clear(); for (const [key, value] of stagedSessions) sessions.set(key, value);
        users.clear(); for (const [key, value] of stagedUsers) users.set(key, value);
        events.push('transaction.commit');
        return result;
      } catch (error) {
        events.push('transaction.rollback');
        throw error;
      }
      } finally {
        release();
      }
    }),
  };
  const dependencies: LoginServiceDependencies = { prisma, hasher, cipher: options.serviceCipher ?? cipher, config };
  const service = new LoginService(dependencies, () => now);
  const request = validRequest();
  request.cookieHeader = `abar_auth_context=${preToken}`;
  request.csrfToken = preNonce.toString('base64url');
  return {
    service, request, prisma, hasher, cipher, preauth, sessions, users, events, calls, preToken, preId, preNonce,
    currentNow() { return now; },
    setNow(value: number) { now = value; }, setFailSessionCreate(value: boolean) { failSessionCreate = value; },
    setBeforeTransaction(hook?: () => void) { beforeTransaction = hook; },
    setFailUserLookup(value: boolean) { failUserLookup = value; },
  };
}

function addSessionContext(f: ReturnType<typeof fixture>, options: {
  tokenByte: number; nonceByte: number; ownerId?: string; active?: boolean; mustChangePassword?: boolean;
  revokedAt?: Date | null; absoluteExpiresAt?: Date; idleExpiresAt?: Date; nonceVersion?: number; corruptTag?: boolean;
}) {
  const token = opaque(options.tokenByte);
  const id = hashId(token);
  const nonce = Buffer.alloc(32, options.nonceByte);
  const version = options.nonceVersion ?? 4;
  const envelope = f.cipher.encrypt('session', id, version, nonce);
  const owner = {
    ...f.users.get('admin@example.test'), id: options.ownerId ?? f.users.get('admin@example.test').id,
    active: options.active ?? true, mustChangePassword: options.mustChangePassword ?? false,
  };
  const row = {
    id, adminUserId: owner.id, nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv,
    nonceTag: options.corruptTag ? Buffer.alloc(16, 9) : envelope.tag, nonceVersion: version,
    createdAt: new Date(Date.UTC(2026, 9, 9, 11, 59, 59)),
    lastActivityAt: new Date(Date.UTC(2026, 9, 9, 11, 59, 59)),
    absoluteExpiresAt: options.absoluteExpiresAt ?? new Date(Date.UTC(2026, 9, 9, 13)),
    idleExpiresAt: options.idleExpiresAt ?? new Date(Date.UTC(2026, 9, 9, 12, 30)),
    revokedAt: options.revokedAt ?? null, adminUser: owner,
  };
  f.sessions.set(id, row);
  return { token, id, nonce, row };
}

async function capture(operation: () => Promise<unknown>) {
  try { return { value: await operation(), error: undefined }; }
  catch (error) { return { value: undefined, error }; }
}

function metadata(error: unknown) { return getLoginRouteErrorMetadata(error); }

describe('production-configured login OpenAPI metadata', () => {
  let document: ReturnType<typeof SwaggerModule.createDocument> | undefined;
  let createDocumentSpy: jest.SpyInstance | undefined;
  let setupSpy: jest.SpyInstance | undefined;
  let closeApplication: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const f = fixture();
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(f.prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({ config, hasher: f.hasher, blocklist: { hasDigest: () => false } })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(f.cipher)
      .compile();
    const app: NestExpressApplication = moduleRef.createNestApplication();
    closeApplication = () => app.close();
    createDocumentSpy = jest.spyOn(SwaggerModule, 'createDocument');
    setupSpy = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    configureApplication(app);
    const captured = createDocumentSpy.mock.results[0];
    if (!captured || captured.type !== 'return' || !captured.value) {
      throw new Error('configureApplication did not generate a Swagger document');
    }
    document = captured.value;
    expect(createDocumentSpy).toHaveBeenCalledTimes(1);
    expect(setupSpy).toHaveBeenCalledWith('api/docs', app, document);
  });

  afterAll(async () => {
    setupSpy?.mockRestore();
    createDocumentSpy?.mockRestore();
    await closeApplication?.();
  });

  it('retains integrated H1/H2/H3 document identity and existing login response contract', () => {
    expect(document?.info).toMatchObject({
      title: 'ABAR Electricidad API — transversal candidate',
      description: 'H1 authentication, H2 catalog/stock, H3 demo quotes, and H4 guest orders/demo attempts for local verification. No external approval or production readiness is implied.',
      version: '0.8.0',
    });
    expect(document?.openapi).toBe('3.0.3');
    expect(document?.security).toBeUndefined();
    expect(document?.paths['/api/v1/auth/csrf']?.get?.security).toEqual([{}, { AdminSessionCookie: [] }]);
    const operation = document?.paths['/api/v1/auth/login']?.post;
    expect(operation?.operationId).toBe('loginAdmin');
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '429', '503']);
    expect(operation?.responses).toHaveProperty('200.headers.Cache-Control');
    expect(operation?.responses).toHaveProperty('200.headers.Set-Cookie');
    expect(operation?.responses).toHaveProperty('200.headers.X-CSRF-Token');
    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: { 'application/json': { schema: { type: 'object', additionalProperties: false } } },
    });
  });

  it('documents Origin as a required request header', () => {
    const parameters = document?.paths['/api/v1/auth/login']?.post?.parameters;
    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Origin', in: 'header', required: true,
        description: 'Exact configured allowlist, never derived from request/Forwarded. Missing/null/mismatch is 403 ORIGIN_INVALID, no Referer fallback. Defaults are http://127.0.0.1:4200 and http://localhost:4200. Same-origin proxy expected; no arbitrary credentialed CORS. Tests may inject an explicitly owned local origin.',
        schema: { type: 'string', minLength: 1 },
      }),
    ]));
  });

  it('documents X-CSRF-Token as a required request header', () => {
    const parameters = document?.paths['/api/v1/auth/login']?.post?.parameters;
    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'X-CSRF-Token', in: 'header', required: true,
        description: 'Independent stateful nonce bound to context/session, never logged.',
        schema: {
          type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$',
          description: 'Independent random 32 bytes, base64url without padding; never log or persist client-side.',
        },
      }),
    ]));
  });

  it('documents pre-auth and session cookies as separate security alternatives', () => {
    const security = document?.paths['/api/v1/auth/login']?.post?.security;
    expect(security).toEqual([{ AuthPreauthCookie: [] }, { AdminSessionCookie: [] }]);
  });

  it('registers the AuthPreauthCookie scheme as the pre-auth cookie apiKey', () => {
    expect(document?.components?.securitySchemes?.AuthPreauthCookie).toEqual({
      type: 'apiKey', in: 'cookie', name: 'abar_auth_context',
    });
  });

  it('registers the AdminSessionCookie scheme as the session cookie apiKey', () => {
    expect(document?.components?.securitySchemes?.AdminSessionCookie).toEqual({
      type: 'apiKey', in: 'cookie', name: 'abar_admin_session',
    });
  });
});

describe('POST /api/v1/auth/login operation contract', () => {
  it('publishes a POST 200 closed Swagger operation and wires the controller to the login service', async () => {
    const f = fixture({ verify: true });
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 9, 12));
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(f.prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({ config, hasher: f.hasher, blocklist: { hasDigest: () => false } })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(f.cipher)
      .compile();
    const app = moduleRef.createNestApplication();
    try {
      const swagger = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('login-test').setVersion('1').build());
      const operation: any = swagger.paths['/api/v1/auth/login']?.post;
      expect(operation.operationId).toBe('loginAdmin');
      expect(operation.requestBody.content['application/json'].schema).toEqual({
        type: 'object', additionalProperties: false, required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
        },
      });
      expect(Object.keys(operation.responses).sort()).toEqual(['200', '400', '401', '403', '429', '503']);
      expect(operation.responses['200'].headers).toHaveProperty('Cache-Control');
      expect(operation.responses['200'].headers).toHaveProperty('Set-Cookie');
      expect(operation.responses['200'].headers).toHaveProperty('X-CSRF-Token');
      expect(operation.responses['200'].content['application/json'].schema).toMatchObject({
        type: 'object', additionalProperties: false, required: ['admin', 'expiresAt'],
      });
      const controller = moduleRef.get(AuthController);
      expect(Reflect.getMetadata(PATH_METADATA, AuthController.prototype.login)).toBe('login');
      expect(Reflect.getMetadata(METHOD_METADATA, AuthController.prototype.login)).toBe(1);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.login)).toBe(200);
      const request = f.request;
      const { response, headers } = responseDouble();
      await controller.login({
        body: request.body,
        headers: { origin: request.origin, 'x-csrf-token': request.csrfToken, cookie: request.cookieHeader,
          'x-forwarded-for': '203.0.113.250', host: 'attacker.invalid' },
        socket: { remoteAddress: '198.51.100.77' },
      } as never, response as never);
      expect(response.statusCode).toBe(200);
      expect(headers['cache-control']).toBe('no-store');
      const cookies = headers['set-cookie'] as string[];
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toMatch(/^abar_admin_session=/);
      expect(cookies[1]).toMatch(/^abar_auth_context=;/);
      expect(headers['x-csrf-token']).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(response.body).toMatchObject({ admin: { id: '00000000-0000-4000-8000-000000000017' } });
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|nonceCiphertext|password=/i);
      expect(f.hasher.verify).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      clock.mockRestore();
    }
  });

  it('uses the direct socket address, not forwarded headers, for the controller IP limit', async () => {
    const f = fixture({ user: null, verify: false });
    const controller = new AuthController({} as never, f.service);
    const results: Array<{ metadata?: ReturnType<typeof metadata>; cacheControl?: unknown }> = [];
    for (let i = 0; i < 11; i++) {
      const { response, headers } = responseDouble();
      let error: unknown;
      try {
        await controller.login({
          body: { email: `socket${i}@example.test`, password: 'wrong' },
          headers: { origin: f.request.origin, 'x-csrf-token': f.request.csrfToken,
            cookie: f.request.cookieHeader, 'x-forwarded-for': `203.0.113.${i + 1}` },
          socket: { remoteAddress: '198.51.100.77' },
        } as never, response as never);
      } catch (caught) { error = caught; }
      results.push({ metadata: metadata(error), cacheControl: headers['cache-control'] });
    }
    expect(results.slice(0, 10).map((item) => item.metadata?.code)).toEqual(Array(10).fill('INVALID_CREDENTIALS'));
    expect(results.slice(0, 10).every((item) => item.cacheControl === 'no-store')).toBe(true);
    expect(results[10].metadata).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(Number.isSafeInteger(results[10].metadata?.retryAfter) && results[10].metadata!.retryAfter! > 0).toBe(true);
  });

  it('verifies producer PHC parameter order without treating valid metadata as unavailable', async () => {
    const emitted = PHC.replace('m=19456,t=2,p=1', 'm=19456,p=1,t=2');
    const f = fixture({ user: { passwordHash: emitted }, verify: false });
    const result = await capture(() => f.service.login(f.request));
    expect(metadata(result.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(f.hasher.verify).toHaveBeenCalledWith(emitted, expect.any(String));
  });

  it('validates exact shape, email normalization, password NFC and preserved whitespace before verification', async () => {
    const f = fixture({ verify: false });
    const result = await capture(() => f.service.login({
      ...f.request, body: { email: ' ADMIN@EXAMPLE.TEST ', password: '  e\u0301  ' },
    }));
    expect(metadata(result.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(f.hasher.verify).toHaveBeenCalledTimes(1);
    expect(f.hasher.verify).toHaveBeenCalledWith(PHC, '  é  ');
    expect(f.prisma.adminUser.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.test' },
      select: { id: true, name: true, email: true, passwordHash: true, active: true, mustChangePassword: true, version: true, updatedAt: true },
    });
  });

  it('rejects body accessors without invoking them', async () => {
    const f = fixture();
    let reads = 0;
    const body = { password: 'x' };
    Object.defineProperty(body, 'email', { enumerable: true, get: () => { reads++; return 'admin@example.test'; } });
    const outcome = await capture(() => f.service.login({ ...f.request, body }));
    expect(metadata(outcome.error)).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(reads).toBe(0);
    expect(f.calls.userLookup).toBe(0);
    expect(f.hasher.verify).not.toHaveBeenCalled();
  });

  it.each([['minimum one code point', 'x'], ['maximum 128 code points', 'x'.repeat(128)]])(
    'accepts login password at the %s boundary without trimming or truncation', async (_label, password) => {
      const f = fixture({ verify: false });
      const outcome = await capture(() => f.service.login({
        ...f.request, body: { email: 'admin@example.test', password },
      }));
      expect(metadata(outcome.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      expect(f.hasher.verify).toHaveBeenCalledWith(PHC, password);
    },
  );

  it.each([
    ['extra property', { email: 'admin@example.test', password: 'x', role: 'admin' }],
    ['missing password', { email: 'admin@example.test' }],
    ['invalid email', { email: 'not-an-email', password: 'x' }],
    ['non-string password', { email: 'admin@example.test', password: 42 }],
    ['empty password', { email: 'admin@example.test', password: '' }],
    ['password over 128 code points', { email: 'admin@example.test', password: 'x'.repeat(129) }],
  ])('rejects %s before lookup and hashing', async (_label, body) => {
    const f = fixture();
    const outcome = await capture(() => f.service.login({ ...f.request, body }));
    expect(metadata(outcome.error)).toEqual(expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }));
    expect(f.calls.userLookup).toBe(0);
    expect(f.hasher.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['missing Origin', { origin: undefined }, 'ORIGIN_INVALID'],
    ['wrong Origin', { origin: 'https://attacker.example' }, 'ORIGIN_INVALID'],
    ['missing CSRF', { csrfToken: undefined }, 'CSRF_INVALID'],
    ['wrong CSRF', { csrfToken: opaque(23) }, 'CSRF_INVALID'],
  ])('denies %s before lookup, verification, or writes', async (_label, changed, code) => {
    const f = fixture();
    const outcome = await capture(() => f.service.login({ ...f.request, ...changed }));
    expect(metadata(outcome.error)).toMatchObject({ status: code === 'ORIGIN_INVALID' ? 403 : 403, code });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.calls.userLookup).toBe(0);
    expect(f.calls.transaction).toBe(0);
    expect(f.calls.consume).toBe(0);
    expect(f.calls.createSession).toBe(0);
  });

  it.each([
    ['unknown', null, true], ['inactive', { active: false }, true], ['wrong password', {}, false],
  ])('uses one valid-cost verification and generic denial for %s accounts, even when dummy verification is true', async (_label, user, answer) => {
    const f = fixture({ user, verify: answer });
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(f.hasher.verify).toHaveBeenCalledTimes(1);
    const [phc] = f.hasher.verify.mock.calls[0];
    expect(validPhc(phc)).toBe(true);
    expect(phc).toBe(user !== null && (user as { active?: boolean }).active !== false ? PHC : DUMMY_PHC);
    expect(f.hasher.verify.mock.calls[0][1]).toBe('  correct horse  ');
    expect(f.calls.transaction).toBe(0);
  });

  it.each([
    ['unavailable hasher', { verify: new Error('synthetic hasher unavailable') }],
    ['database failure', { failUserLookup: true }],
    ['pre-auth storage failure', { failPreauthLookup: true }],
    ['unavailable encryption key', { serviceCipher: new CsrfNonceCipher('invalid') }],
    ['malformed active-account PHC', { user: { passwordHash: 'not-a-valid-phc' } }],
  ])('fails closed as 503 for %s rather than anonymous or credential denial', async (_label, settings) => {
    const f = fixture(settings);
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    if ('verify' in settings) expect(f.hasher.verify).toHaveBeenCalledTimes(1);
    if ('failPreauthLookup' in settings || 'serviceCipher' in settings) {
      expect(f.calls.userLookup).toBe(0);
      expect(f.hasher.verify).not.toHaveBeenCalled();
    }
    if ('user' in settings) {
      expect(f.calls.userLookup).toBe(1);
      expect(f.hasher.verify).not.toHaveBeenCalled();
    }
  });

  it('denies restricted request sessions but permits a target user requiring password change', async () => {
    const success = fixture({ user: { mustChangePassword: true }, verify: true });
    const successOutcome = await capture(() => success.service.login(success.request));
    expect(successOutcome.value).not.toBeNull();
    if (successOutcome.value == null) return;
    expect(successOutcome.value).toMatchObject({ session: { admin: { mustChangePassword: true } } });

    const restricted = fixture({ user: { mustChangePassword: true }, verify: true });
    const token = opaque(24);
    const id = hashId(token);
    const nonce = Buffer.alloc(32, 25);
    const envelope = restricted.cipher.encrypt('session', id, 1, nonce);
    restricted.sessions.set(id, {
      id, adminUserId: '00000000-0000-4000-8000-000000000017',
      nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 1,
      absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)), idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)),
      revokedAt: null, adminUser: {
        id: '00000000-0000-4000-8000-000000000017', active: true, mustChangePassword: true, version: 1,
        updatedAt: new Date(Date.UTC(2026, 9, 9, 11, 59, 59)),
      },
    });
    const outcome = await capture(() => restricted.service.login({
      ...restricted.request, cookieHeader: `abar_admin_session=${token}`, csrfToken: nonce.toString('base64url'),
    }));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    const badProof = await capture(() => restricted.service.login({
      ...restricted.request, cookieHeader: `abar_admin_session=${token}`, csrfToken: opaque(26),
    }));
    expect(metadata(badProof.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(restricted.hasher.verify).not.toHaveBeenCalled();
  });

  it('denies expired and replayed pre-auth contexts and rejects a corrupt encrypted nonce fail-closed', async () => {
    const expired = fixture();
    expired.preauth.get(expired.preId).expiresAt = new Date(Date.UTC(2026, 9, 9, 12));
    const expiredOutcome = await capture(() => expired.service.login(expired.request));
    expect(metadata(expiredOutcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });

    const replay = fixture(); replay.preauth.delete(replay.preId);
    const replayOutcome = await capture(() => replay.service.login(replay.request));
    expect(metadata(replayOutcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });

    const corrupt = fixture(); corrupt.preauth.get(corrupt.preId).nonceTag = Buffer.alloc(16, 9);
    const corruptOutcome = await capture(() => corrupt.service.login(corrupt.request));
    expect(metadata(corruptOutcome.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it.each([
    ['missing', 90], ['revoked', 91], ['absolute-expired', 92], ['idle-expired', 93], ['inactive', 94],
  ] as const)('recovers login through GET-issued pre-auth when retained session is %s', async (state, tokenByte) => {
    const f = fixture({ verify: true });
    const old = state === 'missing' ? undefined : addSessionContext(f, {
      tokenByte, nonceByte: tokenByte + 1,
      ...(state === 'revoked' ? { revokedAt: new Date(Date.UTC(2026, 9, 9, 11)) } : {}),
      ...(state === 'absolute-expired' ? { absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 12)) } : {}),
      ...(state === 'idle-expired' ? { idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 12)) } : {}),
      ...(state === 'inactive' ? { ownerId: '00000000-0000-4000-8000-000000000018', active: false } : {}),
    });
    const staleToken = old?.token ?? opaque(tokenByte);
    const oldNonceCiphertext = old && Buffer.from(old.row.nonceCiphertext);
    const oldNonceIv = old && Buffer.from(old.row.nonceIv);
    const oldNonceTag = old && Buffer.from(old.row.nonceTag);
    const oldNonceVersion = old?.row.nonceVersion;
    const oldLastActivityAt = old && new Date(old.row.lastActivityAt.getTime());
    const oldRevokedAt = old?.row.revokedAt && new Date(old.row.revokedAt.getTime());
    f.preauth.clear();
    const staleCookieHeader = `abar_admin_session=${staleToken}`;
    const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
    const metadataResult = await csrf.getMetadata({ cookieHeader: staleCookieHeader, clientIp: '127.0.0.1' });
    expect(metadataResult.metadata.headerName).toBe('X-CSRF-Token');
    expect(metadataResult.metadata.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(metadataResult.setCookie).toMatch(/^abar_auth_context=/);
    const issuedPreauthCookie = metadataResult.setCookie!.split(';')[0];
    const issuedPreauthToken = issuedPreauthCookie.slice('abar_auth_context='.length);
    const issuedPreauthId = hashId(issuedPreauthToken);
    expect(f.preauth.has(issuedPreauthId)).toBe(true);
    expect(f.calls.preauthCreate).toBe(1);
    const issuedRow = f.preauth.get(issuedPreauthId);
    const issuedNonce = f.cipher.decrypt('preauth', issuedPreauthId, issuedRow.nonceVersion, {
      ciphertext: issuedRow.nonceCiphertext, iv: issuedRow.nonceIv, tag: issuedRow.nonceTag,
    });
    expect(issuedNonce.toString('base64url')).toBe(metadataResult.metadata.csrfToken);
    issuedNonce.fill(0);
    const cookieHeader = `${staleCookieHeader}; ${issuedPreauthCookie}`;

    const login = await capture(() => f.service.login({ ...f.request, cookieHeader, csrfToken: metadataResult.metadata.csrfToken }));
    expect(login.value).toMatchObject({ session: { admin: { id: '00000000-0000-4000-8000-000000000017' } } });
    expect(login.error).toBeUndefined();
    expect(f.hasher.verify).toHaveBeenCalledTimes(1);
    expect(f.calls.consume).toBe(1);
    expect(f.calls.revokeSession).toBe(0);
    expect(f.calls.sessionActivity).toBe(0);
    expect(f.calls.createSession).toBe(1);
    expect(f.preauth.has(issuedPreauthId)).toBe(false);
    expect(f.preauth.size).toBe(0);
    const result = login.value as any;
    const newToken = result.sessionCookie.split(';')[0].split('=')[1];
    const newId = hashId(newToken);
    expect(newId).not.toBe(old?.id);
    expect(f.sessions.has(newId)).toBe(true);
    expect(f.sessions.size).toBe(old ? 2 : 1);
    if (old) {
      const persistedOld = f.sessions.get(old.id);
      expect(persistedOld?.revokedAt).toEqual(oldRevokedAt);
      expect(persistedOld?.nonceVersion).toBe(oldNonceVersion);
      expect(persistedOld?.lastActivityAt).toEqual(oldLastActivityAt);
      expect(persistedOld?.nonceCiphertext).toEqual(oldNonceCiphertext);
      expect(persistedOld?.nonceIv).toEqual(oldNonceIv);
      expect(persistedOld?.nonceTag).toEqual(oldNonceTag);
    }
  });

  it('gives a live session precedence over an accompanying valid pre-auth cookie', async () => {
    const f = fixture({ verify: true });
    const old = addSessionContext(f, { tokenByte: 95, nonceByte: 96 });
    const cookieHeader = `abar_admin_session=${old.token}; abar_auth_context=${f.preToken}`;
    const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
    const metadataResult = await csrf.getMetadata({ cookieHeader, clientIp: '127.0.0.1' });
    expect(metadataResult.metadata).toEqual({ csrfToken: old.nonce.toString('base64url'), headerName: 'X-CSRF-Token' });
    expect(metadataResult.setCookie).toBeUndefined();

    const login = await capture(() => f.service.login({ ...f.request, cookieHeader, csrfToken: metadataResult.metadata.csrfToken }));
    expect(login.value).toMatchObject({ session: { admin: { id: '00000000-0000-4000-8000-000000000017' } } });
    expect(login.error).toBeUndefined();
    expect(f.hasher.verify).toHaveBeenCalledTimes(1);
    expect(f.calls.revokeSession).toBe(1);
    expect(f.calls.consume).toBe(0);
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(f.sessions.size).toBe(2);
    expect(f.sessions.get(old.id)?.revokedAt).toEqual(new Date(Date.UTC(2026, 9, 9, 12)));
  });

  it('does not fall back to valid pre-auth proof when live-session proof is wrong', async () => {
    const f = fixture({ verify: true });
    const old = addSessionContext(f, { tokenByte: 97, nonceByte: 98 });
    const cookieHeader = `abar_admin_session=${old.token}; abar_auth_context=${f.preToken}`;
    const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
    const metadataResult = await csrf.getMetadata({ cookieHeader, clientIp: '127.0.0.1' });
    expect(metadataResult.metadata.csrfToken).not.toBe(f.preNonce.toString('base64url'));
    const lastActivityAt = new Date(old.row.lastActivityAt.getTime());

    const outcome = await capture(() => f.service.login({
      ...f.request, cookieHeader, csrfToken: f.preNonce.toString('base64url'),
    }));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.calls.revokeSession).toBe(0);
    expect(f.calls.consume).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(old.row.revokedAt).toBeNull();
    expect(old.row.lastActivityAt).toEqual(lastActivityAt);
    expect(f.sessions.size).toBe(1);
  });

  it('does not bypass a restricted live session with accompanying pre-auth state', async () => {
    const f = fixture({ verify: true });
    const old = addSessionContext(f, { tokenByte: 99, nonceByte: 100, mustChangePassword: true });
    const cookieHeader = `abar_admin_session=${old.token}; abar_auth_context=${f.preToken}`;
    const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
    const getOutcome = await capture(() => csrf.getMetadata({ cookieHeader, clientIp: '127.0.0.1' }));
    expect(getCsrfRouteErrorMetadata(getOutcome.error)).toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });

    const matching = await capture(() => f.service.login({
      ...f.request, cookieHeader, csrfToken: old.nonce.toString('base64url'),
    }));
    expect(metadata(matching.error)).toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(old.row.revokedAt).toBeNull();
    expect(f.calls.transaction).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(1);

    const wrongProof = await capture(() => f.service.login({
      ...f.request, cookieHeader, csrfToken: f.preNonce.toString('base64url'),
    }));
    expect(metadata(wrongProof.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(old.row.revokedAt).toBeNull();
    expect(f.calls.createSession).toBe(0);
  });

  it.each(['lookup failure', 'live cipher failure', 'malformed live row'] as const)(
    'fails closed rather than falling back to pre-auth on %s', async (failure) => {
      const f = fixture({ verify: true, failSessionLookup: failure === 'lookup failure' });
      const old = addSessionContext(f, {
        tokenByte: failure === 'lookup failure' ? 101 : failure === 'live cipher failure' ? 102 : 103,
        nonceByte: 104, corruptTag: failure === 'live cipher failure',
      });
      if (failure === 'malformed live row') old.row.absoluteExpiresAt = new Date(Number.NaN);
      const cookieHeader = `abar_admin_session=${old.token}; abar_auth_context=${f.preToken}`;
      const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
      const getOutcome = await capture(() => csrf.getMetadata({ cookieHeader, clientIp: '127.0.0.1' }));
      expect(getOutcome.error).toBeInstanceOf(ServiceUnavailableException);
      expect(f.calls.contextLookup).toBe(0);

      const login = await capture(() => f.service.login({
        ...f.request, cookieHeader, csrfToken: f.preNonce.toString('base64url'),
      }));
      expect(metadata(login.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
      expect(f.hasher.verify).not.toHaveBeenCalled();
      expect(f.preauth.has(f.preId)).toBe(true);
      expect(old.row.revokedAt).toBeNull();
      expect(f.calls.sessionActivity).toBe(0);
      expect(f.calls.transaction).toBe(0);
      expect(f.calls.consume).toBe(0);
      expect(f.calls.createSession).toBe(0);
      expect(f.sessions.size).toBe(1);
    },
  );

  it('rejects a wrong proof after GET recovery without consuming either context', async () => {
    const f = fixture({ verify: true });
    const old = addSessionContext(f, { tokenByte: 105, nonceByte: 106, revokedAt: new Date(Date.UTC(2026, 9, 9, 11)) });
    const cookieHeader = `abar_admin_session=${old.token}; abar_auth_context=${f.preToken}`;
    const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
    const metadataResult = await csrf.getMetadata({ cookieHeader, clientIp: '127.0.0.1' });
    expect(metadataResult.metadata.csrfToken).toBe(f.preNonce.toString('base64url'));
    const outcome = await capture(() => f.service.login({ ...f.request, cookieHeader, csrfToken: opaque(107) }));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(f.calls.transaction).toBe(0);
    expect(f.calls.consume).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(old.row.revokedAt).toEqual(new Date(Date.UTC(2026, 9, 9, 11)));
  });

  it('rejects duplicate context cookies before verifier or storage mutation', async () => {
    const f = fixture({ verify: true });
    const duplicateCookieHeader = `abar_auth_context=${f.preToken}; abar_auth_context=${f.preToken}`;
    const outcome = await capture(() => f.service.login({ ...f.request, cookieHeader: duplicateCookieHeader }));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.hasher.verify).not.toHaveBeenCalled();
    expect(f.calls.sessionLookup).toBe(0);
    expect(f.calls.contextLookup).toBe(0);
    expect(f.calls.transaction).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(f.sessions.size).toBe(0);
  });

  it.each(['revoked', 'expired', 'nonce-version-rotated'] as const)(
    'does not switch from a selected live session to pre-auth when it becomes %s during verification', async (change) => {
      let f!: ReturnType<typeof fixture>;
      let old!: ReturnType<typeof addSessionContext>;
      f = fixture({ verify: true, duringVerify: () => {
        if (change === 'revoked') old.row.revokedAt = new Date(Date.UTC(2026, 9, 9, 12, 1));
        else if (change === 'expired') f.setNow(Date.UTC(2026, 9, 9, 12, 31));
        else {
          const rotatedNonce = Buffer.alloc(32, 108);
          const rotated = f.cipher.encrypt('session', old.id, 5, rotatedNonce);
          old.row.nonceVersion = 5;
          old.row.nonceCiphertext = rotated.ciphertext;
          old.row.nonceIv = rotated.iv;
          old.row.nonceTag = rotated.tag;
        }
      } });
      old = addSessionContext(f, { tokenByte: 109, nonceByte: 110 });
      const cookieHeader = `abar_admin_session=${old.token}; abar_auth_context=${f.preToken}`;
      const csrf = new CsrfService(f.prisma, f.cipher, config, () => f.currentNow());
      const metadataResult = await csrf.getMetadata({ cookieHeader, clientIp: '127.0.0.1' });
      expect(metadataResult.metadata.csrfToken).toBe(old.nonce.toString('base64url'));
      const outcome = await capture(() => f.service.login({
        ...f.request, cookieHeader, csrfToken: metadataResult.metadata.csrfToken,
      }));
      expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
      expect(f.hasher.verify).toHaveBeenCalledTimes(1);
      expect(f.preauth.has(f.preId)).toBe(true);
      expect(f.calls.consume).toBe(0);
      expect(f.calls.revokeSession).toBe(0);
      expect(f.calls.createSession).toBe(0);
      expect(f.sessions.size).toBe(1);
      if (change === 'revoked') expect(old.row.revokedAt).toEqual(new Date(Date.UTC(2026, 9, 9, 12, 1)));
      if (change === 'expired') expect(f.currentNow()).toBe(Date.UTC(2026, 9, 9, 12, 31));
      if (change === 'nonce-version-rotated') expect(old.row.nonceVersion).toBe(5);
    });

  it('accepts a valid ordinary session as a CSRF context and rotates both session ID and nonce', async () => {
    const f = fixture({ verify: true });
    const oldToken = opaque(30);
    const oldId = hashId(oldToken);
    const oldNonce = Buffer.alloc(32, 31);
    const envelope = f.cipher.encrypt('session', oldId, 4, oldNonce);
    f.sessions.set(oldId, {
      id: oldId, adminUserId: '00000000-0000-4000-8000-000000000017',
      nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 4,
      absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)), idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 12, 30)),
      revokedAt: null, adminUser: { ...f.users.get('admin@example.test'), active: true, mustChangePassword: false },
    });
    const outcome = await capture(() => f.service.login({
      ...f.request, cookieHeader: `abar_admin_session=${oldToken}`, csrfToken: oldNonce.toString('base64url'),
    }));
    expect(outcome.value).not.toBeNull();
    if (outcome.value == null) return;
    const result = outcome.value as any;
    expect(result.sessionCookie).toMatch(/^abar_admin_session=[A-Za-z0-9_-]{43};/);
    const newToken = result.sessionCookie.split(';')[0].split('=')[1];
    expect(newToken).not.toBe(oldToken);
    expect(result.csrfToken).not.toBe(oldNonce.toString('base64url'));
    expect(f.sessions.has(oldId)).toBe(true);
    expect(f.sessions.get(oldId).revokedAt).toEqual(new Date(Date.UTC(2026, 9, 9, 12)));
    expect(f.sessions.has(hashId(newToken))).toBe(true);
  });

  it('rechecks an authenticated user inside the transaction and refuses a concurrent deactivation', async () => {
    const f = fixture({ verify: true });
    f.setBeforeTransaction(() => { f.users.get('admin@example.test').active = false; });
    const outcome = await capture(() => f.service.login(f.request));
    expect(outcome.error).toBeInstanceOf(LoginRouteException);
    expect([401, 403]).toContain(metadata(outcome.error)?.status);
    expect(f.events).toContain('user.recheck');
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it('maps ordinary-session storage failure to 503 without account lookup or anonymous fallback', async () => {
    const f = fixture({ failSessionLookup: true });
    const token = opaque(37);
    const id = hashId(token);
    const nonce = Buffer.alloc(32, 38);
    const envelope = f.cipher.encrypt('session', id, 1, nonce);
    f.sessions.set(id, {
      id, adminUserId: '00000000-0000-4000-8000-000000000017',
      nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 1,
      absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)), idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 12, 30)),
      revokedAt: null, adminUser: { ...f.users.get('admin@example.test') },
    });
    const outcome = await capture(() => f.service.login({
      ...f.request, cookieHeader: `abar_admin_session=${token}`, csrfToken: nonce.toString('base64url'),
    }));
    expect(metadata(outcome.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(f.calls.userLookup).toBe(0);
    expect(f.hasher.verify).not.toHaveBeenCalled();
  });

  it.each(['missing', 'revoked', 'absolute-expired', 'idle-expired', 'inactive'] as const)(
    'rejects ordinary session context that is %s without account lookup or fallback', async (state) => {
      const f = fixture();
      const token = opaque(39);
      const id = hashId(token);
      const nonce = Buffer.alloc(32, 40);
      const envelope = f.cipher.encrypt('session', id, 1, nonce);
      if (state !== 'missing') {
        f.sessions.set(id, {
          id, adminUserId: '00000000-0000-4000-8000-000000000017',
          nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 1,
          absoluteExpiresAt: new Date(state === 'absolute-expired' ? Date.UTC(2026, 9, 9, 12) : Date.UTC(2026, 9, 9, 13)),
          idleExpiresAt: new Date(state === 'idle-expired' ? Date.UTC(2026, 9, 9, 12) : Date.UTC(2026, 9, 9, 12, 30)),
          revokedAt: state === 'revoked' ? new Date(Date.UTC(2026, 9, 9, 11)) : null,
          adminUser: { ...f.users.get('admin@example.test'), active: state !== 'inactive' },
        });
      }
      const outcome = await capture(() => f.service.login({
        ...f.request, cookieHeader: `abar_admin_session=${token}`, csrfToken: nonce.toString('base64url'),
      }));
      expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
      expect(f.calls.userLookup).toBe(0);
      expect(f.hasher.verify).not.toHaveBeenCalled();
      expect(f.calls.transaction).toBe(0);
    },
  );

  it('serializes concurrent pre-auth replay so only one transaction consumes the context', async () => {
    const f = fixture({ verify: true });
    const outcomes = await Promise.all([
      capture(() => f.service.login(f.request)), capture(() => f.service.login(f.request)),
    ]);
    expect(outcomes.filter((outcome) => outcome.value !== undefined)).toHaveLength(1);
    const denied = outcomes.find((outcome) => outcome.error !== undefined);
    expect(metadata(denied?.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.calls.consume).toBe(1);
    expect(f.sessions.size).toBe(1);
  });

  it('allows pre-auth consumption once and rejects replay of the successful request context', async () => {
    const f = fixture({ verify: true });
    const first = await capture(() => f.service.login(f.request));
    expect(first.error).toBeUndefined();
    expect(first.value).not.toBeNull();
    if (first.value == null) return;
    const replay = await capture(() => f.service.login(f.request));
    expect(metadata(replay.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.calls.consume).toBe(1);
    expect(f.sessions.size).toBe(1);
  });

  it('rejects pre-auth expiry reached while password verification is awaited without changing stored expiry', async () => {
    let f!: ReturnType<typeof fixture>;
    f = fixture({ verify: true, duringVerify: () => f.setNow(Date.UTC(2026, 9, 9, 12, 16)) });
    const storedExpiry = f.preauth.get(f.preId).expiresAt.getTime();
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.preauth.get(f.preId).expiresAt.getTime()).toBe(storedExpiry);
    expect(storedExpiry).toBe(Date.UTC(2026, 9, 9, 12, 15));
    expect(f.calls.transaction).toBe(0);
    expect(f.events).not.toContain('context.consume.attempt');
    expect(f.calls.consume).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it('rechecks pre-auth expiry after transaction scheduling advances the clock again', async () => {
    let f!: ReturnType<typeof fixture>;
    f = fixture({ verify: true, duringVerify: () => f.setNow(Date.UTC(2026, 9, 9, 12, 10)) });
    f.setBeforeTransaction(() => f.setNow(Date.UTC(2026, 9, 9, 12, 16)));
    const storedExpiry = f.preauth.get(f.preId).expiresAt.getTime();
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.preauth.get(f.preId).expiresAt.getTime()).toBe(storedExpiry);
    expect(f.events).toContain('context.consume.attempt');
    expect(f.calls.consume).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it('rejects ordinary-session expiry reached while password verification is awaited without revocation or issuance', async () => {
    let f!: ReturnType<typeof fixture>;
    f = fixture({ verify: true, duringVerify: () => f.setNow(Date.UTC(2026, 9, 9, 13, 1)) });
    const oldToken = opaque(82);
    const oldId = hashId(oldToken);
    const oldNonce = Buffer.alloc(32, 83);
    const envelope = f.cipher.encrypt('session', oldId, 4, oldNonce);
    const oldRow = {
      id: oldId, adminUserId: '00000000-0000-4000-8000-000000000017',
      nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 4,
      absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)), idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 12, 30)),
      revokedAt: null, adminUser: { ...f.users.get('admin@example.test') },
    };
    f.sessions.set(oldId, oldRow);
    const outcome = await capture(() => f.service.login({
      ...f.request, cookieHeader: `abar_admin_session=${oldToken}`, csrfToken: oldNonce.toString('base64url'),
    }));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.calls.transaction).toBe(0);
    expect(f.events).not.toContain('session.revoke.attempt');
    expect(oldRow.revokedAt).toBeNull();
    expect(f.calls.revokeSession).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(1);
  });

  it('rechecks ordinary-session idle expiry after transaction scheduling advances the clock', async () => {
    let f!: ReturnType<typeof fixture>;
    f = fixture({ verify: true, duringVerify: () => f.setNow(Date.UTC(2026, 9, 9, 12, 10)) });
    f.setBeforeTransaction(() => f.setNow(Date.UTC(2026, 9, 9, 12, 31)));
    const oldToken = opaque(85);
    const oldId = hashId(oldToken);
    const oldNonce = Buffer.alloc(32, 86);
    const envelope = f.cipher.encrypt('session', oldId, 4, oldNonce);
    const oldRow = {
      id: oldId, adminUserId: '00000000-0000-4000-8000-000000000017',
      nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 4,
      absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)), idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 12, 30)),
      revokedAt: null, adminUser: { ...f.users.get('admin@example.test') },
    };
    f.sessions.set(oldId, oldRow);
    const outcome = await capture(() => f.service.login({
      ...f.request, cookieHeader: `abar_admin_session=${oldToken}`, csrfToken: oldNonce.toString('base64url'),
    }));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.events).toContain('session.revoke.attempt');
    expect(oldRow.revokedAt).toBeNull();
    expect(f.calls.revokeSession).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(1);
  });

  it('fails closed as 503 when the injected clock becomes invalid during verification', async () => {
    let f!: ReturnType<typeof fixture>;
    f = fixture({ verify: true, duringVerify: () => f.setNow(Number.NaN) });
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(f.calls.transaction).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it('rejects pre-auth nonce rotation during verification without consuming or issuing a session', async () => {    let f!: ReturnType<typeof fixture>;
    f = fixture({ verify: true, duringVerify: () => {
      const row = f.preauth.get(f.preId);
      const rotatedNonce = Buffer.alloc(32, 84);
      const rotated = f.cipher.encrypt('preauth', f.preId, 2, rotatedNonce);
      row.nonceVersion = 2;
      row.nonceCiphertext = rotated.ciphertext;
      row.nonceIv = rotated.iv;
      row.nonceTag = rotated.tag;
    } });
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.preauth.get(f.preId).nonceVersion).toBe(2);
    expect(f.events).toContain('context.consume.attempt');
    expect(f.calls.consume).toBe(0);
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it('rejects context expiration between validation and transactional consumption', async () => {
    const f = fixture({ verify: true });
    f.setBeforeTransaction(() => { f.preauth.get(f.preId).expiresAt = new Date(Date.UTC(2026, 9, 9, 12)); });
    const outcome = await capture(() => f.service.login(f.request));
    expect(metadata(outcome.error)).toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(f.events).toContain('context.consume.attempt');
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it.each(['inactive', 'version'] as const)('rejects a concurrent user %s change before issuing a session', async (change) => {
    const f = fixture({ verify: true });
    f.setBeforeTransaction(() => {
      const target = f.users.get('admin@example.test');
      if (change === 'inactive') target.active = false;
      else target.version++;
    });
    const outcome = await capture(() => f.service.login(f.request));
    expect(outcome.error).toBeInstanceOf(LoginRouteException);
    expect([401, 403]).toContain(metadata(outcome.error)?.status);
    expect(f.events).toContain('user.recheck');
    expect(f.calls.createSession).toBe(0);
    expect(f.sessions.size).toBe(0);
  });

  it('enforces the per-IP 10/60-second window with eligible wrong-credential attempts and bounded Retry-After', async () => {
    const f = fixture({ user: null, verify: false });
    const codes: unknown[] = [];
    for (let i = 0; i < 11; i++) {
      const outcome = await capture(() => f.service.login({
        ...f.request, body: { email: `user${i}@example.test`, password: 'wrong' }, clientIp: '198.51.100.10',
      }));
      codes.push(metadata(outcome.error)?.code);
      if (i === 10) {
        const retry = metadata(outcome.error)?.retryAfter;
        expect(Number.isSafeInteger(retry) && retry! > 0 && retry! <= 60).toBe(true);
      }
    }
    expect(codes).toEqual([...Array(10).fill('INVALID_CREDENTIALS'), 'RATE_LIMITED']);
    expect(f.hasher.verify).toHaveBeenCalledTimes(10);
  });

  it('limits the normalized account independently for 15 minutes and releases it at the exact expiry boundary', async () => {
    const f = fixture({ user: null, verify: false });
    const codes: unknown[] = [];
    for (let i = 0; i < 11; i++) {
      const outcome = await capture(() => f.service.login({
        ...f.request, body: { email: i % 2 ? ' ADMIN@example.test ' : 'admin@example.test', password: 'wrong' },
        clientIp: `198.51.100.${i + 1}`,
      }));
      codes.push(metadata(outcome.error)?.code);
    }
    expect(codes).toEqual([...Array(10).fill('INVALID_CREDENTIALS'), 'RATE_LIMITED']);
    expect(f.hasher.verify).toHaveBeenCalledTimes(10);
    const boundaryTime = Date.UTC(2026, 9, 9, 12) + 900_000;
    f.setNow(boundaryTime);
    const boundaryToken = opaque(70);
    const boundaryId = hashId(boundaryToken);
    const boundaryNonce = Buffer.alloc(32, 71);
    const boundaryEnvelope = f.cipher.encrypt('preauth', boundaryId, 1, boundaryNonce);
    f.preauth.set(boundaryId, {
      id: boundaryId, nonceCiphertext: boundaryEnvelope.ciphertext, nonceIv: boundaryEnvelope.iv, nonceTag: boundaryEnvelope.tag,
      nonceVersion: 1, expiresAt: new Date(boundaryTime + 900_000),
    });
    const boundaryRequest = {
      ...f.request, cookieHeader: `abar_auth_context=${boundaryToken}`, csrfToken: boundaryNonce.toString('base64url'),
    };
    const boundary = await capture(() => f.service.login({ ...boundaryRequest, clientIp: '198.51.100.90' }));
    expect(metadata(boundary.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    for (let i = 0; i < 9; i++) await capture(() => f.service.login({
      ...boundaryRequest, clientIp: `198.51.101.${i + 1}`,
    }));
    f.setNow(boundaryTime - 1);
    const rolledBack = await capture(() => f.service.login({ ...boundaryRequest, clientIp: '198.51.101.90' }));
    expect(metadata(rolledBack.error)).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    const retry = metadata(rolledBack.error)?.retryAfter;
    expect(Number.isSafeInteger(retry) && retry! > 0 && retry! <= 900).toBe(true);
  });

  it('keeps live exhausted IP/account counters intact when both bounded limiter maps reach capacity', async () => {
    const f = fixture({ user: null, verify: false });
    for (let i = 0; i < 10; i++) {
      const outcome = await capture(() => f.service.login({
        ...f.request, body: { email: 'capacity0@example.test', password: 'wrong' }, clientIp: `198.51.100.${i + 1}`,
      }));
      expect(metadata(outcome.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    }
    for (let i = 1; i < 10; i++) {
      const outcome = await capture(() => f.service.login({
        ...f.request, body: { email: `capacity${i}@example.test`, password: 'wrong' }, clientIp: '198.51.100.1',
      }));
      expect(metadata(outcome.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    }
    for (let i = 0; i < 9_990; i++) {
      const outcome = await capture(() => f.service.login({
        ...f.request, body: { email: `fill${i}@example.test`, password: 'wrong' }, clientIp: `2001:db8::${i + 1}`,
      }));
      expect(metadata(outcome.error)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    }

    const fullAccount = await capture(() => f.service.login({
      ...f.request, body: { email: 'capacity0@example.test', password: 'wrong' }, clientIp: '198.51.100.2',
    }));
    expect(metadata(fullAccount.error)).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 900 });
    const fullIp = await capture(() => f.service.login({
      ...f.request, body: { email: 'capacity1@example.test', password: 'wrong' }, clientIp: '198.51.100.1',
    }));
    expect(metadata(fullIp.error)).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 60 });
    const overflow = await capture(() => f.service.login({
      ...f.request, body: { email: 'new-overflow@example.test', password: 'wrong' }, clientIp: '203.0.113.99',
    }));
    expect(metadata(overflow.error)).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 60 });
  }, 60_000);

  it('atomically consumes pre-auth and rotates to independent canonical session ID and nonce with sanitized response', async () => {
    const f = fixture({ user: { mustChangePassword: true }, verify: true });
    const outcome = await capture(() => f.service.login(f.request));
    expect(outcome.value).not.toBeNull();
    if (outcome.value == null) return;
    const result = outcome.value as any;
    expect(Object.keys(result).sort()).toEqual(['clearPreAuthCookie', 'csrfToken', 'session', 'sessionCookie'].sort());
    expect(result.session).toEqual({
      admin: { id: '00000000-0000-4000-8000-000000000017', name: 'Operator', email: 'admin@example.test', mustChangePassword: true },
      expiresAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
    });
    expect(result.sessionCookie).toMatch(/^abar_admin_session=[A-Za-z0-9_-]{43}; Path=\/api\/v1; HttpOnly; SameSite=Lax;/);
    expect(result.clearPreAuthCookie).toMatch(/^abar_auth_context=; Path=\/api\/v1\/auth; HttpOnly; SameSite=Lax;/);
    expect(result.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const sessionToken = result.sessionCookie.split(';')[0].split('=')[1];
    expect(sessionToken).not.toBe(f.preToken);
    expect(Buffer.from(sessionToken, 'base64url').toString('base64url')).toBe(sessionToken);
    const sessionId = hashId(sessionToken);
    const stored = f.sessions.get(sessionId);
    expect(stored).toBeDefined();
    expect(stored.id).toMatch(/^[a-f0-9]{64}$/);
    expect(f.cipher.decrypt('session', sessionId, stored.nonceVersion, {
      ciphertext: stored.nonceCiphertext, iv: stored.nonceIv, tag: stored.nonceTag,
    }).toString('base64url')).toBe(result.csrfToken);
    expect(f.preauth.has(f.preId)).toBe(false);
    expect(JSON.stringify([...f.sessions.values()])).not.toContain(result.csrfToken);
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|nonceCiphertext|synthetic|correct horse/i);
  });

  it('rolls back ordinary-session revocation when creating the replacement session fails', async () => {
    const f = fixture({ verify: true, failSessionCreate: true });
    const oldToken = opaque(80);
    const oldId = hashId(oldToken);
    const oldNonce = Buffer.alloc(32, 81);
    const envelope = f.cipher.encrypt('session', oldId, 4, oldNonce);
    const original = {
      id: oldId, adminUserId: '00000000-0000-4000-8000-000000000017',
      nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 4,
      absoluteExpiresAt: new Date(Date.UTC(2026, 9, 9, 13)), idleExpiresAt: new Date(Date.UTC(2026, 9, 9, 12, 30)),
      revokedAt: null, adminUser: { ...f.users.get('admin@example.test') },
    };
    f.sessions.set(oldId, original);
    const outcome = await capture(() => f.service.login({
      ...f.request, cookieHeader: `abar_admin_session=${oldToken}`, csrfToken: oldNonce.toString('base64url'),
    }));
    expect(metadata(outcome.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(f.events).toContain('transaction.rollback');
    expect(original.revokedAt).toBeNull();
    expect(f.sessions.get(oldId)?.revokedAt).toBeNull();
    expect(f.sessions.size).toBe(1);
    expect(f.calls.createSession).toBe(1);
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(outcome.value).toBeUndefined();
  });

  it('proves session-write failure rolls back staged pre-auth consumption and emits no success credentials', async () => {
    const f = fixture({ verify: true, failSessionCreate: true });
    const outcome = await capture(() => f.service.login(f.request));
    expect(f.calls.transaction).toBe(1);
    expect(f.events).toContain('context.consume.attempt');
    expect(f.events).toContain('session.create.attempt');
    expect(f.events).toContain('transaction.rollback');
    expect(f.events).not.toContain('transaction.commit');
    expect(f.preauth.has(f.preId)).toBe(true);
    expect(f.sessions.size).toBe(0);
    expect(metadata(outcome.error)).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(outcome.value).toBeUndefined();
  });
});
