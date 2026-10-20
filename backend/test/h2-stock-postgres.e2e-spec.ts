import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { validateAuthConfig } from '../src/auth/auth.config';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';
import { StockService } from '../src/stock/stock.service';

const databaseUrl = process.env.H2_STOCK_DATABASE_URL;
const containerId = process.env.H2_STOCK_CONTAINER_ID;
const owner = process.env.H2_STOCK_OWNER;
const dockerHost = 'unix:///Users/agustin/.docker/run/docker.sock';
const describeOwned = databaseUrl && containerId && owner ? describe : describe.skip;
const migrationsPath = resolve(__dirname, '../prisma/migrations');
const origin = 'http://127.0.0.1:4200';

type Fixture = { productId: string; rollId: string; meterId: string };

function assertOwnedLoopbackFixture(): void {
  const url = new URL(databaseUrl!);
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
  expect(url.pathname).toBe('/h2_stock');
  expect(url.username).toBe('h2_stock');
  expect(containerId).toMatch(/^[0-9a-f]{64}$/);
  expect(owner).toMatch(/^[0-9a-f-]{36}$/i);
  const container = JSON.parse(execFileSync('docker', ['--host', dockerHost, 'inspect', containerId!], { encoding: 'utf8' }))[0];
  expect(container.Id).toBe(containerId);
  expect(container.Config.Image).toBe('postgres:17.11-bookworm');
  expect(container.Config.Labels['com.abar.h2-stock-owner']).toBe(owner);
  expect(container.Config.Labels['com.abar.h2-stock-purpose']).toBe('integration');
  expect(container.State.Running).toBe(true);
  expect(container.Mounts).toHaveLength(0);
  expect(Object.keys(container.HostConfig.Tmpfs)).toEqual(['/var/lib/postgresql/data']);
  expect(container.HostConfig.Binds ?? []).toHaveLength(0);
  const bindings = container.NetworkSettings.Ports['5432/tcp'];
  expect(bindings).toHaveLength(1);
  expect(bindings[0].HostIp).toBe('127.0.0.1');
  expect(bindings[0].HostPort).toBe(url.port);
}

