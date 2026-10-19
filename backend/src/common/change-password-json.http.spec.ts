import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AddressInfo } from 'node:net';
import { configureApplication } from '../configure-application';

const CHANGE_PASSWORD = Symbol('CHANGE_PASSWORD');
const OTHER_AUTH = Symbol('OTHER_AUTH');
const parserPrivateContent = 'synthetic-parser-private-content';
const changePasswordPath = '/api/v1/auth/change-password';
const loginPath = '/api/v1/auth/login';

@Controller()
class FakeChangePasswordController {
  constructor(@Inject(CHANGE_PASSWORD) private readonly changePassword: (body: unknown) => unknown) {}

  @Post(changePasswordPath)
  handle(@Body() body: unknown): unknown {
    return this.changePassword(body);
  }
}

@Controller()
class FakeOtherAuthController {
  constructor(@Inject(OTHER_AUTH) private readonly otherAuth: (body: unknown) => unknown) {}

  @Post(loginPath)
  login(@Body() body: unknown): unknown {
    return this.otherAuth(body);
  }

  @Get('/api/v1/auth/change-password')
  wrongMethod(): string {
    return 'wrong-method-handler';
  }

  @Post('/api/v1/auth/change-password/extra')
  suffixedPath(): string {
    return 'suffixed-path-handler';
  }
}

describe('change-password JSON parser public HTTP boundary', () => {
  let app: NestExpressApplication;
  let url: string;
  const changePassword = jest.fn((body: unknown) => ({ accepted: body }));
  const otherAuth = jest.fn((body: unknown) => ({ other: body }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FakeChangePasswordController, FakeOtherAuthController],
      providers: [
        { provide: CHANGE_PASSWORD, useValue: changePassword },
        { provide: OTHER_AUTH, useValue: otherAuth },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    changePassword.mockClear();
    otherAuth.mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it.each([
    ['JSON null', 'null'],
    ['malformed JSON', `{"password":"${parserPrivateContent}",`],
  ])('returns the owned public validation contract for %s on the exact POST route', async (_label, payload) => {
    const response = await request(url)
      .post(changePasswordPath)
      .set('Content-Type', 'application/json')
      .send(payload)
      .timeout({ response: 2000, deadline: 3000 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son válidos',
      requestId: response.headers['x-request-id'],
    });
    expect(Object.keys(response.body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-csrf-token']).toBeUndefined();
    expect(response.text).not.toContain(parserPrivateContent);
    expect(changePassword).not.toHaveBeenCalled();
    expect(otherAuth).not.toHaveBeenCalled();
  });

  it('leaves valid JSON handling and dependency forwarding unchanged', async () => {
    const body = { currentPassword: 'synthetic-current', newPassword: 'synthetic-new' };
    const response = await request(url)
      .post(changePasswordPath)
      .set('Content-Type', 'application/json')
      .send(body)
      .timeout({ response: 2000, deadline: 3000 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ accepted: body });
    expect(changePassword.mock.calls).toEqual([[body]]);
    expect(otherAuth).not.toHaveBeenCalled();
  });

  it('preserves the other auth route parser response without no-store classification', async () => {
    const response = await request(url)
      .post(loginPath)
      .set('Content-Type', 'application/json')
      .send(`{"password":"${parserPrivateContent}",`)
      .timeout({ response: 2000, deadline: 3000 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Los datos enviados no son válidos',
      requestId: response.headers['x-request-id'],
    });
    expect(response.headers['cache-control']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-csrf-token']).toBeUndefined();
    expect(response.text).not.toContain(parserPrivateContent);
    expect(changePassword).not.toHaveBeenCalled();
    expect(otherAuth).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong method', () => request(url).get(changePasswordPath)],
    ['suffixed path', () => request(url).post(`${changePasswordPath}/extra`)],
    ['prefix lookalike', () => request(url).post(`${changePasswordPath}-extra`)],
    ['raw URL query spoof', () => request(url).post(`/unmatched?originalUrl=${encodeURIComponent(changePasswordPath)}`)],
    ['admin wrong method', () => request(url).get('/api/v1/admin/users')],
    ['admin patch suffix', () => request(url).patch('/api/v1/admin/users/example/extra')],
    ['admin reset suffix', () => request(url).post('/api/v1/admin/users/example/reset-password/extra')],
    ['admin prefix lookalike', () => request(url).post('/api/v1/admin/users-extra')],
    ['admin raw URL query spoof', () => request(url).post(`/unmatched?originalUrl=${encodeURIComponent('/api/v1/admin/users')}`)],
  ])('does not classify parser failures for %s as change-password failures', async (_label, makeRequest) => {
    const response = await makeRequest()
      .set('Content-Type', 'application/json')
      .send(`{"password":"${parserPrivateContent}",`)
      .timeout({ response: 2000, deadline: 3000 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Los datos enviados no son válidos',
      requestId: response.headers['x-request-id'],
    });
    expect(response.headers['cache-control']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-csrf-token']).toBeUndefined();
    expect(response.text).not.toContain(parserPrivateContent);
    expect(changePassword).not.toHaveBeenCalled();
    expect(otherAuth).not.toHaveBeenCalled();
  });
});
