import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AddressInfo } from 'node:net';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureApplication } from '../configure-application';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService, AdminUsersRouteException } from './admin-users.service';

const origin = 'http://127.0.0.1:4200';
const token = Buffer.alloc(32, 11).toString('base64url');
const cookie = `abar_admin_session=${Buffer.alloc(32, 12).toString('base64url')}`;
const id = '00000000-0000-4000-8000-000000000001';
const safeUser = {
  id, name: 'Operator', email: 'operator@example.invalid', active: true, mustChangePassword: false,
  version: 1, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
};

describe('admin users HTTP contract', () => {
  let app: NestExpressApplication;
  let url: string;
  const list = jest.fn(async () => ({ items: [safeUser], pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
  const create = jest.fn(async () => safeUser);
  const patch = jest.fn(async () => safeUser);
  const resetPassword = jest.fn(async () => undefined);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [{ provide: AdminUsersService, useValue: { list, create, patch, resetPassword } }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  beforeEach(() => { list.mockClear(); create.mockClear(); patch.mockClear(); resetPassword.mockClear(); });
  afterAll(async () => { if (app) await app.close(); });

  it('serves sanitized bounded list results with no-store', async () => {
    const response = await request(url).get('/api/v1/admin/users?page=2&pageSize=5&sort=name').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ items: [safeUser], pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    expect(list).toHaveBeenCalledWith({ cookieHeader: cookie, query: { page: '2', pageSize: '5', sort: 'name' } });
  });

  it('forwards create proof and request body unchanged and returns 201 without sensitive fields', async () => {
    const body = { name: 'New user', email: 'new@example.invalid', temporaryPassword: 'synthetic-private-password' };
    const response = await request(url).post('/api/v1/admin/users').set('Cookie', cookie)
      .set('Origin', origin).set('X-CSRF-Token', token).send(body);
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(safeUser);
    expect(response.text).not.toContain('passwordHash');
    expect(create).toHaveBeenCalledWith({ cookieHeader: cookie, origin, csrfToken: token, body });
  });

  it('forwards patch and reset operations on the frozen route shapes', async () => {
    const patchBody = { expectedVersion: 1, active: false };
    const patchResponse = await request(url).patch(`/api/v1/admin/users/${id}`).set('Cookie', cookie)
      .set('Origin', origin).set('X-CSRF-Token', token).send(patchBody);
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.headers['cache-control']).toBe('no-store');
    expect(patch).toHaveBeenCalledWith({ id, body: patchBody, cookieHeader: cookie, origin, csrfToken: token });

    const resetBody = { temporaryPassword: 'synthetic-private-password', reason: 'support verified' };
    const resetResponse = await request(url).post(`/api/v1/admin/users/${id}/reset-password`).set('Cookie', cookie)
      .set('Origin', origin).set('X-CSRF-Token', token).send(resetBody);
    expect(resetResponse.status).toBe(204);
    expect(resetResponse.text).toBe('');
    expect(resetResponse.headers['cache-control']).toBe('no-store');
    expect(resetPassword).toHaveBeenCalledWith({ id, body: resetBody, cookieHeader: cookie, origin, csrfToken: token });
  });

  it('declares the frozen session-cookie security requirement on every admin operation', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('test').setVersion('test').build());
    const operations = document.paths['/api/v1/admin/users'];
    expect(operations?.get?.security).toEqual([{ AdminSessionCookie: [] }]);
    expect(operations?.post?.security).toEqual([{ AdminSessionCookie: [] }]);
    expect(document.paths['/api/v1/admin/users/{id}']?.patch?.security).toEqual([{ AdminSessionCookie: [] }]);
    expect(document.paths['/api/v1/admin/users/{id}/reset-password']?.post?.security).toEqual([{ AdminSessionCookie: [] }]);
  });

  it('maps owned route errors to safe no-store API envelopes', async () => {
    create.mockRejectedValueOnce(new AdminUsersRouteException('EMAIL_IN_USE'));
    const response = await request(url).post('/api/v1/admin/users').set('Cookie', cookie)
      .set('Origin', origin).set('X-CSRF-Token', token).send({});
    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ code: 'EMAIL_IN_USE', message: 'El correo electrónico ya está en uso', requestId: response.headers['x-request-id'] });
    expect(response.text).not.toContain('synthetic-private-password');
  });

  for (const [operation, method, path] of [
    ['list', 'get', '/api/v1/admin/users'], ['create', 'post', '/api/v1/admin/users'],
    ['patch', 'patch', `/api/v1/admin/users/${id}`], ['resetPassword', 'post', `/api/v1/admin/users/${id}/reset-password`],
  ] as const) {
    for (const failureType of ['unclassified', 'framework', 'owned'] as const) {
      it(`returns documented 503 for ${operation} ${failureType} dependency failure`, async () => {
        const handler = { list, create, patch, resetPassword }[operation];
        handler.mockRejectedValueOnce(failureType === 'owned' ? new AdminUsersRouteException('SERVICE_UNAVAILABLE') :
          failureType === 'framework' ? new InternalServerErrorException('PRIVATE_BACKEND_FAILURE') : new Error('PRIVATE_BACKEND_FAILURE'));
        let pending = request(url)[method](path).set('Cookie', cookie).set('Origin', origin).set('X-CSRF-Token', token);
        if (method !== 'get') pending = pending.send({});
        const response = await pending;
        expect(response.status).toBe(503);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
        expect(Object.keys(response.body).sort()).toEqual(['code', 'message', 'requestId']);
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
        expect(response.text).not.toContain('PRIVATE_BACKEND_FAILURE');
      });
    }
  }

  it.each([400, 404])('preserves framework client-error status %i', async (status) => {
    list.mockRejectedValueOnce(new HttpException('PRIVATE_BACKEND_FAILURE', status));
    const response = await request(url).get('/api/v1/admin/users').set('Cookie', cookie);
    expect(response.status).toBe(status);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain('PRIVATE_BACKEND_FAILURE');
  });

});
