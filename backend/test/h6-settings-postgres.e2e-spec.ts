import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { SettingsService } from '../src/settings/settings.service';
import { CatalogException } from '../src/catalog-shared/catalog-error';
import { SettingsController } from '../src/settings/settings.controller';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';
import { validateAuthConfig } from '../src/auth/auth.config';

const describeOwnedPostgres = process.env.H6_SETTINGS_DATABASE_URL ? describe : describe.skip;
const replacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;
const serialize = (value: unknown) => JSON.stringify(value, replacer);

describeOwnedPostgres('H6 commercial settings PostgreSQL invariants', () => {
  let prisma: PrismaService;
  let settings: SettingsService;
  let app: INestApplication;
  let admins: AdminUsersService;
  const auth = { recheck: jest.fn(async () => undefined) };
  const origin = 'http://127.0.0.1:4200';
  const csrfKey = randomBytes(32).toString('base64url');
  const cipher = createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: csrfKey });
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const actors: Array<{ id: string; token: string; csrf: string }> = [];

  async function createSession({ expired = false, revoked = false, mustChangePassword = false } = {}) {
    const user = await prisma.adminUser.create({ data: {
      name: 'H6 fictitious administrator', email: `h6-${randomUUID()}@example.test`, passwordHash: 'not-used',
      active: true, mustChangePassword,
    } });
    const token = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32);
    const sessionId = digest(token);
    const encrypted = cipher.encrypt('session', sessionId, 1, nonce);
    const now = Date.now();
    const expires = new Date(now + 60 * 60 * 1000);
    await prisma.authSession.create({ data: {
      id: sessionId, adminUserId: user.id, nonceCiphertext: Uint8Array.from(encrypted.ciphertext),
      nonceIv: Uint8Array.from(encrypted.iv), nonceTag: Uint8Array.from(encrypted.tag),
      lastActivityAt: new Date(now), absoluteExpiresAt: expired ? new Date(now - 1000) : expires,
      idleExpiresAt: expired ? new Date(now - 1000) : expires, revokedAt: revoked ? new Date(now) : null,
    } });
    const actor = { id: user.id, token, csrf: nonce.toString('base64url') };
    actors.push(actor);
    return actor;
  }

  const http = (method: 'get' | 'patch', path: string, actor?: { token: string; csrf: string }) => {
    let req = method === 'get' ? request(app.getHttpServer()).get(path) : request(app.getHttpServer()).patch(path);
    if (actor) req = req.set('Cookie', `abar_admin_session=${actor.token}`).set('X-CSRF-Token', actor.csrf);
    return req.set('Origin', origin);
  };

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.H6_SETTINGS_DATABASE_URL }));
    await prisma.$connect();
    settings = new SettingsService(prisma, {} as never, new ConfigService({ H4_DEMO_SIMULATION_ENABLED: false }));
    admins = new AdminUsersService(prisma as never, cipher,
      validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }),
      { hash: async () => 'unused' }, { hasDigest: () => false });
    const module = await Test.createTestingModule({ controllers: [SettingsController], providers: [
      { provide: SettingsService, useValue: settings }, { provide: AdminUsersService, useValue: admins },
    ] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (prisma && actors.length) {
      await prisma.authSession.deleteMany({ where: { adminUserId: { in: actors.map((actor) => actor.id) } } });
      await prisma.adminUser.deleteMany({ where: { id: { in: actors.map((actor) => actor.id) } } });
    }
    if (prisma) await prisma.$disconnect();
  });

  it('serves only the versioned DEMO contact publicly without an administrator session', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/public/contact').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body).sort()).toEqual(['contact', 'demo', 'version']);
    expect(response.body.demo).toBe(true);
    expect(response.body.contact.email).toMatch(/@example\.test$/);
    expect(response.body).not.toHaveProperty('feeMinor');
    await request(app.getHttpServer()).get('/api/v1/public/contact?debug=1').expect(400);
  });

  it('enforces H1 missing, expired, revoked, password-change, Origin, and CSRF rules on settings routes', async () => {
    const expired = await createSession({ expired: true });
    const revoked = await createSession({ revoked: true });
    const passwordPending = await createSession({ mustChangePassword: true });
    const valid = await createSession();

    for (const actor of [undefined, expired, revoked]) {
      const response = await http('get', '/api/v1/admin/settings', actor);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('SESSION_EXPIRED');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(response.body)).not.toContain('H6 fictitious administrator');
    }
    const passwordResponse = await http('get', '/api/v1/admin/payment-methods/DEMO_TRANSFER', passwordPending);
    expect(passwordResponse.status).toBe(403);
    expect(passwordResponse.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const policy = await prisma.checkoutPolicy.findUniqueOrThrow({ where: { id: 'default' } });
    const method = policy.paymentMethods as unknown as Array<Record<string, unknown>>;
    const transfer = method.find((entry) => entry.code === 'DEMO_TRANSFER')!;
    const modes = transfer.deliveryModes as string[];
    const badOrigin = await request(app.getHttpServer()).patch('/api/v1/admin/payment-methods/DEMO_TRANSFER')
      .set('Origin', 'https://attacker.invalid').set('Cookie', `abar_admin_session=${valid.token}`).set('X-CSRF-Token', valid.csrf)
      .send({ expectedVersion: policy.version, enabled: transfer.enabled !== false, instructions: 'DEMO instructions.', deliveryModes: modes });
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.code).toBe('ORIGIN_INVALID');
    const badCsrf = await http('patch', '/api/v1/admin/payment-methods/DEMO_TRANSFER', { ...valid, csrf: randomBytes(32).toString('base64url') })
      .send({ expectedVersion: policy.version, enabled: transfer.enabled !== false, instructions: 'DEMO instructions.', deliveryModes: modes });
    expect(badCsrf.status).toBe(403);
    expect(badCsrf.body.code).toBe('CSRF_INVALID');
  });

  it('accepts a valid H1-authenticated settings mutation with no-store and a versioned response', async () => {
    const actor = await createSession();
    const original = await prisma.checkoutPolicy.findUniqueOrThrow({ where: { id: 'default' } });
    try {
      const result = await http('patch', '/api/v1/admin/payment-methods/DEMO_TRANSFER', actor).send({
        expectedVersion: original.version,
        enabled: true,
        instructions: 'Fictitious DEMO details; do not transfer funds.',
        deliveryModes: ['PICKUP', 'COORDINATED'],
      });
      expect(result.status).toBe(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body).toMatchObject({ code: 'DEMO_TRANSFER', version: original.version + 1, enabled: true, demo: true });
    } finally {
      await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: {
        feeMinor: original.feeMinor,
        enabledDeliveryModes: original.enabledDeliveryModes as unknown as Prisma.InputJsonValue,
        paymentMethods: original.paymentMethods as unknown as Prisma.InputJsonValue,
        contact: original.contact as unknown as Prisma.InputJsonValue, version: original.version,
      } });
    }
  });

  it('rejects an H1 mutation leaving only disabled server simulation and preserves policy state', async () => {
    const actor = await createSession();
    const original = await prisma.checkoutPolicy.findUniqueOrThrow({ where: { id: 'default' } });
    const simulationOnly: Array<Record<string, unknown>> = (original.paymentMethods as unknown as Array<Record<string, unknown>>).map((method) => ({
      ...method, enabled: method.code === 'DEMO_SIMULATION',
    }));
    try {
      await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: {
        paymentMethods: simulationOnly as unknown as Prisma.InputJsonValue,
      } });

      const simulation = simulationOnly.find((method) => method.code === 'DEMO_SIMULATION')!;
      const response = await http('patch', '/api/v1/admin/payment-methods/DEMO_SIMULATION', actor).send({
        expectedVersion: original.version,
        enabled: false,
        instructions: simulation.instructions,
        deliveryModes: simulation.deliveryModes,
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NO_VALID_CHECKOUT_COMBINATION');
      const after = await prisma.checkoutPolicy.findUniqueOrThrow({ where: { id: 'default' } });
      expect(after.version).toBe(original.version);
      expect(after.paymentMethods).toEqual(simulationOnly);
    } finally {
      await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: {
        feeMinor: original.feeMinor,
        enabledDeliveryModes: original.enabledDeliveryModes as unknown as Prisma.InputJsonValue,
        paymentMethods: original.paymentMethods as unknown as Prisma.InputJsonValue,
        contact: original.contact as unknown as Prisma.InputJsonValue, version: original.version,
      } });
    }
  });

  it('serializes same-version admins and leaves quote/order snapshots untouched', async () => {
    const original = await prisma.checkoutPolicy.findUniqueOrThrow({ where: { id: 'default' } });
    const quotesBefore = await prisma.checkoutQuote.findMany({ orderBy: { id: 'asc' }, select: { id: true, response: true } });
    const ordersBefore = await prisma.order.findMany({ orderBy: { id: 'asc' }, select: {
      id: true, subtotalMinor: true, deliveryFeeMinor: true, totalMinor: true,
      items: { orderBy: { id: 'asc' }, select: { id: true, snapshot: true } },
    } });
    try {
      const expectedVersion = original.version;
      const updates = await Promise.allSettled([
        settings.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
          expectedVersion, enabled: true, instructions: 'DEMO transfer instructions.', deliveryModes: ['PICKUP', 'COORDINATED'],
        }),
        settings.patchPaymentMethod(auth as never, 'DEMO_SIMULATION', {
          expectedVersion, enabled: true, instructions: 'DEMO simulation instructions.', deliveryModes: ['PICKUP', 'COORDINATED'],
        }),
      ]);
      expect(updates.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = updates.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(CatalogException);
      expect((rejected?.reason as CatalogException).getResponse()).toBe('VERSION_CONFLICT');

      const quotesAfter = await prisma.checkoutQuote.findMany({ orderBy: { id: 'asc' }, select: { id: true, response: true } });
      const ordersAfter = await prisma.order.findMany({ orderBy: { id: 'asc' }, select: {
        id: true, subtotalMinor: true, deliveryFeeMinor: true, totalMinor: true,
        items: { orderBy: { id: 'asc' }, select: { id: true, snapshot: true } },
      } });
      expect(serialize(quotesAfter)).toBe(serialize(quotesBefore));
      expect(serialize(ordersAfter)).toBe(serialize(ordersBefore));
    } finally {
      await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: {
        feeMinor: original.feeMinor,
        enabledDeliveryModes: original.enabledDeliveryModes as unknown as Prisma.InputJsonValue,
        paymentMethods: original.paymentMethods as unknown as Prisma.InputJsonValue,
        contact: original.contact as unknown as Prisma.InputJsonValue, version: original.version,
      } });
    }
  });
});
