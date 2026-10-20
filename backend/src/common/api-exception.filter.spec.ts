import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';
import { CsrfRouteException } from '../auth/csrf.service';
import { LoginRouteException } from '../auth/login.service';
import { SessionRouteException } from '../auth/session.service';
import { ChangePasswordService, readChangePasswordError, type ChangePasswordDependencies } from '../auth/change-password.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthConfig } from '../auth/auth.config';

function host(path: string, includeMatchedRoute = true, rawUrl?: string) {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 0, body: undefined as unknown,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; return this; },
    status(value: number) { this.statusCode = value; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  const normalized = path.toLowerCase().replace(/\/+$/, '');
  const matched = normalized === '/api/v1/auth/csrf' || normalized === '/api/v1/auth/login' || normalized === '/api/v1/auth/me' ||
    normalized === '/api/v1/auth/change-password';
  const request = {
    path, requestId: '00000000-0000-4000-8000-000000000001',
    ...(rawUrl === undefined ? {} : { url: rawUrl, originalUrl: rawUrl }),
    ...(matched && includeMatchedRoute ? { route: { path: normalized }, baseUrl: '' } : {}),
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  };
  return { context: context as never, response, headers };
}

describe('ApiExceptionFilter login route errors', () => {
  const filter = new ApiExceptionFilter();

  it.each([
    [403, 'ORIGIN_INVALID', 'Origen no permitido'],
    [403, 'CSRF_INVALID', 'Solicitud inválida'],
    [503, 'SERVICE_UNAVAILABLE', 'Servicio temporalmente no disponible'],
  ])('preserves owned auth errors without matched-route metadata (%s %s)', (status, code, message) => {
    let statusReads = 0;
    let codeReads = 0;
    let retryReads = 0;
    const error = new LoginRouteException(status, code as never);
    Object.defineProperties(error, {
      getStatus: { get: () => { statusReads++; throw new Error('status getter invoked'); } },
      code: { get: () => { codeReads++; throw new Error('code getter invoked'); } },
      retryAfter: { get: () => { retryReads++; throw new Error('retry getter invoked'); } },
    });
    const result = host('/unmatched', false);
    let thrown: unknown;
    try { filter.catch(error, result.context); } catch (caught) { thrown = caught; }
    expect({
      thrown: thrown === undefined,
      status: result.response.statusCode,
      body: result.response.body,
      cacheControl: result.headers['cache-control'],
      retryAfter: result.headers['retry-after'],
      statusReads, codeReads, retryReads,
    }).toEqual({
      thrown: true,
      status,
      body: { code, message, requestId: '00000000-0000-4000-8000-000000000001' },
      cacheControl: 'no-store', retryAfter: undefined,
      statusReads: 0, codeReads: 0, retryReads: 0,
    });
  });

  it.each([
    [400, 'VALIDATION_ERROR'], [401, 'INVALID_CREDENTIALS'], [403, 'ORIGIN_INVALID'],
    [403, 'CSRF_INVALID'], [403, 'PASSWORD_CHANGE_REQUIRED'], [429, 'RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('preserves owned login status/code and no-store for %s %s', (status, code) => {
    const result = host('/api/v1/auth/login');
    filter.catch(new LoginRouteException(status, code as never, status === 429 ? 17 : undefined), result.context);
    expect(result.response.statusCode).toBe(status);
    expect(result.response.body).toMatchObject({ code, requestId: '00000000-0000-4000-8000-000000000001' });
    expect(result.headers['cache-control']).toBe('no-store');
    if (status === 429) expect(result.headers['retry-after']).toBe('17');
  });

  it('uses immutable owned login metadata without invoking an overridden status accessor', () => {
    let statusReads = 0;
    const owned = new LoginRouteException(403, 'CSRF_INVALID');
    Object.defineProperty(owned, 'getStatus', {
      configurable: true,
      get: () => { statusReads++; throw new Error('owned status accessor invoked'); },
    });
    const result = host('/api/v1/auth/login');
    let thrown: unknown;
    try { filter.catch(owned, result.context); } catch (error) { thrown = error; }
    expect(thrown).toBeUndefined();
    expect(statusReads).toBe(0);
    expect(result.response.statusCode).toBe(403);
    expect(result.response.body).toEqual({
      code: 'CSRF_INVALID', message: 'Solicitud inválida', requestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it.each(['/api/v1/auth/login/', '/API/V1/AUTH/LOGIN'])(
    'applies the login failure contract to Express route alias %s', (path) => {
      const result = host(path);
      filter.catch(new LoginRouteException(503, 'SERVICE_UNAVAILABLE'), result.context);
      expect(result.response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(result.headers['cache-control']).toBe('no-store');
    },
  );

  it('does not classify by spoofed raw path or arbitrary exception getters', () => {
    let codeReads = 0;
    let retryReads = 0;
    const untrusted = new HttpException('untrusted', HttpStatus.TOO_MANY_REQUESTS);
    Object.defineProperties(untrusted, {
      code: { get: () => { codeReads++; throw new Error('untrusted code getter'); } },
      retryAfter: { get: () => { retryReads++; throw new Error('untrusted retry getter'); } },
    });
    const spoofed = host('/api/v1/auth/login', false);
    filter.catch(untrusted, spoofed.context);
    expect(spoofed.response.body).toMatchObject({ code: 'REQUEST_FAILED' });
    expect(spoofed.headers['cache-control']).toBeUndefined();
    expect(spoofed.headers['retry-after']).toBeUndefined();
    expect(codeReads).toBe(0);
    expect(retryReads).toBe(0);

    const matched = host('/api/v1/auth/login');
    filter.catch(untrusted, matched.context);
    expect(matched.response.body).toMatchObject({ code: 'REQUEST_FAILED' });
    expect(matched.headers['cache-control']).toBe('no-store');
    expect(matched.headers['retry-after']).toBeUndefined();
  });

  it.each([['NaN', Number.NaN], ['infinite', Number.POSITIVE_INFINITY], ['negative', -1], ['fractional', 1.5], ['excessive', 3601]])(
    'never emits invalid login Retry-After metadata (%s)', (_label, seconds) => {
      const result = host('/api/v1/auth/login');
      filter.catch(new LoginRouteException(429, 'RATE_LIMITED', seconds), result.context);
      const header = result.headers['retry-after'];
      if (header !== undefined) {
        const retry = Number(header);
        expect(Number.isSafeInteger(retry) && retry > 0 && retry <= 3600).toBe(true);
      }
    },
  );
});

describe('ApiExceptionFilter session route errors', () => {
  const filter = new ApiExceptionFilter();

  it.each([
    [new SessionRouteException(401, 'SESSION_EXPIRED'), 401, 'SESSION_EXPIRED'],
    [new SessionRouteException(503, 'SERVICE_UNAVAILABLE'), 503, 'SERVICE_UNAVAILABLE'],
  ])('returns owned session error metadata with no-store %#', (error, status, code) => {
    const result = host('/api/v1/auth/me');
    filter.catch(error, result.context);
    expect(result.response.statusCode).toBe(status);
    expect(result.response.body).toMatchObject({ code, requestId: '00000000-0000-4000-8000-000000000001' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(result.response.body)).not.toMatch(/synthetic|nonce|password=/i);
  });

  it.each([
    [new SessionRouteException(401, 'SESSION_EXPIRED'), 401, 'SESSION_EXPIRED', 'La sesión ha expirado'],
    [new SessionRouteException(503, 'SERVICE_UNAVAILABLE'), 503, 'SERVICE_UNAVAILABLE', 'Servicio temporalmente no disponible'],
  ] as const)('sets no-store for owned %s without a matched route or recognized raw URL', (error, status, code, message) => {
    let statusReads = 0;
    let codeReads = 0;
    let retryReads = 0;
    Object.defineProperties(error, {
      getStatus: { get: () => { statusReads++; throw new Error('status getter invoked'); } },
      code: { get: () => { codeReads++; throw new Error('code getter invoked'); } },
      retryAfter: { get: () => { retryReads++; throw new Error('retry getter invoked'); } },
    });
    const variants = [host('/unmatched', false), host('/unmatched', false, '/also-unmatched?source=test')];
    const observed = variants.map((result) => {
      filter.catch(error, result.context);
      return {
        status: result.response.statusCode,
        body: result.response.body,
        cacheControl: result.headers['cache-control'],
      };
    });
    expect(observed).toEqual(variants.map(() => ({
      status,
      body: { code, message, requestId: '00000000-0000-4000-8000-000000000001' },
      cacheControl: 'no-store',
    })));
    expect({ statusReads, codeReads, retryReads }).toEqual({ statusReads: 0, codeReads: 0, retryReads: 0 });
  });

  it.each(['/api/v1/auth/me/', '/API/V1/AUTH/ME'])('matches the me handler alias %s for no-store', (path) => {
    const result = host(path);
    filter.catch(new SessionRouteException(401, 'SESSION_EXPIRED'), result.context);
    expect(result.response.body).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('uses owned session metadata before overridden status/code accessors', () => {
    let statusReads = 0;
    let codeReads = 0;
    const owned = new SessionRouteException(401, 'SESSION_EXPIRED');
    Object.defineProperties(owned, {
      getStatus: { get: () => { statusReads++; throw new Error('owned status accessor invoked'); } },
      code: { get: () => { codeReads++; throw new Error('owned code accessor invoked'); } },
    });
    const result = host('/api/v1/auth/me');
    let thrown: unknown;
    try { filter.catch(owned, result.context); } catch (error) { thrown = error; }
    expect(thrown).toBeUndefined();
    expect(statusReads).toBe(0);
    expect(codeReads).toBe(0);
    expect(result.response.statusCode).toBe(401);
    expect(result.response.body).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('keeps the safe H0 fallback for unowned exceptions on the matched me route', () => {
    const result = host('/api/v1/auth/me');
    filter.catch(new HttpException('private detail', HttpStatus.SERVICE_UNAVAILABLE), result.context);
    expect(result.response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente no disponible' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(result.response.body)).not.toContain('private');
  });
});

describe('ApiExceptionFilter CSRF route errors', () => {
  const filter = new ApiExceptionFilter();

  it.each([
    [new CsrfRouteException(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED'), 403, 'PASSWORD_CHANGE_REQUIRED'],
    [new CsrfRouteException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 17), 429, 'RATE_LIMITED'],
  ])('returns safe CSRF error codes with no-store and retry metadata %#', (error, status, code) => {
    const result = host('/api/v1/auth/csrf');
    filter.catch(error, result.context);
    expect(result.response.statusCode).toBe(status);
    expect(result.response.body).toMatchObject({ code, requestId: '00000000-0000-4000-8000-000000000001' });
    expect(result.headers['cache-control']).toBe('no-store');
    if (status === 429) expect(result.headers['retry-after']).toBe('17');
    expect(JSON.stringify(result.response.body)).not.toMatch(/synthetic|nonce|password=/i);
  });

  it.each(['/api/v1/auth/csrf/', '/API/V1/AUTH/CSRF'])(
    'preserves owned error codes and headers for Express route alias %s', (path) => {
      const forbidden = host(path);
      filter.catch(new CsrfRouteException(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED'), forbidden.context);
      expect(forbidden.response.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
      expect(forbidden.headers['cache-control']).toBe('no-store');

      const limited = host(path);
      filter.catch(new CsrfRouteException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 17), limited.context);
      expect(limited.response.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(limited.headers['cache-control']).toBe('no-store');
      expect(limited.headers['retry-after']).toBe('17');
    },
  );

  it('never reads arbitrary exception code or retryAfter getters', () => {
    let codeReads = 0;
    let retryReads = 0;
    const unowned = new HttpException('untrusted', HttpStatus.TOO_MANY_REQUESTS);
    Object.defineProperties(unowned, {
      code: { get: () => { codeReads++; throw new Error('code getter invoked'); } },
      retryAfter: { get: () => { retryReads++; throw new Error('retry getter invoked'); } },
    });
    const result = host('/api/v1/auth/csrf');
    let thrown: unknown;
    try { filter.catch(unowned, result.context); } catch (error) { thrown = error; }
    expect(thrown).toBeUndefined();
    expect(codeReads).toBe(0);
    expect(retryReads).toBe(0);
    expect(result.response.body).toMatchObject({ code: 'REQUEST_FAILED' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['retry-after']).toBeUndefined();
  });

  it.each([
    ['infinity', Number.POSITIVE_INFINITY], ['NaN', Number.NaN], ['negative', -1],
    ['fractional', 1.5], ['excessive', 3601],
  ])('never emits invalid Retry-After for owned %s metadata', (_label, retryAfter) => {
    const result = host('/api/v1/auth/csrf');
    filter.catch(new CsrfRouteException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', retryAfter), result.context);
    const header = result.headers['retry-after'];
    if (header !== undefined) {
      const seconds = Number(header);
      expect(Number.isFinite(seconds) && Number.isInteger(seconds) && seconds > 0 && seconds <= 3600).toBe(true);
    }
  });

  it('preserves the established safe H0 503 body while applying no-store only to CSRF', () => {
    const h0 = host('/health');
    filter.catch(new Error('private storage detail'), h0.context);
    expect(h0.response.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor' });
    expect(h0.headers['cache-control']).toBeUndefined();

    const csrf = host('/api/v1/auth/csrf');
    const { ServiceUnavailableException } = require('@nestjs/common');
    filter.catch(new ServiceUnavailableException('private detail'), csrf.context);
    expect(csrf.response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente no disponible' });
    expect(csrf.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(csrf.response.body)).not.toContain('private');
  });
});

describe('ApiExceptionFilter change-password owned errors', () => {
  const filter = new ApiExceptionFilter();

  async function publicServiceError(): Promise<unknown> {
    const config = {
      allowedOrigins: ['http://127.0.0.1:4200'], cookieSecure: false,
      sessionAbsoluteSeconds: 3600, sessionIdleSeconds: 1800, preAuthSeconds: 900,
      loginIpLimit: 10, loginIpWindowSeconds: 60, loginAccountLimit: 10, loginAccountWindowSeconds: 900,
      csrfIpLimit: 30, csrfIpWindowSeconds: 60, argon2Concurrency: 1, argon2QueueLimit: 1,
    } as AuthConfig;
    const dependencies: ChangePasswordDependencies = {
      prisma: {} as PrismaService,
      hasher: { verify: async () => true, hash: async () => 'unused' },
      blocklist: { hasDigest: () => false },
      cipher: { available: true, decrypt: () => Buffer.alloc(32), encrypt: () => ({
        ciphertext: Buffer.alloc(32), iv: Buffer.alloc(12), tag: Buffer.alloc(16),
      }) } as never,
      config, now: () => 1_900_000_000_000, randomBytes: size => Buffer.alloc(size),
    };
    try {
      await new ChangePasswordService(dependencies).changePassword({
        body: {}, origin: 'https://untrusted.invalid',
      });
    } catch (error) {
      return error;
    }
    throw new Error('Expected public ChangePasswordService to reject the disallowed origin');
  }

  it('trusts genuine service-owned metadata and applies no-store to a matched change-password route', async () => {
    const owned = await publicServiceError();
    expect(readChangePasswordError(owned)).toEqual({ status: 403, code: 'ORIGIN_INVALID' });
    const matched = host('/api/v1/auth/change-password');
    let thrown: unknown;
    try { filter.catch(owned, matched.context); } catch (error) { thrown = error; }
    expect(thrown).toBeUndefined();
    expect(matched.response.statusCode).toBe(403);
    expect(matched.response.body).toEqual({
      code: 'ORIGIN_INVALID', message: 'Origen no permitido',
      requestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(matched.headers['cache-control']).toBe('no-store');
  });

  it('does not trust an unmatched spoofed raw path and preserves the global 500 fallback', () => {
    const spoofed = host('/unmatched', false, '/api/v1/auth/change-password?spoofed=1');
    filter.catch(new Error('synthetic-private-error'), spoofed.context);
    expect(spoofed.response.statusCode).toBe(500);
    expect(spoofed.response.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor',
      requestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(spoofed.headers['cache-control']).toBeUndefined();
  });
});