describeOwned('H2 stock behavior on independently verified disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: StockService;
  let actorId: string;
  let sessionId: string;
  let actorToken: string;
  let csrfToken: string;
  beforeAll(async () => {
    assertOwnedLoopbackFixture();
    const client = new pg.Client({ connectionString: databaseUrl! });
    await client.connect();
    const initialTables = await client.query(
      `SELECT count(*)::bigint AS count FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%' AND tablename <> 'sql_features'`,
    );
    expect(Number(initialTables.rows[0].count)).toBe(0);
    const migrationNames = (await readdir(migrationsPath)).filter((entry) => /^\d+_/.test(entry)).sort();
    expect(migrationNames).toHaveLength(5); // H2's four historical migrations plus the additive H3 quote schema.
    for (const migration of migrationNames) {
      await client.query(await readFile(resolve(migrationsPath, migration, 'migration.sql'), 'utf8'));
    }
    await client.end();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.$connect();

    const user = await prisma.adminUser.create({ data: {
      name: 'Stock test actor', email: `stock-${randomUUID()}@example.invalid`, passwordHash: 'unused-fixture-value',
      active: true, mustChangePassword: false,
    } });
    actorId = user.id;
    actorToken = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32);
    csrfToken = nonce.toString('base64url');
    sessionId = createHash('sha256').update(actorToken).digest('hex');
    const cipher = createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: randomBytes(32).toString('base64url') });
    const envelope = cipher.encrypt('session', sessionId, 1, nonce);
    const now = new Date();
    await prisma.authSession.create({ data: {
      id: sessionId, adminUserId: actorId,
      nonceCiphertext: Uint8Array.from(envelope.ciphertext), nonceIv: Uint8Array.from(envelope.iv), nonceTag: Uint8Array.from(envelope.tag),
      nonceVersion: 1, createdAt: now, lastActivityAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 60_000), idleExpiresAt: new Date(now.getTime() + 60_000),
    } });
    nonce.fill(0);
    const config = validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin });
    const admins = new AdminUsersService(prisma as never, cipher, config, { hash: async () => 'unused' }, { hasDigest: () => false });
    service = new StockService(prisma as never, admins);
  }, 30_000);

  afterAll(async () => { if (prisma) await prisma.$disconnect(); });

  async function stockProduct(rollQuantity: number, meterQuantity: number, length = 100): Promise<Fixture> {
    const category = await prisma.category.create({ data: { name: `Stock ${randomUUID()}`, slug: `stock-${randomUUID()}` } });
    const product = await prisma.product.create({ data: {
      categoryId: category.id, name: 'Fictitious stock cable', slug: `stock-${randomUUID()}`,
      presentations: { create: [
        { unit: 'ROLL', rollLengthMeters: length, amountMinor: 10000n, isDefault: true, balance: { create: { availableQuantity: rollQuantity } } },
        { unit: 'METER', amountMinor: 200n, isDefault: false, balance: { create: { availableQuantity: meterQuantity } } },
      ] },
    }, include: { presentations: true } });
    return { productId: product.id, rollId: product.presentations.find((entry) => entry.unit === 'ROLL')!.id, meterId: product.presentations.find((entry) => entry.unit === 'METER')!.id };
  }

  function mutation(body: unknown, key: string) {
    return { body, idempotencyKey: key, cookieHeader: `abar_admin_session=${actorToken}`, origin, csrfToken };
  }

  async function expectFailure(promise: Promise<unknown>, code: string, expectedStatus: number): Promise<void> {
    let failure: unknown;
    try { await promise; } catch (error) { failure = error; }
    expect(failure).toBeDefined();
    expect((failure as { getStatus: () => number }).getStatus()).toBe(expectedStatus);
    expect((failure as { getResponse: () => unknown }).getResponse()).toBe(code);
  }

  it('converts one 100m roll from the stored length with exactly two audit entries', async () => {
    const fixture = await stockProduct(3, 20);
    const result = await service.openRolls(mutation({ productId: fixture.productId, rollQuantity: 1, reason: ' Physical opening ', expectedVersions: { roll: 1, meter: 1 } }, randomUUID()));
    expect(result.reason).toBe('Physical opening');
    expect(result.entries).toHaveLength(2);
    expect(await prisma.stockBalance.findUnique({ where: { presentationId: fixture.rollId } })).toMatchObject({ availableQuantity: 2, version: 2 });
    expect(await prisma.stockBalance.findUnique({ where: { presentationId: fixture.meterId } })).toMatchObject({ availableQuantity: 120, version: 2 });
    expect(await prisma.stockEntry.count({ where: { operationId: result.id } })).toBe(2);
  }, 20_000);

  it('serializes two openings competing for the last closed roll', async () => {
    const fixture = await stockProduct(1, 0);
    const request = (key: string) => service.openRolls(mutation({ productId: fixture.productId, rollQuantity: 1, reason: 'competing open', expectedVersions: { roll: 1, meter: 1 } }, key));
    const outcomes = await Promise.allSettled([request(randomUUID()), request(randomUUID())]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(await prisma.stockBalance.findUnique({ where: { presentationId: fixture.rollId } })).toMatchObject({ availableQuantity: 0, version: 2 });
    expect(await prisma.stockBalance.findUnique({ where: { presentationId: fixture.meterId } })).toMatchObject({ availableQuantity: 100, version: 2 });
    expect(await prisma.stockOperation.count({ where: { actorAdminUserId: actorId, type: 'ROLL_OPENING' } })).toBe(2);
  }, 20_000);

  it('serializes an opening against an adjustment on the same presentation', async () => {
    const fixture = await stockProduct(2, 0);
    const outcomes = await Promise.allSettled([
      service.openRolls(mutation({ productId: fixture.productId, rollQuantity: 1, reason: 'open', expectedVersions: { roll: 1, meter: 1 } }, randomUUID())),
      service.adjust(mutation({ presentationId: fixture.rollId, delta: -1, reason: 'count', expectedVersion: 1 }, randomUUID())),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const rollBalance = await prisma.stockBalance.findUnique({ where: { presentationId: fixture.rollId } });
    expect(rollBalance).toMatchObject({ availableQuantity: 1, version: 2 });
    const meterBalance = await prisma.stockBalance.findUnique({ where: { presentationId: fixture.meterId } });
    expect([0, 100]).toContain(meterBalance!.availableQuantity);
    expect(await prisma.stockOperation.count({ where: { actorAdminUserId: actorId, entries: { some: { presentationId: { in: [fixture.rollId, fixture.meterId] } } } } })).toBe(1);
  }, 20_000);

  it('replays same actor/key/body before stale versions, and conflicts across operation type/body', async () => {
    const fixture = await stockProduct(2, 0);
    const body = { presentationId: fixture.rollId, delta: 1, reason: 'count', expectedVersion: 1 };
    const first = await service.adjust(mutation(body, 'cross-kind-key'));
    const replay = await service.adjust(mutation({ ...body, reason: 'count', delta: 1, presentationId: fixture.rollId, expectedVersion: 1 }, 'cross-kind-key'));
    expect(replay).toEqual(first);
    await expectFailure(service.adjust(mutation({ ...body, delta: -1 }, 'cross-kind-key')), 'IDEMPOTENCY_CONFLICT', 409);
    await expectFailure(service.openRolls(mutation({ productId: fixture.productId, rollQuantity: 1, reason: 'open', expectedVersions: { roll: 1, meter: 1 } }, 'cross-kind-key')), 'IDEMPOTENCY_CONFLICT', 409);
    expect(await prisma.stockBalance.findUnique({ where: { presentationId: fixture.rollId } })).toMatchObject({ availableQuantity: 3, version: 2 });
    expect(await prisma.stockOperation.count({ where: { actorAdminUserId: actorId, idempotencyKey: 'cross-kind-key' } })).toBe(1);
  }, 20_000);

  it('leaves balance, operations and entries unchanged after an insufficient-roll rollback', async () => {
    const fixture = await stockProduct(0, 25);
    const snapshot = async () => {
      const values = {
        balances: await prisma.stockBalance.findMany({ where: { presentationId: { in: [fixture.rollId, fixture.meterId] } }, orderBy: { presentationId: 'asc' } }),
        operations: await prisma.stockOperation.findMany({ where: { actorAdminUserId: actorId }, orderBy: { id: 'asc' } }),
        entries: await prisma.stockEntry.findMany({ where: { presentationId: { in: [fixture.rollId, fixture.meterId] } }, orderBy: [{ operationId: 'asc' }, { presentationId: 'asc' }] }),
      };
      return createHash('sha256').update(JSON.stringify(values, (_, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
    };
    const before = await snapshot();
    await expectFailure(service.openRolls(mutation({ productId: fixture.productId, rollQuantity: 1, reason: 'too many', expectedVersions: { roll: 1, meter: 1 } }, randomUUID())), 'INSUFFICIENT_ROLLS', 409);
    expect(await snapshot()).toBe(before);
  }, 20_000);

  it('rejects inactive administrators and revoked sessions before any stock mutation', async () => {
    const fixture = await stockProduct(2, 0);
    await prisma.adminUser.update({ where: { id: actorId }, data: { active: false } });
    await expectFailure(service.adjust(mutation({ presentationId: fixture.rollId, delta: 1, reason: 'inactive', expectedVersion: 1 }, randomUUID())), 'SESSION_EXPIRED', 401);
    await prisma.adminUser.update({ where: { id: actorId }, data: { active: true } });
    await prisma.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await expectFailure(service.adjust(mutation({ presentationId: fixture.rollId, delta: 1, reason: 'revoked', expectedVersion: 1 }, randomUUID())), 'SESSION_EXPIRED', 401);
    expect(await prisma.stockBalance.findUnique({ where: { presentationId: fixture.rollId } })).toMatchObject({ availableQuantity: 2, version: 1 });
  }, 20_000);
});
