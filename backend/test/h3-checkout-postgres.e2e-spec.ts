import { createHash } from 'node:crypto';
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

const cleanUrl = process.env.H3_CHECKOUT_DATABASE_URL;
const upgradeUrl = process.env.H3_CHECKOUT_UPGRADE_DATABASE_URL;
const containerId = process.env.H3_CHECKOUT_CONTAINER_ID;
const owner = process.env.H3_CHECKOUT_OWNER;
const describeOwned = cleanUrl && upgradeUrl && containerId && owner ? describe : describe.skip;
const migrationsPath = resolve(__dirname, '../prisma/migrations');
const dockerHost = 'unix:///Users/agustin/.docker/run/docker.sock';
const H2_MIGRATIONS = 4;

function assertOwnedFixture(): { clean: URL; upgrade: URL } {
  const clean = new URL(cleanUrl!);
  const upgrade = new URL(upgradeUrl!);
  for (const [url, database] of [[clean, 'h3_checkout'], [upgrade, 'h3_checkout_upgrade']] as const) {
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.pathname).toBe(`/${database}`);
    expect(url.username).toBe('h3_checkout');
  }
  expect(clean.hostname).toBe(upgrade.hostname);
  expect(clean.port).toBe(upgrade.port);
  expect(containerId).toMatch(/^[0-9a-f]{64}$/);
  expect(owner).toMatch(/^[0-9a-f-]{36}$/i);
  const container = JSON.parse(execFileSync('docker', ['--host', dockerHost, 'inspect', containerId!], { encoding: 'utf8' }))[0];
  expect(container.Id).toBe(containerId);
  expect(container.Config.Image).toBe('postgres:17.11-bookworm');
  expect(container.Config.Labels['com.abar.h3-checkout-owner']).toBe(owner);
  expect(container.Config.Labels['com.abar.h3-checkout-purpose']).toBe('integration');
  expect(container.State.Running).toBe(true);
  expect(container.Mounts).toHaveLength(0);
  expect(Object.keys(container.HostConfig.Tmpfs)).toEqual(['/var/lib/postgresql/data']);
  expect(container.HostConfig.Binds ?? []).toHaveLength(0);
  const bindings = container.NetworkSettings.Ports['5432/tcp'];
  expect(bindings).toHaveLength(1);
  expect(bindings[0].HostIp).toBe('127.0.0.1');
  expect(bindings[0].HostPort).toBe(clean.port);
  return { clean, upgrade };
}

async function applyMigrations(connectionString: string, migrations: string[]): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const migration of migrations) {
      await client.query(await readFile(resolve(migrationsPath, migration, 'migration.sql'), 'utf8'));
    }
  } finally { await client.end(); }
}

async function assertEmptyDatabase(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT count(*)::bigint AS count FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%' AND tablename <> 'sql_features'`,
    );
    expect(Number(result.rows[0].count)).toBe(0);
  } finally { await client.end(); }
}

const quoteRequest = (presentationId: string, quantity = 1) => ({
  items: [{ presentationId, quantity }], deliveryMode: 'COORDINATED', paymentMethodCode: 'DEMO_TRANSFER',
});

