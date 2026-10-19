import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AddressInfo } from 'node:net';
import { configureApplication } from '../configure-application';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { ChangePasswordService, type ChangePasswordDependencies, type ChangePasswordRequest } from './change-password.service';
import { CsrfService } from './csrf.service';
import { LoginService } from './login.service';
import { LogoutService } from './logout.service';
import { SessionService } from './session.service';

// Transport-only success fixture; service failures below come from the public service API.
const origin = 'http://127.0.0.1:4200';
const body = { currentPassword: 'synthetic-current-secret', newPassword: 'synthetic-new-secret' };
const csrfToken = Buffer.alloc(32, 7).toString('base64url');
const sessionCookie = `abar_admin_session=${Buffer.alloc(32, 8).toString('base64url')}; Path=/; HttpOnly; SameSite=Strict`;
const changed = { status: 204, sessionCookie, csrfToken } as const;
const sessionToken = Buffer.alloc(32, 2).toString('base64url');
const sessionNonce = Buffer.alloc(32, 3);
const sessionId = createHash('sha256').update(sessionToken, 'utf8').digest('hex');
const fixedTime = Date.UTC(2030, 0, 1);

function controlledDependencies(options: {
  verify?: boolean | (() => Promise<boolean>);
  blocked?: boolean;
} = {}): {
  dependencies: ChangePasswordDependencies;
  verify: jest.Mock;
  hash: jest.Mock;
  updateMany: jest.Mock;
  transaction: jest.Mock;
  encrypt: jest.Mock;
  randomBytes: jest.Mock;
} {
  const timestamp = new Date(fixedTime);
  const row = {
    id: sessionId, adminUserId: '00000000-0000-4000-8000-000000000002', nonceVersion: 1,
    nonceCiphertext: Buffer.alloc(32, 4), nonceIv: Buffer.alloc(12, 5), nonceTag: Buffer.alloc(16, 6),
    createdAt: timestamp, lastActivityAt: timestamp,
    absoluteExpiresAt: new Date(fixedTime + 60_000), idleExpiresAt: new Date(fixedTime + 30_000), revokedAt: null,
    adminUser: {
      id: '00000000-0000-4000-8000-000000000002', name: 'Synthetic Admin', email: 'admin@example.invalid',
      passwordHash: 'synthetic-hash', active: true, mustChangePassword: false, version: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
  };
  const updateMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    authSession: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => where.id === sessionId ? row : null) },
    adminUser: { updateMany },
    $transaction: transaction,
  } as unknown as PrismaService;
  const verify = jest.fn(async () => typeof options.verify === 'function'
    ? options.verify()
    : options.verify ?? true);
  const hash = jest.fn(async () => 'synthetic-new-hash');
  const hasher = { verify, hash };
  const blocklist = { hasDigest: jest.fn(() => options.blocked ?? false) };
  const encrypt = jest.fn(() => ({ ciphertext: Buffer.alloc(32, 9), iv: Buffer.alloc(12, 10), tag: Buffer.alloc(16, 11) }));
  const cipher = {
    available: true,
    decrypt: jest.fn(() => Buffer.from(sessionNonce)),
    encrypt,
  };
  const randomBytes = jest.fn((size: number) => Buffer.alloc(size, 12));
  const config = {
    allowedOrigins: [origin], cookieSecure: false,
    sessionAbsoluteSeconds: 3600, sessionIdleSeconds: 1800, preAuthSeconds: 900,
    loginIpLimit: 10, loginIpWindowSeconds: 60, loginAccountLimit: 10, loginAccountWindowSeconds: 900,
    csrfIpLimit: 30, csrfIpWindowSeconds: 60, argon2Concurrency: 1, argon2QueueLimit: 1,
  } as AuthConfig;
  return {
    dependencies: {
      prisma, hasher, blocklist, cipher: cipher as never, config,
      now: () => fixedTime, randomBytes,
    },
    verify, hash, updateMany, transaction, encrypt, randomBytes,
  };
}

