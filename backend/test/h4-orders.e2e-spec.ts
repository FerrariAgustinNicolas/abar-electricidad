import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../src/generated/prisma/client';
import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { PublicCheckoutRateLimiter } from '../src/checkout/public-checkout-rate-limiter';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { createOrdersJsonRouter } from '../src/orders/orders-json.middleware';
import { StockService } from '../src/stock/stock.service';

const cleanUrl = process.env.H4_ORDERS_CLEAN_DATABASE_URL;
const upgradeUrl = process.env.H4_ORDERS_UPGRADE_DATABASE_URL;
const containerId = process.env.H4_ORDERS_CONTAINER_ID;
const owner = process.env.H4_ORDERS_OWNER;
const dockerHost = 'unix:///Users/agustin/.docker/run/docker.sock';
const migrationsPath = resolve(__dirname, '../prisma/migrations');
const termsVersion = 'demo-2026-10-20-v1';
const termsText = 'Condiciones de demostración académica, provisionales y no validadas como términos legales de ABAR. Registrar un pedido no reserva ni garantiza existencias futuras. Los medios e intentos de pago son ficticios. Una simulación aprobada no confirma un cobro: requiere confirmación administrativa posterior fuera de H4.';

function assertOwnedFixture(): { clean: string; upgrade: string } {
  if (!cleanUrl || !upgradeUrl || !containerId || !owner) throw new Error('H4 PostgreSQL fixture is required; see backend/scripts/h4-orders-postgres.mjs');
  const clean = new URL(cleanUrl); const upgrade = new URL(upgradeUrl);
  for (const [url, name] of [[clean, 'h4_orders'], [upgrade, 'h4_orders_upgrade']] as const) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== `/${name}` || url.username !== 'h4_orders') throw new Error('H4 fixture must use the explicitly owned local databases');
  }
  if (clean.hostname !== upgrade.hostname || clean.port !== upgrade.port || !/^[0-9a-f]{64}$/.test(containerId) || !/^[0-9a-f-]{36}$/i.test(owner)) throw new Error('H4 fixture identity is invalid');
  const inspected = JSON.parse(execFileSync('docker', ['--host', dockerHost, 'inspect', containerId], { encoding: 'utf8' }))[0];
  if (inspected.Id !== containerId || inspected.Config.Image !== 'postgres:17.11-bookworm' ||
      inspected.Config.Labels['com.abar.h4-orders-owner'] !== owner || inspected.Config.Labels['com.abar.h4-orders-purpose'] !== 'integration' ||
      !inspected.State.Running || inspected.Mounts.length !== 0 || Object.keys(inspected.HostConfig.Tmpfs ?? {}).join(',') !== '/var/lib/postgresql/data' ||
      (inspected.HostConfig.Binds ?? []).length !== 0) throw new Error('H4 fixture ownership, version, or ephemeral storage guard failed');
  const binding = inspected.NetworkSettings.Ports['5432/tcp']?.[0];
  if (!binding || binding.HostIp !== '127.0.0.1' || binding.HostPort !== clean.port) throw new Error('H4 fixture port binding guard failed');
  return { clean: clean.toString(), upgrade: upgrade.toString() };
}

async function applyMigrations(url: string, names: string[]) {
  const client = new pg.Client({ connectionString: url }); await client.connect();
  try { for (const name of names) await client.query(await readFile(resolve(migrationsPath, name, 'migration.sql'), 'utf8')); }
  finally { await client.end(); }
}