describeOwned('H3 checkout on an explicitly owned PostgreSQL fixture', () => {
  let prisma: PrismaClient;
  let service: CheckoutService;
  let categoryId: string;
  let productId: string;
  let presentationId: string;
  let application: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const urls = assertOwnedFixture();
    const migrations = (await readdir(migrationsPath)).filter((entry) => /^\d+_/.test(entry)).sort();
    expect(migrations).toHaveLength(H2_MIGRATIONS + 1);
    const h2 = migrations.slice(0, H2_MIGRATIONS);
    const h3 = migrations[H2_MIGRATIONS];

    await assertEmptyDatabase(cleanUrl!);
    await applyMigrations(cleanUrl!, migrations);
    await assertEmptyDatabase(upgradeUrl!);
    await applyMigrations(upgradeUrl!, h2);
    const upgradeClient = new pg.Client({ connectionString: upgradeUrl! });
    await upgradeClient.connect();
    try {
      await upgradeClient.query(`INSERT INTO "Category" ("id", "name", "slug") VALUES ('51000000-0000-4000-8000-000000000001', 'Existing upgrade category', 'existing-upgrade-category')`);
      await upgradeClient.query(`INSERT INTO "Product" ("id", "categoryId", "name", "slug", "updatedAt") VALUES ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'Existing upgrade product', 'existing-upgrade-product', CURRENT_TIMESTAMP)`);
      await upgradeClient.query(`INSERT INTO "ProductPresentation" ("id", "productId", "unit", "amountMinor") VALUES ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'UNIT', 4321)`);
      await upgradeClient.query(`INSERT INTO "StockBalance" ("presentationId", "availableQuantity") VALUES ('53000000-0000-4000-8000-000000000001', 7)`);
    } finally { await upgradeClient.end(); }
    await applyMigrations(upgradeUrl!, [h3]);
    const upgraded = new pg.Client({ connectionString: upgradeUrl! });
    await upgraded.connect();
    try {
      const preserved = await upgraded.query(`SELECT p."name", pp."amountMinor", b."availableQuantity" FROM "Product" p JOIN "ProductPresentation" pp ON pp."productId"=p."id" JOIN "StockBalance" b ON b."presentationId"=pp."id" WHERE p."id"='52000000-0000-4000-8000-000000000001'`);
      expect(preserved.rows).toEqual([{ name: 'Existing upgrade product', amountMinor: '4321', availableQuantity: 7 }]);
      expect(await upgraded.query(`SELECT count(*)::int AS count FROM "CheckoutPolicy" WHERE "id"='default'`)).toMatchObject({ rows: [{ count: 1 }] });
    } finally { await upgraded.end(); }

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urls.clean.toString() }) });
    await prisma.$connect();
    service = new CheckoutService(prisma as never);
    const category = await prisma.category.create({ data: { name: 'H3 fixture category', slug: `h3-fixture-${Date.now()}` } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, name: 'Fictitious quote cable', slug: `h3-quote-${Date.now()}`, presentations: { create: [
        { unit: 'UNIT', amountMinor: 1n, isDefault: true, balance: { create: { availableQuantity: 1 } } },
        { unit: 'METER', amountMinor: 125n, balance: { create: { availableQuantity: 30 } } },
        { unit: 'ROLL', rollLengthMeters: 100, amountMinor: 12_500n, balance: { create: { availableQuantity: 4 } } },
      ] } }, include: { presentations: true },
    });
    productId = product.id;
    presentationId = product.presentations.find((item) => item.unit === 'METER')!.id;
    const testing = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
        { provide: CheckoutService, useValue: service },
        { provide: PublicCheckoutRateLimiter, useFactory: () => new PublicCheckoutRateLimiter({ limit: 3, windowMs: 60_000 }) },
      ],
    }).compile();
    application = testing.createNestApplication();
    await application.init();
    server = application.getHttpServer();
  }, 30_000);

  afterAll(async () => {
    if (application) await application.close();
    if (prisma) await prisma.$disconnect();
  });

  async function stockFingerprint(): Promise<string> {
    const balances = await prisma.stockBalance.findMany({ where: { presentation: { productId } }, orderBy: { presentationId: 'asc' } });
    const operations = await prisma.stockOperation.findMany({ orderBy: { id: 'asc' } });
    const entries = await prisma.stockEntry.findMany({ orderBy: [{ operationId: 'asc' }, { presentationId: 'asc' }] });
    return createHash('sha256').update(JSON.stringify({ balances, operations, entries }, (_, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
  }

  it('persists exact snapshots, detects changed price/fee, and never reserves or moves stock, including concurrent quotes', async () => {
    const before = await stockFingerprint();
    const original = await service.createQuote(quoteRequest(presentationId));
    expect(original.total.amountMinor).toBe('125');
    expect(await prisma.checkoutQuote.findUnique({ where: { id: original.quoteId } })).toMatchObject({
      policyVersion: 1, stateFingerprint: original.stateFingerprint, response: original,
    });
    await prisma.productPresentation.update({ where: { id: presentationId }, data: { amountMinor: 175n, version: { increment: 1 } } });
    await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: { feeMinor: 400n, version: { increment: 1 } } });
    const refreshed = await service.createQuote(quoteRequest(presentationId));
    expect(refreshed.items[0].unitPrice.amountMinor).toBe('175');
    expect(refreshed.deliveryFee.amountMinor).toBe('400');
    expect(refreshed.total.amountMinor).toBe('575');
    expect(refreshed.policyVersion).toBe(2);
    expect(refreshed.stateFingerprint).not.toBe(original.stateFingerprint);
    const concurrent = await Promise.all([service.createQuote(quoteRequest(presentationId)), service.createQuote(quoteRequest(presentationId))]);
    expect(concurrent.map((item) => item.total.amountMinor)).toEqual(['575', '575']);
    expect(await stockFingerprint()).toBe(before);
  }, 20_000);

  it('rejects invalid configuration and hidden or insufficient catalog items without leaking details or mutating stock', async () => {
    await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: { enabledDeliveryModes: [], version: { increment: 1 } } });
    await expect(service.createQuote(quoteRequest(presentationId))).rejects.toMatchObject({ status: 503 });
    await prisma.checkoutPolicy.update({ where: { id: 'default' }, data: { enabledDeliveryModes: ['PICKUP', 'COORDINATED'], version: { increment: 1 } } });
    await prisma.product.update({ where: { id: productId }, data: { active: false, version: { increment: 1 } } });
    const beforeHidden = await stockFingerprint();
    let error: unknown;
    try { await service.createQuote(quoteRequest(presentationId)); } catch (caught) { error = caught; }
    expect(error).toBeDefined();
    expect((error as { getStatus: () => number }).getStatus()).toBe(409);
    expect(JSON.stringify((error as { getResponse: () => unknown }).getResponse())).not.toContain('Fictitious quote cable');
    expect(await stockFingerprint()).toBe(beforeHidden);
    await prisma.product.update({ where: { id: productId }, data: { active: true, version: { increment: 1 } } });
    await prisma.stockBalance.update({ where: { presentationId }, data: { availableQuantity: 0 } });
    const beforeEmpty = await stockFingerprint();
    await expect(service.createQuote(quoteRequest(presentationId))).rejects.toMatchObject({ status: 409 });
    expect(await stockFingerprint()).toBe(beforeEmpty);
    await prisma.stockBalance.update({ where: { presentationId }, data: { availableQuantity: 30 } });
  }, 20_000);

  it('serves public routes without CSRF and returns a sanitized 429 after its bounded peer quota', async () => {
    const settings = await request(server).get('/api/v1/public/settings').expect(200).expect('Cache-Control', 'no-store');
    expect(settings.body).toMatchObject({ mode: 'DEMO', quoteTtlSeconds: 600, maxLines: 100, maxQuantity: 1_000_000 });
    await request(server).get('/api/v1/public/payment-methods?deliveryMode=COORDINATED').expect(200).expect('Cache-Control', 'no-store');
    await request(server).post('/api/v1/public/checkout/quotes').send(quoteRequest(presentationId)).expect(201).expect('Cache-Control', 'no-store');
    const limited = await request(server).get('/api/v1/public/settings').expect(429).expect('Cache-Control', 'no-store');
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', message: expect.any(String), requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
    expect(JSON.stringify(limited.body)).not.toContain('Fictitious quote cable');
    expect(categoryId).toBeDefined();
  }, 20_000);
});
