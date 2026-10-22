import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { NotificationDispatcher, LocalMailpitSmtpTransport } from '../src/notifications/notification-dispatcher';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';
import { validateAuthConfig } from '../src/auth/auth.config';
import { CheckoutService } from '../src/checkout/checkout.service';
import { OrdersService } from '../src/orders/orders.service';
import { AdminOrdersService } from '../src/orders/admin-orders.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const databaseUrl = process.env.H6_DATABASE_URL;
const mailpitUrl = process.env.H6_MAILPIT_URL;
const containerId = process.env.H6_CONTAINER_ID;
const owner = process.env.H6_OWNER;

describe('H6 notification delivery on the explicitly owned PostgreSQL and Mailpit fixtures', () => {
  let prisma: PrismaClient;
  let admin: AdminOrdersService;
  let admins: AdminUsersService;
  let actor: { token: string; csrf: string };
  const origin = 'http://127.0.0.1:4200';

  beforeAll(async () => {
    if (!databaseUrl || !mailpitUrl || !containerId || !owner || !process.env.H6_MAILPIT_CONTAINER_ID) {
      throw new Error('H6 owned PostgreSQL and Mailpit fixture manifest is required');
    }
    const database = new URL(databaseUrl);
    const mailpit = new URL(mailpitUrl);
    expect(database.hostname).toBe('127.0.0.1');
    expect(database.pathname).toBe('/h6_notifications');
    expect(mailpit.hostname).toBe('127.0.0.1');
    expect(mailpit.protocol).toBe('http:');
    expect(containerId).toMatch(/^[a-f0-9]+$/i);
    expect(owner.length).toBeGreaterThan(0);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$queryRaw`SELECT 1`;
    await clearPreviousH6FixtureRows();
    const cipher = createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: randomBytes(32).toString('base64url') });
    admins = new AdminUsersService(prisma as never, cipher,
      validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }),
      { hash: async () => 'unused' }, { hasDigest: () => false });
    const config = { get: (key: string) => ({ H4_REPLAY_KEY_BASE64: Buffer.alloc(32, 17).toString('base64'),
      H4_DEMO_SIMULATION_ENABLED: true, H4_ACCESS_TTL_SECONDS: 86400, H4_ADMIN_NOTIFICATION_EMAIL: 'admin@example.test' } as any)[key] };
    const orders = new OrdersService(prisma as never, new CheckoutService(prisma as never), config as never);
    admin = new AdminOrdersService(prisma as never, admins, orders, config as never);
    const user = await prisma.adminUser.create({ data: {
      name: 'H6 DEMO admin', email: `${randomUUID()}@example.test`, passwordHash: 'unused', active: true, mustChangePassword: false,
    } });
    actor = await createSession(prisma, user.id, cipher);
  }, 20_000);

  afterAll(async () => { await prisma?.$disconnect(); });

  async function createSession(database: PrismaClient, adminUserId: string, cipher: ReturnType<typeof createCsrfNonceCipher>) {
    const token = randomBytes(32).toString('base64url'), nonce = randomBytes(32);
    const id = createHash('sha256').update(token).digest('hex');
    const encrypted = cipher.encrypt('session', id, 1, nonce), now = new Date();
    await database.authSession.create({ data: { id, adminUserId,
      nonceCiphertext: Uint8Array.from(encrypted.ciphertext), nonceIv: Uint8Array.from(encrypted.iv), nonceTag: Uint8Array.from(encrypted.tag),
      lastActivityAt: now, absoluteExpiresAt: new Date(Date.now() + 3_600_000), idleExpiresAt: new Date(Date.now() + 3_600_000),
    } });
    return { token, csrf: nonce.toString('base64url') };
  }

  async function clearPreviousH6FixtureRows() {
    const orders = await prisma.order.findMany({ where: { orderNumber: { startsWith: 'ABAR-H6-' } }, select: { id: true } });
    const ids = orders.map((order) => order.id);
    if (!ids.length) return;
    // This test database is intentionally reusable; retire only NotificationJob fixtures
    // produced by this spec, leaving append-only business history and orders untouched.
    await prisma.notificationJob.deleteMany({ where: { orderId: { in: ids } } });
  }

  it('serializes competing dispatchers and delivers a fixed DEMO message to Mailpit after the job commit', async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const orderNumber = `ABAR-H6-${suffix}`;
    const quote = await prisma.checkoutQuote.create({ data: {
      policyVersion: 1, stateFingerprint: '0'.repeat(64), response: {}, expiresAt: new Date(Date.now() + 60_000),
    } });
    const order = await prisma.order.create({ data: {
      orderNumber, quoteId: quote.id, deliveryMode: 'PICKUP', customerFirstName: 'Demo', customerLastName: 'Buyer',
      customerEmail: 'buyer@example.test', customerPhone: '+541155550001', acceptedTermsVersion: 'demo-2026-10-20-v1',
      subtotalMinor: 1000n, deliveryFeeMinor: 0n, totalMinor: 1000n,
      accessTokenHash: createHash('sha256').update(randomUUID()).digest('hex'), accessExpiresAt: new Date(Date.now() + 600_000),
    } });
    await prisma.payment.create({ data: { orderId: order.id, amountMinor: 1000n, status: 'PENDING' } });
    const job = await prisma.notificationJob.create({ data: {
      orderId: order.id, kind: 'ORDER_CREATED_BUYER', recipient: 'buyer@example.test',
      dedupeKey: `${order.id}:h6:${suffix}`, state: 'PENDING', payload: { orderNumber, customerNote: 'PRIVATE_NOT_SENT' },
    } });
    const config = { get: (key: string) => ({ H6_SMTP_HOST: '127.0.0.1', H6_SMTP_PORT: Number(process.env.H6_SMTP_PORT) } as any)[key] };
    const transport = new LocalMailpitSmtpTransport(config as never);
    const first = new NotificationDispatcher(prisma as never, config as never, transport);
    const second = new NotificationDispatcher(prisma as never, config as never, transport);

    const [a, b] = await Promise.all([first.run(1), second.run(1)]);

    expect(a.claimed + b.claimed).toBe(1);
    expect(a.sent + b.sent).toBe(1);
    const stored = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.state).toBe('SENT');
    expect(stored.totalAttemptCount).toBe(1);
    expect(stored.sentAt).toBeInstanceOf(Date);
    const response = await fetch(new URL('/api/v1/messages', mailpitUrl));
    expect(response.status).toBe(200);
    const messages = await response.json();
    const evidence = JSON.stringify(messages);
    expect(evidence).toContain(orderNumber);
    expect(evidence).toContain('buyer@example.test');
    expect(evidence).toContain('DEMO');
    expect(evidence).not.toContain('PRIVATE_NOT_SENT');
  }, 30_000);

  it('recovers an expired lease and permanently fails an unsafe recipient without SMTP', async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const quote = await prisma.checkoutQuote.create({ data: {
      policyVersion: 1, stateFingerprint: '1'.repeat(64), response: {}, expiresAt: new Date(Date.now() + 60_000),
    } });
    const order = await prisma.order.create({ data: {
      orderNumber: `ABAR-H6-${suffix}`, quoteId: quote.id, deliveryMode: 'PICKUP', customerFirstName: 'Demo', customerLastName: 'Buyer',
      customerEmail: 'buyer@example.test', customerPhone: '+541155550001', acceptedTermsVersion: 'demo-2026-10-20-v1',
      subtotalMinor: 1000n, deliveryFeeMinor: 0n, totalMinor: 1000n,
      accessTokenHash: createHash('sha256').update(randomUUID()).digest('hex'), accessExpiresAt: new Date(Date.now() + 600_000),
    } });
    await prisma.payment.create({ data: { orderId: order.id, amountMinor: 1000n, status: 'PENDING' } });
    const job = await prisma.notificationJob.create({ data: {
      orderId: order.id, kind: 'ORDER_CREATED_BUYER', recipient: 'buyer@external.invalid',
      dedupeKey: `${order.id}:h6-invalid:${suffix}`, state: 'PROCESSING', attemptCount: 1,
      totalAttemptCount: 1, lastAttemptAt: new Date(Date.now() - 61_000), nextAttemptAt: null,
      leaseToken: randomUUID(), leaseUntil: new Date(Date.now() - 1_000), payload: { orderNumber: `ABAR-H6-${suffix}` },
    } });
    const config = { get: (key: string) => ({ H6_SMTP_HOST: '127.0.0.1', H6_SMTP_PORT: Number(process.env.H6_SMTP_PORT) } as any)[key] };
    const transport = { send: jest.fn(async () => undefined) };
    const dispatcher = new NotificationDispatcher(prisma as never, config as never, transport);

    await expect(dispatcher.run(1)).resolves.toEqual({ claimed: 1, sent: 0, failed: 1, retried: 0 });
    const stored = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.state).toBe('FAILED');
    expect(stored.lastError).toBe('INVALID_JOB');
    expect(stored.leaseToken).toBeNull();
    expect(transport.send).not.toHaveBeenCalled();
  }, 30_000);

  it('creates buyer and admin cancellation jobs atomically and replays without duplicating them', async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const quote = await prisma.checkoutQuote.create({ data: {
      policyVersion: 1, stateFingerprint: '2'.repeat(64), response: {}, expiresAt: new Date(Date.now() + 60_000),
    } });
    const order = await prisma.order.create({ data: {
      orderNumber: `ABAR-H6-${suffix}`, quoteId: quote.id, deliveryMode: 'PICKUP', customerFirstName: 'Demo', customerLastName: 'Buyer',
      customerEmail: 'buyer@example.test', customerPhone: '+541155550001', acceptedTermsVersion: 'demo-2026-10-20-v1',
      subtotalMinor: 1000n, deliveryFeeMinor: 0n, totalMinor: 1000n,
      accessTokenHash: createHash('sha256').update(randomUUID()).digest('hex'), accessExpiresAt: new Date(Date.now() + 600_000),
    } });
    await prisma.payment.create({ data: { orderId: order.id, amountMinor: 1000n, status: 'PENDING' } });
    const key = randomBytes(18).toString('base64url');
    const request = { body: { expectedVersion: 1, reason: 'Customer request' },
      cookieHeader: `abar_admin_session=${actor.token}`, csrfToken: actor.csrf, origin, idempotencyKey: key };

    const result = await admin.mutate(order.id, 'ORDER_CANCEL', request);
    expect(await admin.mutate(order.id, 'ORDER_CANCEL', request)).toEqual(result);
    expect((await prisma.notificationJob.findMany({ where: { orderId: order.id } })).map((job) => job.kind).sort())
      .toEqual(['ORDER_CANCELLED_ADMIN', 'ORDER_CANCELLED_BUYER']);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, eventType: 'ORDER_CANCELLED' } })).toBe(1);
    expect(await prisma.stockOperation.count({ where: { orderId: order.id } })).toBe(0);
  }, 30_000);

  it('retries an existing FAILED job with CAS, resetting only its attempt cycle and never duplicating it', async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const orderNumber = `ABAR-H6-${suffix}`;
    const quote = await prisma.checkoutQuote.create({ data: {
      policyVersion: 1, stateFingerprint: '3'.repeat(64), response: {}, expiresAt: new Date(Date.now() + 60_000),
    } });
    const order = await prisma.order.create({ data: {
      orderNumber, quoteId: quote.id, deliveryMode: 'PICKUP', customerFirstName: 'Demo', customerLastName: 'Buyer',
      customerEmail: 'buyer@example.test', customerPhone: '+541155550001', acceptedTermsVersion: 'demo-2026-10-20-v1',
      subtotalMinor: 1000n, deliveryFeeMinor: 0n, totalMinor: 1000n,
      accessTokenHash: createHash('sha256').update(randomUUID()).digest('hex'), accessExpiresAt: new Date(Date.now() + 600_000),
    } });
    await prisma.payment.create({ data: { orderId: order.id, amountMinor: 1000n, status: 'PENDING' } });
    const job = await prisma.notificationJob.create({ data: {
      orderId: order.id, kind: 'ORDER_CREATED_BUYER', recipient: 'buyer@example.test', dedupeKey: `${order.id}:h6-retry:${suffix}`,
      state: 'FAILED', version: 4, attemptCount: 5, totalAttemptCount: 8, lastError: 'SMTP_UNAVAILABLE', nextAttemptAt: null,
      payload: { orderNumber },
    } });
    const notifications = new NotificationsService(prisma as never, admins);
    const request = { body: { expectedVersion: 4 }, cookieHeader: `abar_admin_session=${actor.token}`, csrfToken: actor.csrf, origin };

    const result = await notifications.retry(job.id, request);

    expect(result).toMatchObject({ id: job.id, state: 'PENDING', version: 5, attemptCount: 0, lastError: null });
    const stored = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.totalAttemptCount).toBe(8);
    expect(stored.nextAttemptAt).toBeInstanceOf(Date);
    expect(stored.leaseToken).toBeNull();
    await expect(notifications.retry(job.id, request)).rejects.toMatchObject({ status: 409, response: 'NOT_RETRYABLE' });
    expect(await prisma.notificationJob.count({ where: { orderId: order.id } })).toBe(1);
  }, 30_000);
});
