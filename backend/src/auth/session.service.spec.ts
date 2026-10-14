import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AuthController } from './auth.controller';
import { AUTH_RUNTIME } from './auth-runtime.module';
import { AuthModule } from './auth.module';
import { CSRF_NONCE_CIPHER, CsrfService } from './csrf.service';
import { LoginService } from './login.service';
import { configureApplication } from '../configure-application';
import { validateAuthConfig } from './auth.config';
import { CsrfNonceCipher } from './csrf-nonce.cipher';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';

describe('GET /api/v1/auth/me contract (production-generated Swagger)', () => {
  it('documents only the session cookie and the no-store DTO plus existing CSRF header', async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: CsrfService, useValue: {} },
        { provide: LoginService, useValue: {} },
        { provide: SessionService, useValue: { restoreSession: jest.fn() } },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>();
    const setup = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);

    try {
      configureApplication(app);
      const document = setup.mock.calls[0][2] as OpenAPIObject;
      const operation = document.paths['/api/v1/auth/me']?.get;

      expect(operation).toMatchObject({
        operationId: 'getAdminSession',
        security: [{ AdminSessionCookie: [] }],
        parameters: [],
        responses: {
          '200': {
            headers: {
              'Cache-Control': { schema: { enum: ['no-store'] } },
              'X-CSRF-Token': expect.any(Object),
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object', additionalProperties: false, required: ['admin', 'expiresAt'],
                  properties: {
                    admin: {
                      type: 'object', additionalProperties: false,
                      required: ['id', 'name', 'email', 'mustChangePassword'],
                      properties: {
                        id: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 1, maxLength: 100 },
                        email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 }, mustChangePassword: { type: 'boolean' },
                      },
                    },
                    expiresAt: { type: 'string', format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$' },
                  },
                },
              },
            },
          },
          '401': expect.any(Object),
          '503': expect.any(Object),
        },
        'x-abar-errors': {
          '401': ['SESSION_EXPIRED'],
          '503': ['SERVICE_UNAVAILABLE'],
        },
      });
      expect(operation).not.toHaveProperty('requestBody');
      expect(operation).not.toHaveProperty('parameters', expect.arrayContaining([
        expect.objectContaining({ name: 'Origin' }),
        expect.objectContaining({ name: 'X-CSRF-Token' }),
      ]));
      expect(operation?.security).not.toContainEqual(expect.objectContaining({ AuthPreauthCookie: expect.anything() }));
    } finally {
      jest.restoreAllMocks();
      await app.close();
      await module.close();
    }
  });
});

const TEST_KEY = Buffer.alloc(32, 6).toString('base64url'); // synthetic test-only key
const NOW = Date.UTC(2026, 9, 9, 12);
const testConfig = validateAuthConfig({ NODE_ENV: 'test' });
function copyState<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map(copyState) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyState(item)])) as T;
  }
  return value;
}