describe('change-password HTTP transport and parser boundary', () => {
  let app: NestExpressApplication;
  let url: string;
  let activeService: ChangePasswordService | undefined;
  const changePassword = jest.fn(async (_input: unknown) => changed);
  const publicServiceCalls: ChangePasswordRequest[] = [];
  const loginResult = {
    session: {
      admin: { id: 'synthetic-admin', name: 'Admin', email: 'admin@example.invalid', mustChangePassword: false },
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
    sessionCookie, clearPreAuthCookie: 'abar_auth_context=; Path=/; Max-Age=0', csrfToken,
  };
  const login = jest.fn(async (_input: unknown) => loginResult);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: CsrfService, useValue: {} },
        { provide: LoginService, useValue: { login } },
        { provide: SessionService, useValue: {} },
        { provide: LogoutService, useValue: {} },
        { provide: ChangePasswordService, useValue: {
          changePassword: (input: ChangePasswordRequest) => {
            if (!activeService) return changePassword(input);
            publicServiceCalls.push(input);
            return activeService.changePassword(input);
          },
        } },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(() => {
    activeService = undefined;
    publicServiceCalls.length = 0;
    changePassword.mockClear();
    login.mockClear();
  });
  afterAll(async () => { if (app) await app.close(); });

  it('returns an empty 204 with exact carriers and forwards unmodified request data', async () => {
    const cookieHeader = 'abar_admin_session=synthetic-old-token';
    const response = await request(url).post('/api/v1/auth/change-password')
      .set('Origin', origin).set('Cookie', cookieHeader).set('X-CSRF-Token', csrfToken)
      .send(body).timeout({ response: 2000, deadline: 3000 });
    expect({
      status: response.status, text: response.text,
      cacheControl: response.headers['cache-control'], cookies: response.headers['set-cookie'],
      csrf: response.headers['x-csrf-token'], contentType: response.headers['content-type'],
      calls: changePassword.mock.calls,
    }).toEqual({
      status: 204, text: '', cacheControl: 'no-store', cookies: [sessionCookie],
      csrf: csrfToken, contentType: undefined,
      calls: [[{ body, origin, cookieHeader, csrfToken }]],
    });
  });

  it('preserves the existing login response and no-store behavior', async () => {
    const response = await request(url).post('/api/v1/auth/login').send({ email: 'admin@example.invalid', password: 'synthetic-login' })
      .timeout({ response: 2000, deadline: 3000 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(loginResult.session);
    expect(login.mock.calls).toEqual([[{
      body: { email: 'admin@example.invalid', password: 'synthetic-login' },
      origin: undefined, csrfToken: undefined, cookieHeader: undefined, clientIp: '127.0.0.1',
    }]]);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual([sessionCookie, 'abar_auth_context=; Path=/; Max-Age=0']);
    expect(response.headers['x-csrf-token']).toBe(csrfToken);
  });

  const ownedErrorCases: Array<[
    string,
    { body: Record<string, unknown>; blocked?: boolean; verify?: boolean | (() => Promise<boolean>); noCookie?: boolean; badCsrf?: boolean; badOrigin?: boolean },
    number, string, string,
  ]> = [
    ['invalid body', { body: {} }, 400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos'],
    ['policy rejection', { body, blocked: true }, 400, 'PASSWORD_POLICY', 'La contraseña no cumple la política de seguridad'],
    ['expired session', { body, noCookie: true }, 401, 'SESSION_EXPIRED', 'La sesión ha expirado'],
    ['wrong current password', { body, verify: false }, 401, 'INVALID_CREDENTIALS', 'Credenciales inválidas'],
    ['invalid CSRF proof', { body, badCsrf: true }, 403, 'CSRF_INVALID', 'Solicitud inválida'],
    ['invalid origin', { body, badOrigin: true }, 403, 'ORIGIN_INVALID', 'Origen no permitido'],
    ['dependency failure', { body, verify: async () => { throw new Error('synthetic-private-dependency-detail'); } }, 503, 'SERVICE_UNAVAILABLE', 'Servicio temporalmente no disponible'],
  ];
  it.each(ownedErrorCases)('maps public service-owned %s metadata to a safe HTTP response', async (_label, scenario, status, code, message) => {
    const controlled = controlledDependencies({
      ...(scenario.blocked ? { blocked: true } : {}),
      ...(scenario.verify !== undefined ? { verify: scenario.verify } : {}),
    });
    activeService = new ChangePasswordService(controlled.dependencies);
    const requestBody = scenario.body;
    const response = await request(url).post('/api/v1/auth/change-password')
      .set('Origin', scenario.badOrigin ? 'https://attacker.invalid' : origin)
      .set('Cookie', scenario.noCookie ? '' : `abar_admin_session=${sessionToken}`)
      .set('X-CSRF-Token', scenario.badCsrf ? Buffer.alloc(32, 13).toString('base64url') : sessionNonce.toString('base64url'))
      .send(requestBody).timeout({ response: 2000, deadline: 3000 });
    expect(publicServiceCalls).toHaveLength(1);
    expect(publicServiceCalls[0].body).toEqual(requestBody);
    if (_label === 'dependency failure') expect(controlled.verify).toHaveBeenCalledTimes(1);
    expect(controlled.hash).not.toHaveBeenCalled();
    expect(controlled.transaction).not.toHaveBeenCalled();
    expect(controlled.updateMany).not.toHaveBeenCalled();
    expect(controlled.encrypt).not.toHaveBeenCalled();
    expect(controlled.randomBytes).not.toHaveBeenCalled();
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ code, message, requestId: response.headers['x-request-id'] });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-csrf-token']).toBeUndefined();
    expect(response.text).not.toContain('synthetic-private-dependency-detail');
    expect(Object.keys(response.body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it.each([
    ['JSON null', 'null'],
    ['malformed JSON', '{"currentPassword":"synthetic-parser-private",'],
  ])('maps %s exclusively on this endpoint to exact validation response and no-store', async (_label, payload) => {
    const response = await request(url).post('/api/v1/auth/change-password')
      .set('Origin', origin).set('Content-Type', 'application/json').send(payload)
      .timeout({ response: 2000, deadline: 3000 });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain('synthetic-parser-private');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-csrf-token']).toBeUndefined();
  });
});
