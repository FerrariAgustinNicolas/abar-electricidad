import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { CsrfService } from '../src/auth/csrf.service';
import { LoginService } from '../src/auth/login.service';
import { SessionService } from '../src/auth/session.service';
import { LogoutService } from '../src/auth/logout.service';
import { ChangePasswordService } from '../src/auth/change-password.service';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

// Discovery imports must never construct a real Prisma client or load native Argon.
jest.mock('../src/prisma/prisma.service', () => ({
  PrismaService: jest.fn(() => { throw new Error('Real Prisma construction is forbidden in this fixture'); }),
}));
jest.mock('argon2', () => ({
  hash: jest.fn(() => { throw new Error('Native Argon is forbidden in this fixture'); }),
  verify: jest.fn(() => { throw new Error('Native Argon is forbidden in this fixture'); }),
}));

describe('Isolated controller HTTP and OpenAPI contract (not AppModule E2E)', () => {
  let app: INestApplication;
  let query: jest.Mock;

  beforeAll(async () => {
    query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: query } },
        ...[CsrfService, LoginService, SessionService, LogoutService, ChangePasswordService]
          .map(provide => ({ provide, useValue: {} })),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app as never);
    await app.init();
  });

  afterAll(async () => app?.close());

  it('serves GET /health only after a real health service query', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0][0] as TemplateStringsArray).join('')).toBe('SELECT 1');
  });

  it('documents only implemented auth and health endpoints with OpenAPI 3.0.3', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.openapi).toBe('3.0.3');
    const routes = {
      '/api/v1/auth/change-password': 'post',
      '/api/v1/auth/csrf': 'get',
      '/api/v1/auth/login': 'post',
      '/api/v1/auth/logout': 'post',
      '/api/v1/auth/me': 'get',
      '/health': 'get',
    };
    expect(Object.keys(response.body.paths).sort()).toEqual(Object.keys(routes).sort());
    for (const [path, method] of Object.entries(routes)) {
      expect(Object.keys(response.body.paths[path])).toEqual([method]);
    }
  });

  it('documents the closed change-password contract without executing auth dependencies', async () => {
    const queryCallsBefore = query.mock.calls.length;
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const operation = body.paths['/api/v1/auth/change-password'].post;
    expect(operation.operationId).toBe('changeAdminPassword');
    expect(operation.security).toEqual([{ AdminSessionCookie: [] }]);
    expect(body.components.securitySchemes.AdminSessionCookie).toMatchObject({
      type: 'apiKey', in: 'cookie', name: 'abar_admin_session',
    });
    expect(operation.parameters).toHaveLength(2);
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Origin', in: 'header', required: true,
        schema: { type: 'string', minLength: 1 } }),
      expect.objectContaining({ name: 'X-CSRF-Token', in: 'header', required: true,
        schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } }),
    ]));
    expect(operation.requestBody.required).toBe(true);
    expect(operation.requestBody.content['application/json'].schema).toEqual({
      type: 'object', additionalProperties: false,
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
        newPassword: { type: 'string', minLength: 15, maxLength: 128, writeOnly: true },
      },
    });
    expect(operation['x-abar-errors']).toEqual({
      '400': ['VALIDATION_ERROR', 'PASSWORD_POLICY'],
      '401': ['SESSION_EXPIRED', 'INVALID_CREDENTIALS'],
      '403': ['ORIGIN_INVALID', 'CSRF_INVALID'],
      '503': ['SERVICE_UNAVAILABLE'],
    });
    expect(Object.keys(operation.responses).sort()).toEqual(['204', '400', '401', '403', '503']);
    expect(operation.responses['204']).not.toHaveProperty('content');
    const successHeaders = operation.responses['204'].headers;
    expect(Object.keys(successHeaders).sort()).toEqual(['Cache-Control', 'Set-Cookie', 'X-CSRF-Token']);
    expect(successHeaders['Cache-Control'].schema).toEqual({ type: 'string', enum: ['no-store'] });
    expect(successHeaders['Set-Cookie'].schema).toEqual({ type: 'string' });
    expect(successHeaders['X-CSRF-Token'].schema).toEqual({
      type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$',
    });
    // The existing health-schema witness independently pins this shared public envelope.
    const publicErrorSchema = body.paths['/health'].get.responses['503'].content['application/json'].schema;
    for (const status of ['400', '401', '403', '503']) {
      expect(operation.responses[status].headers['Cache-Control'].schema).toEqual({ type: 'string', enum: ['no-store'] });
      expect(operation.responses[status].content['application/json'].schema).toEqual(publicErrorSchema);
    }
    expect(query).toHaveBeenCalledTimes(queryCallsBefore);
    expect(PrismaService).not.toHaveBeenCalled();
  });

  it('documents exact closed health response schemas for success and safe errors', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const responses = body.paths['/health'].get.responses;
    expect(responses['200'].content['application/json'].schema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['status'],
      properties: { status: { type: 'string', enum: ['ok'] } },
    });
    expect(responses['503'].content['application/json'].schema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', minLength: 1 },
        message: { type: 'string', minLength: 1 },
        fieldErrors: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'code', 'message'],
            properties: {
              field: { type: 'string', minLength: 1 },
              code: { type: 'string', minLength: 1 },
              message: { type: 'string', minLength: 1 },
            },
          },
        },
        requestId: { type: 'string', format: 'uuid' },
      },
    });
  });

  it('returns a safe, uniform 503 when PostgreSQL is unavailable', async () => {
    query.mockRejectedValueOnce(new Error('password=/private/secret database=private'));
    const response = await request(app.getHttpServer()).get('/health').expect(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Servicio temporalmente no disponible',
    });
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(response.body)).not.toMatch(/password|private|secret|database/i);
  });

  it('uses the same safe error shape for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/not-implemented').expect(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