function sessionFixture(options: {
  tokenByte?: number;
  nonceByte?: number;
  mustChangePassword?: boolean;
  active?: boolean;
  revokedAt?: Date | null;
  absoluteExpiresAt?: Date;
  idleExpiresAt?: Date;
  missingRow?: boolean;
  failLookup?: boolean;
  unavailableCipher?: boolean;
  corruptTag?: boolean;
  clock?: number;
  onLookup?: (stored: any, count: number, setNow: (value: number) => void) => void;
  afterDecrypt?: (stored: any, setNow: (value: number) => void) => void;
} = {}) {
  const token = Buffer.alloc(32, options.tokenByte ?? 41).toString('base64url');
  const id = createHash('sha256').update(token).digest('hex');
  const nonce = Buffer.alloc(32, options.nonceByte ?? 42);
  const realCipher = new CsrfNonceCipher(TEST_KEY);
  const envelope = realCipher.encrypt('session', id, 1, nonce);
  const adminUser = {
    id: '00000000-0000-4000-8000-000000000017', name: 'Operator', email: 'admin@example.test',
    active: options.active ?? true, mustChangePassword: options.mustChangePassword ?? false,
  };
  const row = {
    id, adminUserId: adminUser.id,
    nonceCiphertext: Buffer.from(envelope.ciphertext), nonceIv: Buffer.from(envelope.iv),
    nonceTag: options.corruptTag ? Buffer.alloc(16, 9) : Buffer.from(envelope.tag), nonceVersion: 1,
    createdAt: new Date(NOW - 60_000), lastActivityAt: new Date(NOW - 60_000),
    absoluteExpiresAt: options.absoluteExpiresAt ?? new Date(NOW + 60 * 60_000),
    idleExpiresAt: options.idleExpiresAt ?? new Date(NOW + 30 * 60_000),
    revokedAt: options.revokedAt ?? null, adminUser,
  };
  const stored = options.missingRow ? null : row;
  let currentNow = options.clock ?? NOW;
  let lookupCount = 0;
  let decryptHookUsed = false;
  const setNow = (value: number) => { currentNow = value; };
  const findUnique = jest.fn(async ({ where }: { where: { id: string } }) => {
    lookupCount++;
    if (options.failLookup) throw new Error('synthetic storage failure');
    options.onLookup?.(stored, lookupCount, setNow);
    return where.id === id && stored ? copyState(stored) : null;
  });
  const mutators = {
    create: jest.fn(), createMany: jest.fn(), createManyAndReturn: jest.fn(),
    update: jest.fn(), updateMany: jest.fn(), updateManyAndReturn: jest.fn(), upsert: jest.fn(),
    delete: jest.fn(), deleteMany: jest.fn(),
  };
  const prisma = { authSession: { findUnique, ...mutators } };
  const cipher = {
    available: !options.unavailableCipher,
    decrypt: jest.fn((kind: 'session', hashedId: string, version: number, value: typeof envelope) => {
      const plaintext = realCipher.decrypt(kind, hashedId, version, value);
      if (!decryptHookUsed) {
        decryptHookUsed = true;
        options.afterDecrypt?.(stored, setNow);
      }
      return plaintext;
    }),
  };
  const service = new SessionService(
    prisma as unknown as PrismaService,
    cipher as unknown as CsrfNonceCipher,
    testConfig,
    () => currentNow,
  );
  const request = { cookieHeader: `abar_admin_session=${token}` };
  return { service, request, row, stored, prisma, mutators, findUnique, cipher, nonce, nonceToken: nonce.toString('base64url'), adminUser, setNow };
}

function safeErrorSummary(error: unknown) {
  if (!(error instanceof HttpException)) return { isHttpException: false, status: undefined, code: undefined };
  const response = error.getResponse();
  const code = typeof response === 'string' ? response
    : response && typeof response === 'object' && 'code' in response ? response.code : undefined;
  return { isHttpException: true, status: error.getStatus(), code };
}

async function resultOf(operation: () => Promise<unknown>) {
  try { return { value: await operation(), error: undefined }; }
  catch (error) { return { value: undefined, error }; }
}