async function assertEmpty(url: string) {
  const client = new pg.Client({ connectionString: url }); await client.connect();
  try { const result = await client.query(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'pg_%' AND tablename <> 'sql_features'`); expect(result.rows[0].count).toBe(0); }
  finally { await client.end(); }
}

const key = () => randomBytes(18).toString('base64url');
const quoteRequest = (presentationId: string, quantity = 1) => ({ items: [{ presentationId, quantity }], deliveryMode: 'PICKUP', paymentMethodCode: 'DEMO_SIMULATION' });
const createBody = (quoteId: string) => ({ quoteId, customer: { firstName: 'Demo', lastName: 'Buyer', email: 'buyer@example.test', phone: '+54 11 5555-0101' }, acceptedTermsVersion: termsVersion });

describe('H4 orders on a verified owned PostgreSQL 17 fixture', () => {
  let prisma: PrismaClient;
  let checkout: CheckoutService;
  let application: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let presentationId: string;
  let startStockHash: string;
  let simulationEnabled = true;

  beforeAll(async () => {
    const urls = assertOwnedFixture();
    const migrations = (await readdir(migrationsPath)).filter((entry) => /^\d+_/.test(entry)).sort();
    const h4 = migrations.filter((entry) => entry.includes('_h4_orders'));
    const historical = migrations.filter((entry) => !entry.includes('_h4_orders'));
    if (h4.length !== 1 || historical.length !== 5 || migrations.at(-1) !== h4[0]) throw new Error('Expected five historical H0-H3 migrations followed by exactly one H4 migration');

    await assertEmpty(urls.clean);
    await applyMigrations(urls.clean, migrations);
    await assertEmpty(urls.upgrade);
    await applyMigrations(urls.upgrade, historical);
    const upgrade = new pg.Client({ connectionString: urls.upgrade }); await upgrade.connect();
    const actor = randomUUID(); const category = randomUUID(); const product = randomUUID(); const presentation = randomUUID();
    const quote = randomUUID(); const now = new Date(); const sessionId = randomBytes(32).toString('hex');
    let h3PreservationHash: string;
    const preservationSql = `SELECT jsonb_build_object(
      'admin', (SELECT to_jsonb(t) FROM "AdminUser" t WHERE "id"='${actor}'),
      'session', (SELECT to_jsonb(t) FROM "AuthSession" t WHERE "id"='${sessionId}'),
      'category', (SELECT to_jsonb(t) FROM "Category" t WHERE "id"='${category}'),
      'product', (SELECT to_jsonb(t) FROM "Product" t WHERE "id"='${product}'),
      'presentation', (SELECT to_jsonb(t) FROM "ProductPresentation" t WHERE "id"='${presentation}'),
      'balance', (SELECT to_jsonb(t) FROM "StockBalance" t WHERE "presentationId"='${presentation}'),
      'quote', (SELECT to_jsonb(t) FROM "CheckoutQuote" t WHERE "id"='${quote}')
    )::text AS snapshot`;
    try {
      await upgrade.query('BEGIN');
      await upgrade.query(`INSERT INTO "AdminUser"("id","name","email","passwordHash","active","mustChangePassword","version","createdAt","updatedAt") VALUES ($1,'H4 upgrade actor',$2,'unusable',true,true,1,$3,$3)`, [actor, `h4-upgrade-${actor}@example.test`, now]);
      await upgrade.query(`INSERT INTO "AuthSession"("id","adminUserId","nonceCiphertext","nonceIv","nonceTag","nonceVersion","createdAt","lastActivityAt","absoluteExpiresAt","idleExpiresAt") VALUES ($1,$2,$3,$4,$5,1,$6,$6,$7,$7)`, [sessionId, actor, randomBytes(32), randomBytes(12), randomBytes(16), now, new Date(now.getTime() + 60_000)]);
      await upgrade.query(`INSERT INTO "Category"("id","name","slug") VALUES ($1,'H4 preserved category',$2)`, [category, `h4-preserved-${category}`]);
      await upgrade.query(`INSERT INTO "Product"("id","categoryId","name","slug","updatedAt") VALUES ($1,$2,'H4 preserved product',$3,$4)`, [product, category, `h4-preserved-${product}`, now]);
      await upgrade.query(`INSERT INTO "ProductPresentation"("id","productId","unit","amountMinor") VALUES ($1,$2,'UNIT',4321)`, [presentation, product]);
      await upgrade.query(`INSERT INTO "StockBalance"("presentationId","availableQuantity") VALUES ($1,7)`, [presentation]);
      const quoteResponse = { quoteId: quote, stateFingerprint: '0'.repeat(64), items: [], subtotal: { amountMinor: '0', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' }, total: { amountMinor: '0', currency: 'ARS' }, deliveryMode: 'PICKUP', paymentMethod: { code: 'DEMO_PAY_ON_PICKUP' }, policyVersion: 1 };
      await upgrade.query(`INSERT INTO "CheckoutQuote"("id","policyVersion","stateFingerprint","response","createdAt","expiresAt") VALUES ($1,1,$2,$3,$4,$5)`, [quote, '0'.repeat(64), quoteResponse, now, new Date(now.getTime() + 60_000)]);
      await upgrade.query('COMMIT');
      const beforeUpgrade = await upgrade.query(preservationSql);
      h3PreservationHash = createHash('sha256').update(beforeUpgrade.rows[0].snapshot).digest('hex');
    } catch (error) { await upgrade.query('ROLLBACK'); throw error; }
    finally { await upgrade.end(); }
    await applyMigrations(urls.upgrade, [h4[0]]);
    const verify = new pg.Client({ connectionString: urls.upgrade }); await verify.connect();
    try {
      const preserved = await verify.query(`SELECT (SELECT count(*) FROM "AdminUser")::int AS admins,(SELECT count(*) FROM "AuthSession")::int AS sessions,(SELECT count(*) FROM "CheckoutQuote")::int AS quotes,(SELECT "availableQuantity" FROM "StockBalance" WHERE "presentationId"=$1)::int AS quantity`, [presentation]);
      expect(preserved.rows[0]).toEqual({ admins: 1, sessions: 1, quotes: 1, quantity: 7 });
      const afterUpgrade = await verify.query(preservationSql);
      expect(createHash('sha256').update(afterUpgrade.rows[0].snapshot).digest('hex')).toBe(h3PreservationHash!);
    } finally { await verify.end(); }

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urls.clean }) }); await prisma.$connect();
    checkout = new CheckoutService(prisma as never);
    const categoryRow = await prisma.category.create({ data: { name: 'H4 fictitious category', slug: `h4-${randomUUID()}` } });
    const productRow = await prisma.product.create({ data: { categoryId: categoryRow.id, name: 'H4 demo cable', slug: `h4-${randomUUID()}`,
      presentations: { create: [{ unit: 'UNIT', amountMinor: 100n, isDefault: true, balance: { create: { availableQuantity: 2 } } }] } }, include: { presentations: true } });
    presentationId = productRow.presentations[0].id;
    const config = { get: (name: string, fallback?: unknown) => name === 'H4_ACCESS_TTL_SECONDS' ? 3600 : name === 'H4_DEMO_SIMULATION_ENABLED' ? simulationEnabled : name === 'H4_REPLAY_KEY_BASE64' ? Buffer.alloc(32, 9).toString('base64') : fallback };
    const orders = new OrdersService(prisma as never, checkout, config as never);
    const limiter = new PublicCheckoutRateLimiter({ limit: 200, windowMs: 60_000 });
    const testing = await Test.createTestingModule({ controllers: [CheckoutController, OrdersController], providers: [
      { provide: CheckoutService, useValue: checkout }, { provide: OrdersService, useValue: orders },
      { provide: PublicCheckoutRateLimiter, useValue: limiter },
    ] }).compile();
    application = testing.createNestApplication(); application.use(createOrdersJsonRouter()); await application.init(); server = application.getHttpServer();
    startStockHash = await stockHash();
  }, 30_000);

  afterAll(async () => { if (application) await application.close(); if (prisma) await prisma.$disconnect(); });

  async function stockHash() {
    const balances = await prisma.stockBalance.findMany({ orderBy: { presentationId: 'asc' } });
    const operations = await prisma.stockOperation.findMany({ orderBy: { id: 'asc' } });
    const entries = await prisma.stockEntry.findMany({ orderBy: [{ operationId: 'asc' }, { presentationId: 'asc' }] });
    return createHash('sha256').update(JSON.stringify({ balances, operations, entries }, (_, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
  }

  async function h4PersistenceHash() {
    const tables = ['Order', 'OrderItem', 'Payment', 'PaymentAttempt', 'OrderEvent', 'OrderIdempotencyKey', 'NotificationJob', 'StockBalance', 'StockOperation', 'StockEntry'];
    const snapshots = await Promise.all(tables.map(async (table) => {
      const result = await prisma.$queryRawUnsafe<Array<{ rows: string }>>(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS rows FROM "${table}" t`);
      return [table, result[0].rows];
    }));
    return createHash('sha256').update(JSON.stringify(snapshots)).digest('hex');
  }

  it('atomically creates one order and returns the exact encrypted replay before quote expiry', async () => {
    const quote = await checkout.createQuote(quoteRequest(presentationId));
    const body = createBody(quote.quoteId); const idem = key();
    const first = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', idem).send(body).expect(201).expect('Cache-Control', 'no-store');
    expect(first.body).toMatchObject({ orderStatus: 'RECEIVED', paymentStatus: 'PENDING', demoMode: true, total: { amountMinor: '100', currency: 'ARS' } });
    expect(first.body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(first.body)).not.toContain('buyer@example.test');
    await prisma.checkoutQuote.update({ where: { id: quote.quoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const replay = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', idem).send(body).expect(201).expect('Cache-Control', 'no-store');
    expect(replay.body).toEqual(first.body);
    expect(await prisma.order.count({ where: { quoteId: quote.quoteId } })).toBe(1);
    expect(await prisma.orderItem.count({ where: { orderId: first.body.orderId } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: first.body.orderId } })).toBe(1);
    expect(await prisma.paymentAttempt.count({ where: { payment: { orderId: first.body.orderId } } })).toBe(1);
    expect(await prisma.orderEvent.count({ where: { orderId: first.body.orderId } })).toBe(2);
    expect(await prisma.notificationJob.count({ where: { orderId: first.body.orderId, state: 'PENDING' } })).toBe(2);
    const stored = await prisma.order.findUnique({ where: { id: first.body.orderId } });
    expect(stored?.accessTokenHash).not.toContain(first.body.accessToken);
    const idemStored = await prisma.orderIdempotencyKey.findUnique({ where: { scope_key: { scope: 'create-order', key: idem } } });
    expect(Buffer.from(idemStored!.responseCiphertext).toString('utf8')).not.toContain(first.body.accessToken);
    expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('serializes concurrent same-quote/same-key creates and rejects conflicting bodies without leaking PII', async () => {
    const quote = await checkout.createQuote(quoteRequest(presentationId)); const idem = key(); const body = createBody(quote.quoteId);
    const responses = await Promise.all([request(server).post('/api/v1/public/orders').set('Idempotency-Key', idem).send(body), request(server).post('/api/v1/public/orders').set('Idempotency-Key', idem).send(body)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]); expect(responses[0].body).toEqual(responses[1].body);
    const conflict = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', idem).send({ ...body, customer: { ...body.customer, email: 'other@example.test' } }).expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT'); expect(JSON.stringify(conflict.body)).not.toContain('other@example.test');
    expect(await prisma.order.count({ where: { quoteId: quote.quoteId } })).toBe(1);
    const raceQuote = await checkout.createQuote(quoteRequest(presentationId));
    const competing = await Promise.all([request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(raceQuote.quoteId)), request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(raceQuote.quoteId))]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.order.count({ where: { quoteId: raceQuote.quoteId } })).toBe(1);
    expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('keeps simulated APPROVED distinct from commercial payment and supports rejection/retry without stock change', async () => {
    const quote = await checkout.createQuote(quoteRequest(presentationId));
    const created = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(quote.quoteId)).expect(201);
    const access = { 'X-Order-Access-Token': created.body.accessToken };
    const approved = await request(server).post(`/api/v1/public/orders/${created.body.orderId}/payment-attempts`).set(access).set('Idempotency-Key', key()).send({ methodCode: 'DEMO_SIMULATION', scenario: 'APPROVED' }).expect(201);
    expect(approved.body).toMatchObject({ orderStatus: 'RECEIVED', paymentStatus: 'PENDING', currentAttempt: { status: 'APPROVED' } });
    const rejected = await request(server).post(`/api/v1/public/orders/${created.body.orderId}/payment-attempts`).set(access).set('Idempotency-Key', key()).send({ methodCode: 'DEMO_SIMULATION', scenario: 'REJECTED' }).expect(201);
    expect(rejected.body).toMatchObject({ orderStatus: 'RECEIVED', paymentStatus: 'REJECTED', currentAttempt: { status: 'REJECTED', sequence: 3 } });
    const recovered = await request(server).post(`/api/v1/public/orders/${created.body.orderId}/payment-attempts`).set(access).set('Idempotency-Key', key()).send({ methodCode: 'DEMO_TRANSFER' }).expect(201);
    expect(recovered.body).toMatchObject({ orderStatus: 'RECEIVED', paymentStatus: 'PENDING', currentAttempt: { methodCode: 'DEMO_TRANSFER', status: 'PENDING', sequence: 4 } });
    const view = await request(server).get(`/api/v1/public/orders/${created.body.orderId}`).set(access).expect(200).expect('Cache-Control', 'no-store');
    expect(JSON.stringify(view.body)).not.toContain('buyer@example.test'); expect(JSON.stringify(view.body)).not.toContain(created.body.accessToken);
    expect((await prisma.order.findUnique({ where: { id: created.body.orderId } }))?.status).toBe('RECEIVED');
    expect((await prisma.payment.findUnique({ where: { orderId: created.body.orderId } }))?.status).not.toBe('PAID');
    expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('uses minimum lookup output, generic contact errors, and protects the access token by possession', async () => {
    const quote = await checkout.createQuote(quoteRequest(presentationId));
    const created = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(quote.quoteId)).expect(201);
    const found = await request(server).post('/api/v1/public/orders/lookup').send({ orderNumber: created.body.orderNumber, contact: 'buyer@example.test' }).expect(200).expect('Cache-Control', 'no-store');
    expect(Object.keys(found.body).sort()).toEqual(['createdAt', 'currentAttemptStatus', 'demoMode', 'orderNumber', 'orderStatus', 'paymentStatus'].sort());
    expect(JSON.stringify(found.body)).not.toContain(created.body.accessToken); expect(JSON.stringify(found.body)).not.toContain('buyer@example.test');
    const wrong = await request(server).post('/api/v1/public/orders/lookup').send({ orderNumber: created.body.orderNumber, contact: 'wrong@example.test' }).expect(404);
    const missing = await request(server).post('/api/v1/public/orders/lookup').send({ orderNumber: `missing-${created.body.orderNumber}`, contact: 'wrong@example.test' }).expect(404);
    expect(wrong.body.code).toBe(missing.body.code);
    const otherQuote = await checkout.createQuote(quoteRequest(presentationId));
    const otherOrder = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(otherQuote.quoteId)).expect(201);
    await request(server).get(`/api/v1/public/orders/${created.body.orderId}`).expect(403).expect('Cache-Control', 'no-store');
    await request(server).get(`/api/v1/public/orders/${created.body.orderId}`).set('X-Order-Access-Token', 'A'.repeat(43)).expect(403);
    await request(server).get(`/api/v1/public/orders/${created.body.orderId}`).set('X-Order-Access-Token', otherOrder.body.accessToken).expect(403);
    await request(server).get(`/api/v1/public/orders/${created.body.orderId}`).set('X-Order-Access-Token', created.body.accessToken).expect(200);
    expect((await prisma.order.findUnique({ where: { id: created.body.orderId } }))?.status).toBe('RECEIVED');
    expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('rejects missing configuration and invalid bodies before persisted side effects', async () => {
    const terms = await request(server).get('/api/v1/public/checkout/terms').expect(200).expect('Cache-Control', 'no-store');
    expect(terms.body).toEqual({ version: termsVersion, text: termsText, demoMode: true, simulationEnabled: true });
    const quote = await checkout.createQuote(quoteRequest(presentationId));
    const before = await prisma.order.count();
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send({ ...createBody(quote.quoteId), unexpected: 'reject' }).expect(400).expect('Cache-Control', 'no-store');
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send({ ...createBody(quote.quoteId), acceptedTermsVersion: 'old-demo-terms' }).expect(400).expect('Cache-Control', 'no-store');
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', 'too-short').send(createBody(quote.quoteId)).expect(400).expect('Cache-Control', 'no-store');
    expect(await prisma.order.count()).toBe(before); expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('requires coordinated delivery data and persists the exact terms version while pickup never stores an address', async () => {
    await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: { feeMinor: 250n, version: { increment: 1 } } });
    const coordinatedQuote = await checkout.createQuote({ items: [{ presentationId, quantity: 1 }], deliveryMode: 'COORDINATED', paymentMethodCode: 'DEMO_TRANSFER' });
    const coordinatedBody = createBody(coordinatedQuote.quoteId);
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(coordinatedBody).expect(400);
    const before = await prisma.order.count();
    const coordinated = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send({ ...coordinatedBody,
      deliveryDetails: { addressLine: '123 Demo Street', locality: 'Fictitious Town', instructions: 'Leave at reception' } }).expect(201);
    const stored = await prisma.order.findUnique({ where: { id: coordinated.body.orderId } });
    expect(stored).toMatchObject({ deliveryMode: 'COORDINATED', deliveryAddressLine: '123 Demo Street', deliveryLocality: 'Fictitious Town', acceptedTermsVersion: termsVersion, version: 1 });
    expect(await prisma.order.count()).toBe(before + 1);
    const pickupQuote = await checkout.createQuote(quoteRequest(presentationId));
    const pickup = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send({ ...createBody(pickupQuote.quoteId),
      deliveryDetails: { addressLine: 'must not persist', locality: 'ignored' } }).expect(201);
    const pickupStored = await prisma.order.findUnique({ where: { id: pickup.body.orderId } });
    expect(pickupStored).toMatchObject({ deliveryMode: 'PICKUP', deliveryAddressLine: null, deliveryLocality: null, acceptedTermsVersion: termsVersion });
  }, 20_000);

  it('rejects expired, already-used, policy-changed, price-changed and insufficient quotes without partial orders', async () => {
    const expiredQuote = await checkout.createQuote(quoteRequest(presentationId));
    await prisma.checkoutQuote.update({ where: { id: expiredQuote.quoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(expiredQuote.quoteId)).expect(409);

    const usedQuote = await checkout.createQuote(quoteRequest(presentationId));
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(usedQuote.quoteId)).expect(201);
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(usedQuote.quoteId)).expect(409);

    const changedPriceQuote = await checkout.createQuote(quoteRequest(presentationId));
    await prisma.productPresentation.update({ where: { id: presentationId }, data: { amountMinor: { increment: 1n }, version: { increment: 1 } } });
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(changedPriceQuote.quoteId)).expect(409);
    await prisma.productPresentation.update({ where: { id: presentationId }, data: { amountMinor: { decrement: 1n }, version: { increment: 1 } } });

    const hiddenQuote = await checkout.createQuote(quoteRequest(presentationId));
    const productId = (await prisma.productPresentation.findUnique({ where: { id: presentationId }, select: { productId: true } }))!.productId;
    await prisma.product.update({ where: { id: productId }, data: { active: false, version: { increment: 1 } } });
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(hiddenQuote.quoteId)).expect(409);
    await prisma.product.update({ where: { id: productId }, data: { active: true, version: { increment: 1 } } });

    const changedPolicyQuote = await checkout.createQuote(quoteRequest(presentationId));
    await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: { feeMinor: { increment: 1n }, version: { increment: 1 } } });
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(changedPolicyQuote.quoteId)).expect(409);
    await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: { feeMinor: { decrement: 1n }, version: { increment: 1 } } });

    const shortageQuote = await checkout.createQuote(quoteRequest(presentationId));
    await prisma.stockBalance.update({ where: { presentationId }, data: { availableQuantity: 0 } });
    await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(shortageQuote.quoteId)).expect(409);
    await prisma.stockBalance.update({ where: { presentationId }, data: { availableQuantity: 2 } });
    expect(await prisma.order.count({ where: { quoteId: { in: [expiredQuote.quoteId, changedPriceQuote.quoteId, hiddenQuote.quoteId, changedPolicyQuote.quoteId, shortageQuote.quoteId] } } })).toBe(0);
    expect(await stockHash()).toBe(startStockHash);
  }, 30_000);

  it('rolls back every order side effect when the database rejects notification-job persistence', async () => {
    const quote = await checkout.createQuote(quoteRequest(presentationId));
    const beforeHash = await h4PersistenceHash();
    const before = await prisma.$queryRaw<Array<{ orders: bigint; items: bigint; payments: bigint; attempts: bigint; events: bigint; jobs: bigint; idem: bigint }>>`
      SELECT (SELECT count(*) FROM "Order") orders,(SELECT count(*) FROM "OrderItem") items,
      (SELECT count(*) FROM "Payment") payments,(SELECT count(*) FROM "PaymentAttempt") attempts,
      (SELECT count(*) FROM "OrderEvent") events,(SELECT count(*) FROM "NotificationJob") jobs,
      (SELECT count(*) FROM "OrderIdempotencyKey") idem`;
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION h4_reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback injection'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER h4_reject_notification BEFORE INSERT ON "NotificationJob" FOR EACH ROW EXECUTE FUNCTION h4_reject_notification()`);
    try {
      await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(quote.quoteId)).expect(503).expect('Cache-Control', 'no-store');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS h4_reject_notification ON "NotificationJob"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS h4_reject_notification()');
    }
    const after = await prisma.$queryRaw<Array<{ orders: bigint; items: bigint; payments: bigint; attempts: bigint; events: bigint; jobs: bigint; idem: bigint }>>`
      SELECT (SELECT count(*) FROM "Order") orders,(SELECT count(*) FROM "OrderItem") items,
      (SELECT count(*) FROM "Payment") payments,(SELECT count(*) FROM "PaymentAttempt") attempts,
      (SELECT count(*) FROM "OrderEvent") events,(SELECT count(*) FROM "NotificationJob") jobs,
      (SELECT count(*) FROM "OrderIdempotencyKey") idem`;
    expect(after).toEqual(before);
    expect(await h4PersistenceHash()).toBe(beforeHash);
    expect(await prisma.order.findUnique({ where: { quoteId: quote.quoteId } })).toBeNull();
    expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('uses attempt idempotency, rejects manual scenarios, honors server demo disable, and keeps expired access separate', async () => {
    const quote = await checkout.createQuote(quoteRequest(presentationId));
    const created = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(quote.quoteId)).expect(201);
    const route = `/api/v1/public/orders/${created.body.orderId}/payment-attempts`;
    const headers = { 'X-Order-Access-Token': created.body.accessToken };
    await request(server).post(route).set(headers).set('Idempotency-Key', key()).send({ methodCode: 'DEMO_TRANSFER', scenario: 'APPROVED' }).expect(400);
    const attemptKey = key();
    const attempt = await request(server).post(route).set(headers).set('Idempotency-Key', attemptKey).send({ methodCode: 'DEMO_SIMULATION', scenario: 'PENDING' }).expect(201);
    const replay = await request(server).post(route).set(headers).set('Idempotency-Key', attemptKey).send({ methodCode: 'DEMO_SIMULATION', scenario: 'PENDING' }).expect(201);
    expect(replay.body).toEqual(attempt.body);
    const conflicting = await request(server).post(route).set(headers).set('Idempotency-Key', attemptKey).send({ methodCode: 'DEMO_SIMULATION', scenario: 'REJECTED' }).expect(409);
    expect(conflicting.body.code).toBe('IDEMPOTENCY_CONFLICT');
    const raceKey = key();
    const concurrent = await Promise.all([request(server).post(route).set(headers).set('Idempotency-Key', raceKey).send({ methodCode: 'DEMO_TRANSFER' }), request(server).post(route).set(headers).set('Idempotency-Key', raceKey).send({ methodCode: 'DEMO_TRANSFER' })]);
    expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
    expect(concurrent[0].body).toEqual(concurrent[1].body);
    const staleReplay = await request(server).post(route).set(headers).set('Idempotency-Key', attemptKey).send({ methodCode: 'DEMO_SIMULATION', scenario: 'PENDING' }).expect(201);
    expect(staleReplay.body).toEqual(attempt.body);
    expect((await prisma.payment.findUnique({ where: { orderId: created.body.orderId } }))?.currentAttemptId).toBe(concurrent[0].body.currentAttempt.id);
    simulationEnabled = false;
    await request(server).post(route).set(headers).set('Idempotency-Key', key()).send({ methodCode: 'DEMO_SIMULATION', scenario: 'APPROVED' }).expect(403);
    simulationEnabled = true;
    await prisma.order.update({ where: { id: created.body.orderId }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
    await request(server).get(`/api/v1/public/orders/${created.body.orderId}`).set(headers).expect(403);
    expect((await prisma.order.findUnique({ where: { id: created.body.orderId } }))?.status).toBe('RECEIVED');
    expect(await stockHash()).toBe(startStockHash);
  }, 20_000);

  it('reports requested unpaid demand per presentation without reserving stock', async () => {
    const admin = { authorizeCatalog: jest.fn().mockResolvedValue({ recheck: jest.fn() }) };
    const stock = new StockService(prisma as never, admin as never);
    for (let index = 0; index < 2; index++) {
      const quote = await checkout.createQuote(quoteRequest(presentationId, 2));
      const created = await request(server).post('/api/v1/public/orders').set('Idempotency-Key', key()).send(createBody(quote.quoteId)).expect(201);
      if (index === 0) await request(server).post(`/api/v1/public/orders/${created.body.orderId}/payment-attempts`).set('X-Order-Access-Token', created.body.accessToken)
        .set('Idempotency-Key', key()).send({ methodCode: 'DEMO_SIMULATION', scenario: 'REJECTED' }).expect(201);
    }
    const response = await stock.list({ query: { productId: (await prisma.productPresentation.findUnique({ where: { id: presentationId }, select: { productId: true } }))!.productId } });
    const row = response.items.find((item) => item.presentationId === presentationId)!;
    expect(row.availableQuantity).toBe(2); expect(row.requestedUnpaidQuantity).toBeGreaterThan(row.availableQuantity);
    expect(await stockHash()).toBe(startStockHash);
  }, 30_000);

  it('enforces the public rate limiter on order routes with a no-store generic error', async () => {
    const limiter = new PublicCheckoutRateLimiter({ limit: 2, windowMs: 60_000 });
    const testing = await Test.createTestingModule({ controllers: [CheckoutController, OrdersController], providers: [
      { provide: CheckoutService, useValue: checkout }, { provide: OrdersService, useValue: application.get(OrdersService) },
      { provide: PublicCheckoutRateLimiter, useValue: limiter },
    ] }).compile();
    const limitedApplication = testing.createNestApplication();
    limitedApplication.use(createOrdersJsonRouter()); await limitedApplication.init();
    try {
      const limitedServer = limitedApplication.getHttpServer();
      const firstMissing = await request(limitedServer).post('/api/v1/public/orders/lookup').send({ orderNumber: 'unknown-one', contact: 'nobody@example.test' }).expect(404).expect('Cache-Control', 'no-store');
      const secondMissing = await request(limitedServer).post('/api/v1/public/orders/lookup').send({ orderNumber: 'unknown-two', contact: 'other@example.test' }).expect(404).expect('Cache-Control', 'no-store');
      expect(firstMissing.body.code).toBe(secondMissing.body.code);
      expect(firstMissing.body.message).toBe(secondMissing.body.message);
      const limited = await request(limitedServer).post('/api/v1/public/orders/lookup').send({ orderNumber: 'unknown-three', contact: 'third@example.test' }).expect(429).expect('Cache-Control', 'no-store');
      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', message: expect.any(String), requestId: expect.any(String) });
      expect(JSON.stringify(limited.body)).not.toContain('third@example.test');
    } finally { await limitedApplication.close(); }
  }, 20_000);
});
