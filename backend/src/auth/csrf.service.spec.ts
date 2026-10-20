import { Test } from '@nestjs/testing';
import { AUTH_RUNTIME } from './auth-runtime.module';
import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { CsrfNonceCipher } from './csrf-nonce.cipher';
import { CSRF_NONCE_CIPHER } from './csrf.service';
import { AuthConfig, validateAuthConfig } from './auth.config';
import { PrismaService } from '../prisma/prisma.service';
import { ApiExceptionFilter } from '../common/api-exception.filter';

// Synthetic test-only key material; never use for deployment.
const key = Buffer.alloc(32, 5).toString('base64url');
const config = validateAuthConfig({ NODE_ENV: 'test' });
const hashedId = (token: string): string => require('node:crypto').createHash('sha256').update(token).digest('hex');

function responseDouble() {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 0, body: undefined as unknown,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; return this; },
    status(value: number) { this.statusCode = value; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  return { response, headers };
}

describe('GET /api/v1/auth/csrf integrated unit', () => {
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  let preauth: Map<string, any>;
  let sessions: Map<string, any>;
  let prisma: any;
  let controller: AuthController;
  let now: number;

  beforeEach(async () => {
    now = Date.UTC(2026, 9, 9, 12);
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    preauth = new Map();
    sessions = new Map();
    prisma = {
      authPreAuthContext: {
        findUnique: jest.fn(async ({ where }: any) => preauth.get(where.id) ?? null),
        create: jest.fn(async ({ data }: any) => { const row = { ...data, createdAt: new Date(now) }; preauth.set(data.id, row); return row; }),
      },
      authSession: {
        findUnique: jest.fn(async ({ where }: any) => {
          const row = sessions.get(where.id);
          return row ? { ...row, adminUser: { ...row.adminUser } } : null;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = sessions.get(where.id);
          if (!row || row.revokedAt ||
              row.absoluteExpiresAt.getTime() <= where.absoluteExpiresAt.gt.getTime() ||
              row.idleExpiresAt.getTime() <= where.idleExpiresAt.gt.getTime() ||
              (where.idleExpiresAt.lte && row.idleExpiresAt.getTime() > where.idleExpiresAt.lte.getTime()) ||
              (where.lastActivityAt?.lte && row.lastActivityAt.getTime() > where.lastActivityAt.lte.getTime()) ||
              row.nonceVersion !== where.nonceVersion || !row.adminUser.active || row.adminUser.mustChangePassword) {
            return { count: 0 };
          }
          Object.assign(row, data);
          return { count: 1 };
        }),
        update: jest.fn(async ({ where, data }: any) => { const row = sessions.get(where.id); Object.assign(row, data); return row; }),
      },
    };
    moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({ config, blocklist: {}, hasher: {} })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(new CsrfNonceCipher(key))
      .compile();
    controller = moduleRef.get(AuthController);
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.restoreAllMocks();
  });

  async function invoke(cookie?: string, ip = '127.0.0.1', forwardedFor?: string) {
    const { response, headers } = responseDouble();
    await controller.getCsrf({
      headers: { ...(cookie ? { cookie } : {}), ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}) },
      socket: { remoteAddress: ip },
    } as never, response as never);
    return { response, headers };
  }

  async function invokeOutcome(cookie?: string, ip = '127.0.0.1') {
    const { response, headers } = responseDouble();
    let error: unknown;
    try {
      await controller.getCsrf({ headers: cookie ? { cookie } : {}, socket: { remoteAddress: ip } } as never, response as never);
    } catch (caught) {
      error = caught;
    }
    return { response, headers, error };
  }

  async function invokeWithFilter(cookie?: string, ip = '127.0.0.1', endpoint = controller) {
    const { response, headers } = responseDouble();
    try {
      await endpoint.getCsrf({ headers: cookie ? { cookie } : {}, socket: { remoteAddress: ip } } as never, response as never);
    } catch (error) {
      const context = { switchToHttp: () => ({
        getRequest: () => ({ path: '/api/v1/auth/csrf', requestId: '00000000-0000-4000-8000-000000000002' }),
        getResponse: () => response,
      }) };
      new ApiExceptionFilter().catch(error, context as never);
    }
    return { response, headers };
  }

  it('registers the controller and creates then recovers one anonymous nonce with no-store cookie policy', async () => {
    const first = await invoke();
    expect(first.response.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.response.body).toEqual({ csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), headerName: 'X-CSRF-Token' });
    const cookie = first.headers['set-cookie'];
    expect(cookie).toMatch(/^abar_auth_context=[A-Za-z0-9_-]{43}; Path=\/api\/v1\/auth; HttpOnly; SameSite=Lax;/);
    const token = cookie.split(';')[0].split('=')[1];
    const second = await invoke(`abar_auth_context=${token}`);
    expect(second.response.body).toEqual(first.response.body);
    expect(prisma.authPreAuthContext.create).toHaveBeenCalledTimes(1);
    expect(preauth.has(hashedId(token))).toBe(true);
    expect(JSON.stringify([...preauth.values()])).not.toContain((first.response.body as { csrfToken: string }).csrfToken);
  });

  it('replaces an expired preauth context and keeps dev loopback cookies non-Secure', async () => {
    const first = await invoke();
    const token = first.headers['set-cookie'].split(';')[0].split('=')[1];
    const row = preauth.get(hashedId(token));
    row.expiresAt = new Date(now - 1);
    const second = await invoke(`abar_auth_context=${token}`);
    expect((second.response.body as { csrfToken: string }).csrfToken).not.toBe((first.response.body as { csrfToken: string }).csrfToken);
    expect(second.headers['set-cookie']).not.toContain('; Secure');
    expect(prisma.authPreAuthContext.create).toHaveBeenCalledTimes(2);
  });

  it('returns the session-bound nonce unchanged and updates activity without changing nonce version', async () => {
    const cipher = new CsrfNonceCipher(key);
    const token = Buffer.alloc(32, 11).toString('base64url');
    const id = hashedId(token);
    const envelope = cipher.encrypt('session', id, 4, Buffer.alloc(32, 12));
    const row = {
      id, nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 4,
      absoluteExpiresAt: new Date(now + 500000), idleExpiresAt: new Date(now + 100000), lastActivityAt: new Date(now - 1000),
      revokedAt: null, adminUser: { active: true, mustChangePassword: false },
    };
    sessions.set(id, row);
    const first = await invoke(`abar_admin_session=${token}`);
    const second = await invoke(`abar_admin_session=${token}`);
    expect(second.response.body).toEqual(first.response.body);
    expect(first.headers['set-cookie']).toBeUndefined();
    expect(row.nonceVersion).toBe(4);
    expect(row.lastActivityAt.getTime()).toBe(now);
    expect(prisma.authSession.updateMany).toHaveBeenCalledTimes(2);
    const guard = prisma.authSession.updateMany.mock.calls[0][0].where;
    expect(guard).toMatchObject({ id, revokedAt: null });
    expect(guard.absoluteExpiresAt).toHaveProperty('gt');
    expect(guard.idleExpiresAt).toHaveProperty('gt');
    expect(prisma.authSession.update).not.toHaveBeenCalled();
  });

  it('does not let a delayed older refresh overwrite newer session activity', async () => {
    const raceConfig = validateAuthConfig({ NODE_ENV: 'test', AUTH_SESSION_IDLE_SECONDS: 30 });
    const raceModule = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({ config: raceConfig, blocklist: {}, hasher: {} })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(new CsrfNonceCipher(key))
      .compile();
    const endpoint = raceModule.get(AuthController);
    const startedAt = now;
    const token = Buffer.alloc(32, 15).toString('base64url');
    const row = activeSession(token);
    row.absoluteExpiresAt = new Date(startedAt + 120000);
    row.idleExpiresAt = new Date(startedAt + 30000);
    sessions.set(row.id, row);
    const original = { ...row };
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const applyUpdate = prisma.authSession.updateMany.getMockImplementation();
    prisma.authSession.updateMany.mockImplementationOnce(async (args: any) => {
      entered();
      await gate;
      return applyUpdate(args);
    });
    const older = invokeWithFilter(`abar_admin_session=${token}`, '127.0.0.1', endpoint);
    try {
      await waiting;
      now = startedAt + 20000;
      const newer = await invokeWithFilter(`abar_admin_session=${token}`, '127.0.0.1', endpoint);
      expect(newer.response.statusCode).toBe(200);
      expect(newer.headers['set-cookie']).toBeUndefined();
      expect(row.lastActivityAt.getTime()).toBe(startedAt + 20000);
      expect(row.idleExpiresAt.getTime()).toBe(startedAt + 50000);
      release();
      const stale = await older;
      expect(stale.response.statusCode).toBe(503);
      expect(stale.response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(stale.headers['set-cookie']).toBeUndefined();
      expect(stale.headers['cache-control']).toBe('no-store');
      expect(row).toEqual({ ...original,
        lastActivityAt: new Date(startedAt + 20000), idleExpiresAt: new Date(startedAt + 50000),
      });
      expect(prisma.authSession.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.authPreAuthContext.create).not.toHaveBeenCalled();
    } finally {
      release();
      await older;
      await raceModule.close();
    }
  });

  it.each(['revoked', 'restricted'] as const)(
    'does not return a stale nonce after an activity guard loses a race and fresh state is %s', async (state) => {
      const token = Buffer.alloc(32, 12).toString('base64url');
      const row = activeSession(token);
      sessions.set(row.id, row);
      prisma.authSession.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.authSession.findUnique
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(state === 'revoked'
          ? { ...row, revokedAt: new Date(now) }
          : { ...row, adminUser: { ...row.adminUser, mustChangePassword: true } });

      const outcome = await invokeOutcome(`abar_admin_session=${token}`);
      expect(prisma.authSession.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.authSession.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.authSession.update).not.toHaveBeenCalled();
      if (state === 'revoked') {
        expect(outcome.error).toBeUndefined();
        expect(outcome.response.statusCode).toBe(200);
        expect(outcome.response.body).not.toMatchObject({ csrfToken: Buffer.alloc(32, 14).toString('base64url') });
        expect(outcome.headers['set-cookie']).toMatch(/^abar_auth_context=/);
      } else {
        expect(outcome.error).toMatchObject({ response: 'PASSWORD_CHANGE_REQUIRED' });
        expect(outcome.headers['set-cookie']).toBeUndefined();
      }
    },
  );

  function activeSession(token: string): any {
    const id = hashedId(token);
    const envelope = new CsrfNonceCipher(key).encrypt('session', id, 1, Buffer.alloc(32, 14));
    return {
      id, nonceCiphertext: envelope.ciphertext, nonceIv: envelope.iv, nonceTag: envelope.tag, nonceVersion: 1,
      absoluteExpiresAt: new Date(now + 10000), idleExpiresAt: new Date(now + 10000), lastActivityAt: new Date(now), revokedAt: null,
      adminUser: { active: true, mustChangePassword: false },
    };
  }

  it('keeps restricted sessions forbidden', async () => {
    const token = Buffer.alloc(32, 13).toString('base64url');
    const row = activeSession(token);
    sessions.set(row.id, { ...row, adminUser: { active: true, mustChangePassword: true } });
    await expect(invoke(`abar_admin_session=${token}`)).rejects.toMatchObject({ response: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it.each(['unknown', 'revoked', 'absolute-expired', 'idle-expired', 'inactive'] as const)(
    'uses legitimate anonymous pre-auth state for %s session cookies', async (state) => {
      const token = Buffer.alloc(32, 13).toString('base64url');
      const row = activeSession(token);
      if (state !== 'unknown') {
        if (state === 'revoked') row.revokedAt = new Date(now - 1);
        if (state === 'absolute-expired') row.absoluteExpiresAt = new Date(now);
        if (state === 'idle-expired') row.idleExpiresAt = new Date(now);
        if (state === 'inactive') row.adminUser.active = false;
        sessions.set(row.id, row);
      }
      const result = await invokeOutcome(`abar_admin_session=${token}`);
      expect(result.error).toBeUndefined();
      expect(result.response.statusCode).toBe(200);
      expect(result.response.body).toMatchObject({ headerName: 'X-CSRF-Token' });
      expect(result.headers['set-cookie']).toMatch(/^abar_auth_context=/);
      expect(prisma.authPreAuthContext.create).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed for nonce corruption', async () => {
    const token = Buffer.alloc(32, 13).toString('base64url');
    const row = activeSession(token);
    row.nonceTag = Buffer.alloc(16);
    sessions.set(row.id, row);
    await expect(invoke(`abar_admin_session=${token}`)).rejects.toMatchObject({ status: 503 });
    expect(prisma.authPreAuthContext.create).not.toHaveBeenCalled();
  });

  it('enforces direct-socket per-IP accounting despite forwarded headers', async () => {
    const first = await invoke(undefined, '198.51.100.8', '203.0.113.1');
    const cookie = first.headers['set-cookie'].split(';')[0];
    for (let i = 1; i < config.csrfIpLimit; i++) await invoke(cookie, '198.51.100.8', `203.0.113.${i + 1}`);
    const limited = await invokeWithFilter(cookie, '198.51.100.8');
    expect(limited.response.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toMatch(/^[1-9][0-9]*$/);
    const retry = Number(limited.headers['retry-after']);
    expect(Number.isFinite(retry) && Number.isInteger(retry) && retry > 0 && retry <= config.csrfIpWindowSeconds).toBe(true);
  });

  it('expires rate entries at the exact window boundary and remains bounded under clock rollback', async () => {
    for (let i = 0; i < config.csrfIpLimit; i++) await invoke(undefined, '198.51.100.9');
    const deniedAtLimit = await invokeWithFilter(undefined, '198.51.100.9');
    expect(deniedAtLimit.response.statusCode).toBe(429);
    expect(deniedAtLimit.headers['retry-after']).toBe('60');
    now += config.csrfIpWindowSeconds * 1000;
    const boundary = await invoke(undefined, '198.51.100.9');
    expect(boundary.response.statusCode).toBe(200);
    now -= 1000;
    for (let i = 1; i < config.csrfIpLimit; i++) await invoke(undefined, '198.51.100.9');
    const backwards = await invokeWithFilter(undefined, '198.51.100.9');
    expect(backwards.response.statusCode).toBe(429);
    const retry = Number(backwards.headers['retry-after']);
    expect(Number.isFinite(retry) && Number.isInteger(retry) && retry > 0 && retry <= config.csrfIpWindowSeconds).toBe(true);
  });

  it('does not evict a live exhausted IP limit when 10000 synthetic IPs arrive at the same time', async () => {
    const first = await invoke(undefined, '198.51.100.10');
    const cookie = first.headers['set-cookie'].split(';')[0];
    for (let i = 1; i < config.csrfIpLimit; i++) await invoke(cookie, '198.51.100.10');
    const exhausted = await invokeWithFilter(cookie, '198.51.100.10');
    expect(exhausted.response.statusCode).toBe(429);

    // One live entry is the original IP; 9999 distinct synthetic IPs fill the remaining capacity.
    for (let i = 0; i < 9999; i++) await invoke(cookie, `2001:db8::${i + 1}`);
    const overflowFirst = await invokeWithFilter(cookie, '2001:db8::10000');
    const original = await invokeWithFilter(cookie, '198.51.100.10');
    const overflow = await invokeWithFilter(cookie, '203.0.113.250');
    const retriesValid = [overflowFirst, original, overflow].every((result) => {
      const retry = Number(result.headers['retry-after']);
      return Number.isFinite(retry) && Number.isInteger(retry) && retry > 0 && retry <= config.csrfIpWindowSeconds;
    });
    expect({
      firstOverflow: overflowFirst.response.statusCode,
      original: original.response.statusCode,
      overflow: overflow.response.statusCode,
      retriesValid,
    }).toEqual({ firstOverflow: 429, original: 429, overflow: 429, retriesValid: true });
  }, 60000);

  it('emits a Secure preauth cookie for a secure configured runtime', async () => {
    const secureConfig: AuthConfig = validateAuthConfig({
      NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'https://admin.example.test',
    });
    const secureModule = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({ config: secureConfig, blocklist: {}, hasher: {} })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(new CsrfNonceCipher(key))
      .compile();
    try {
      const endpoint = secureModule.get(AuthController);
      const { response, headers } = responseDouble();
      await endpoint.getCsrf({ headers: {}, socket: { remoteAddress: '127.0.0.1' } } as never, response as never);
      expect(response.statusCode).toBe(200);
      expect(headers['cache-control']).toBe('no-store');
      expect(headers['set-cookie']).toMatch(/; Secure$/);
    } finally {
      await secureModule.close();
    }
  });

  it('fails safe on storage errors and missing encryption key without anonymous fallback', async () => {
    prisma.authPreAuthContext.findUnique.mockRejectedValueOnce(new Error('synthetic storage detail'));
    await expect(invoke('abar_auth_context=' + Buffer.alloc(32, 1).toString('base64url'))).rejects.toThrow();

    const unavailable = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(AUTH_RUNTIME).useValue({ config, blocklist: {}, hasher: {} })
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(new CsrfNonceCipher(undefined))
      .compile();
    try {
      const endpoint = unavailable.get(AuthController);
      const { response } = responseDouble();
      await expect(endpoint.getCsrf({ headers: {}, socket: { remoteAddress: '127.0.0.1' } } as never, response as never))
        .rejects.toMatchObject({ status: 503 });
      expect(prisma.authPreAuthContext.create).not.toHaveBeenCalled();
    } finally {
      await unavailable.close();
    }
  });

  it('documents the CSRF 200 headers and all contracted error responses in Swagger metadata', () => {
    const responses = (Reflect.getMetadata('swagger/apiResponse', AuthController.prototype.getCsrf) ?? {}) as Record<string, any>;
    expect(responses).toHaveProperty('200');
    expect(responses['200']?.headers ?? {}).toMatchObject({
      'Cache-Control': expect.anything(),
      'Set-Cookie': expect.anything(),
    });
    expect(responses['403']?.headers ?? {}).toHaveProperty('Cache-Control');
    expect(responses['403']?.schema?.required).toEqual(['code', 'message', 'requestId']);
    expect(responses['429']?.headers ?? {}).toHaveProperty('Cache-Control');
    expect(responses['429']?.headers ?? {}).toHaveProperty('Retry-After');
    expect(responses['429']?.schema?.required).toEqual(['code', 'message', 'requestId']);
    expect(responses['503']?.headers ?? {}).toHaveProperty('Cache-Control');
    expect(responses['503']?.schema?.required).toEqual(['code', 'message', 'requestId']);
  });

  it('returns no-store and the contracted 403/429/503 errors through controller and filter', async () => {
    const restrictedToken = Buffer.alloc(32, 33).toString('base64url');
    const restricted = activeSession(restrictedToken);
    restricted.adminUser.mustChangePassword = true;
    sessions.set(restricted.id, restricted);
    const forbidden = await invokeWithFilter(`abar_admin_session=${restrictedToken}`);
    expect(forbidden.response.statusCode).toBe(403);
    expect(forbidden.response.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(forbidden.headers['cache-control']).toBe('no-store');

    const limitedIp = '198.51.100.222';
    for (let i = 0; i < config.csrfIpLimit; i++) await invoke(undefined, limitedIp);
    const limited = await invokeWithFilter(undefined, limitedIp);
    expect(limited.response.statusCode).toBe(429);
    expect(limited.response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['retry-after']).toMatch(/^[1-9][0-9]*$/);

    prisma.authPreAuthContext.findUnique.mockRejectedValueOnce(new Error('synthetic storage detail'));
    const unavailable = await invokeWithFilter(`abar_auth_context=${Buffer.alloc(32, 34).toString('base64url')}`);
    expect(unavailable.response.statusCode).toBe(503);
    expect(unavailable.response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(unavailable.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(unavailable.response.body)).not.toContain('synthetic storage detail');
  });
});