describe('SessionService behavioral contract (neutral RED scaffold)', () => {
  it.each([['ordinary', false], ['restricted', true]] as const)(
    'restores the sanitized DTO and existing bound nonce for %s sessions', async (_label, mustChangePassword) => {
      const f = sessionFixture({ mustChangePassword });
      const outcome = await resultOf(() => f.service.restoreSession(f.request));
      const value = outcome.value as { session?: unknown; csrfToken?: unknown } | null;
      const observed = {
        session: value?.session,
        existingNonceRecovered: value?.csrfToken === f.nonceToken,
        nonceInDto: typeof value?.session === 'object' && value.session !== null &&
          JSON.stringify(value.session).includes(f.nonceToken),
        keys: value ? Object.keys(value).sort() : [],
      };
      expect(observed).toEqual({
        session: {
          admin: { id: f.adminUser.id, name: f.adminUser.name, email: f.adminUser.email, mustChangePassword },
          expiresAt: f.row.absoluteExpiresAt.toISOString(),
        },
        existingNonceRecovered: true,
        nonceInDto: false,
        keys: ['csrfToken', 'session'],
      });
    },
  );

  it.each([
    ['no cookie', () => sessionFixture(), (f: ReturnType<typeof sessionFixture>) => ({ cookieHeader: undefined })],
    ['unknown session', () => sessionFixture({ missingRow: true }), (f: ReturnType<typeof sessionFixture>) => f.request],
    ['revoked session', () => sessionFixture({ revokedAt: new Date(NOW - 1) }), (f: ReturnType<typeof sessionFixture>) => f.request],
    ['absolute expiry boundary', () => sessionFixture({ absoluteExpiresAt: new Date(NOW) }), (f: ReturnType<typeof sessionFixture>) => f.request],
    ['idle expiry boundary', () => sessionFixture({ idleExpiresAt: new Date(NOW) }), (f: ReturnType<typeof sessionFixture>) => f.request],
    ['inactive owner', () => sessionFixture({ active: false }), (f: ReturnType<typeof sessionFixture>) => f.request],
  ] as const)('rejects %s with SESSION_EXPIRED', async (_label, makeFixture, makeRequest) => {
    const f = makeFixture();
    const outcome = await resultOf(() => f.service.restoreSession(makeRequest(f)));
    expect(safeErrorSummary(outcome.error)).toEqual({ isHttpException: true, status: 401, code: 'SESSION_EXPIRED' });
  });

  it.each([
    ['storage failure', () => sessionFixture({ failLookup: true })],
    ['unavailable cipher', () => sessionFixture({ unavailableCipher: true })],
    ['corrupt encrypted nonce', () => sessionFixture({ corruptTag: true })],
  ] as const)('fails closed with SERVICE_UNAVAILABLE on %s', async (_label, makeFixture) => {
    const f = makeFixture();
    const outcome = await resultOf(() => f.service.restoreSession(f.request));
    expect(safeErrorSummary(outcome.error)).toEqual({ isHttpException: true, status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it.each([['ordinary', false], ['restricted', true]] as const)(
    'does not mutate stored rows, dates, buffers, or nonce for %s retrieval', async (_label, mustChangePassword) => {
      const f = sessionFixture({ mustChangePassword });
      const before = copyState(f.row);
      await f.service.restoreSession(f.request);
      expect(JSON.stringify(f.row) === JSON.stringify(before)).toBe(true);
      for (const mutation of Object.values(f.mutators)) expect(mutation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed token', 'abar_admin_session=not-canonical'],
    ['duplicate token', `abar_admin_session=${Buffer.alloc(32, 41).toString('base64url')}; abar_admin_session=${Buffer.alloc(32, 41).toString('base64url')}`],
  ])('treats %s as an expired session without exposing cookie data', async (_label, cookieHeader) => {
    const f = sessionFixture();
    const outcome = await resultOf(() => f.service.restoreSession({ cookieHeader }));
    expect(safeErrorSummary(outcome.error)).toEqual({ isHttpException: true, status: 401, code: 'SESSION_EXPIRED' });
  });

  it.each([
    ['CRLF immediately before the valid token', (token: string) => `\r\n${token}`],
    ['CRLF immediately after the valid token', (token: string) => `${token}\r\n`],
    ['CRLF inside the token value', (token: string) => `${token.slice(0, 21)}\r\n${token.slice(21)}`],
    ['NUL inside the token value', (token: string) => `${token.slice(0, 21)}\0${token.slice(21)}`],
    ['DEL inside the token value', (token: string) => `${token.slice(0, 21)}\x7f${token.slice(21)}`],
  ] as const)('rejects %s before storage or decryption', async (_label, corruptToken) => {
    const f = sessionFixture();
    const token = f.request.cookieHeader!.slice('abar_admin_session='.length);
    const cookieHeader = `abar_admin_session=${corruptToken(token)}`;
    const outcome = await resultOf(() => f.service.restoreSession({ cookieHeader }));
    const error = safeErrorSummary(outcome.error);
    expect({
      status: error.status ?? (outcome.value ? 200 : undefined),
      code: error.code,
      lookups: f.findUnique.mock.calls.length,
      decryptions: f.cipher.decrypt.mock.calls.length,
    }).toEqual({ status: 401, code: 'SESSION_EXPIRED', lookups: 0, decryptions: 0 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, 8.64e15 + 1])(
    'fails safely for invalid clock value %s', async (clock) => {
      const f = sessionFixture({ clock });
      const outcome = await resultOf(() => f.service.restoreSession(f.request));
      expect(safeErrorSummary(outcome.error)).toEqual({ isHttpException: true, status: 503, code: 'SERVICE_UNAVAILABLE' });
    },
  );

  it('checks expiry against the current clock after delayed storage lookup', async () => {
    const f = sessionFixture({ onLookup: (_row, count, setNow) => { if (count === 1) setNow(NOW + 60 * 60_000); } });
    const outcome = await resultOf(() => f.service.restoreSession(f.request));
    expect(safeErrorSummary(outcome.error)).toEqual({ isHttpException: true, status: 401, code: 'SESSION_EXPIRED' });
  });

  it.each([
    ['owner deactivation', (row: any) => { row.adminUser.active = false; }, 401, 'SESSION_EXPIRED'],
    ['session revocation', (row: any) => { row.revokedAt = new Date(NOW); }, 401, 'SESSION_EXPIRED'],
    ['nonce-version rotation', (row: any) => {
      const rotated = new CsrfNonceCipher(TEST_KEY).encrypt('session', row.id, row.nonceVersion + 1, Buffer.alloc(32, 91));
      row.nonceVersion++;
      row.nonceCiphertext = rotated.ciphertext; row.nonceIv = rotated.iv; row.nonceTag = rotated.tag;
    }, 503, 'SERVICE_UNAVAILABLE'],
  ] as const)('fails closed when %s races with nonce recovery', async (_label, mutate, status, code) => {
    const f = sessionFixture({ afterDecrypt: (row) => mutate(row) });
    const outcome = await resultOf(() => f.service.restoreSession(f.request));
    expect(safeErrorSummary(outcome.error)).toEqual({ isHttpException: true, status, code });
  });

  it('returns the DTO and header nonce without cookie rotation or request CSRF/Origin requirements', async () => {
    const f = sessionFixture();
    const session = {
      admin: { id: f.adminUser.id, name: f.adminUser.name, email: f.adminUser.email, mustChangePassword: false },
      expiresAt: f.row.absoluteExpiresAt.toISOString(),
    };
    const sessionService = { restoreSession: jest.fn().mockResolvedValue({ session, csrfToken: f.nonceToken }) };
    const controller = new AuthController({} as CsrfService, {} as LoginService, sessionService as never);
    const headers: Record<string, unknown> = {};
    const response = {
      statusCode: 0, body: undefined as unknown,
      setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = value; return this; },
      status(value: number) { this.statusCode = value; return this; },
      json(value: unknown) { this.body = value; return this; },
    };
    const cookieHeader = f.request.cookieHeader;
    await controller.getMe({ headers: { cookie: cookieHeader } } as never, response as never);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(session);
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-csrf-token'] === f.nonceToken).toBe(true);
    expect(headers['set-cookie']).toBeUndefined();
    expect(sessionService.restoreSession.mock.calls[0][0]?.cookieHeader === cookieHeader).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(f.nonceToken);
  });

  it('registers SessionService in a real AuthModule test context without initializing an app', async () => {
    const f = sessionFixture();
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(f.prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({
        config: testConfig, hasher: { verify: async () => false }, blocklist: { hasDigest: () => false },
      })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(f.cipher)
      .compile();
    try {
      expect(module.get(SessionService)).toBeInstanceOf(SessionService);
      expect(module.get(AuthController)).toBeInstanceOf(AuthController);
    } finally {
      await module.close();
    }
  });
});
