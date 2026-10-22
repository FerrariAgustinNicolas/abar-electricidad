import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';
import { validateAuthConfig } from '../src/auth/auth.config';
import { CheckoutService } from '../src/checkout/checkout.service';
import { OrdersService } from '../src/orders/orders.service';
import { OrdersController } from '../src/orders/orders.controller';
import { PublicCheckoutRateLimiter } from '../src/checkout/public-checkout-rate-limiter';
import { AdminOrdersService } from '../src/orders/admin-orders.service';
import { AdminOrdersController } from '../src/orders/admin-orders.controller';
import { StockService } from '../src/stock/stock.service';
import { createOrdersJsonRouter } from '../src/orders/orders-json.middleware';
const url = process.env.H5_DATABASE_URL;
const origin = 'http://127.0.0.1:4200';
const key = () => randomBytes(18).toString('base64url');
const digest = (v: string) => createHash('sha256').update(v).digest('hex');

describe('H5 on a newly owned PostgreSQL 17 fixture (required, never skipped)', () => {
  let prisma: PrismaClient; let admin: AdminOrdersService; let orders: OrdersService; let stock: StockService;
  let app: INestApplication; let actor: any; let other: any; let categoryId: string; const csrfKey = randomBytes(32).toString('base64url');
  const cipher = createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: csrfKey });
  const config = { get: (k: string) => ({ H4_REPLAY_KEY_BASE64: Buffer.alloc(32, 17).toString('base64'), H4_DEMO_SIMULATION_ENABLED: true, H4_ACCESS_TTL_SECONDS: 86400, H4_ADMIN_NOTIFICATION_EMAIL: 'admin@example.test' } as any)[k] };
  async function session() {
    const user = await prisma.adminUser.create({ data: { name: 'H5 fixture admin', email: `${randomUUID()}@example.test`, passwordHash: 'unusable', active: true, mustChangePassword: false } });
    const token = randomBytes(32).toString('base64url'); const nonce = randomBytes(32); const sessionId = digest(token); const e = cipher.encrypt('session', sessionId, 1, nonce); const now = new Date();
    await prisma.authSession.create({ data: { id: sessionId, adminUserId: user.id, nonceCiphertext: Uint8Array.from(e.ciphertext), nonceIv: Uint8Array.from(e.iv), nonceTag: Uint8Array.from(e.tag), lastActivityAt: now, absoluteExpiresAt: new Date(Date.now() + 3600000), idleExpiresAt: new Date(Date.now() + 3600000) } });
    return { user, token, sessionId, csrf: nonce.toString('base64url') };
  }
  const req = (body: any, actorValue = actor, k = key()) => ({ body, cookieHeader: `abar_admin_session=${actorValue.token}`, csrfToken: actorValue.csrf, origin, idempotencyKey: k });
  beforeAll(async () => {
    if (!url || !process.env.H5_CONTAINER_ID || !process.env.H5_OWNER) throw Error('Run backend/scripts/h5-postgres.mjs; owned fixture required');
    const parsed = new URL(url); expect(parsed.hostname).toBe('127.0.0.1'); expect(parsed.pathname).toBe('/h5_orders'); expect(parsed.username).toBe('h5_orders');
    const c = JSON.parse(execFileSync('docker', ['--host', 'unix:///Users/agustin/.docker/run/docker.sock', 'inspect', process.env.H5_CONTAINER_ID], { encoding: 'utf8' }))[0];
    expect(c.Config.Labels['com.abar.h5-owner']).toBe(process.env.H5_OWNER); expect(c.Config.Image).toBe('postgres:17.11-bookworm'); expect(c.Mounts).toHaveLength(0); expect(c.NetworkSettings.Ports['5432/tcp'][0]).toEqual({ HostIp: '127.0.0.1', HostPort: parsed.port });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const admins = new AdminUsersService(prisma as never, cipher, validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }), { hash: async () => 'unused' }, { hasDigest: () => false });
    const checkout = new CheckoutService(prisma as never);
    orders = new OrdersService(prisma as never, checkout, config as any); stock = new StockService(prisma as never, admins);
    admin = new AdminOrdersService(prisma as never, admins, orders, config as any);
    actor = await session(); other = await session(); categoryId = (await prisma.category.create({ data: { name: 'H5 fixture', slug: `h5-${randomUUID()}` } })).id;
    const module = await Test.createTestingModule({ controllers: [AdminOrdersController, OrdersController], providers: [
      { provide: AdminOrdersService, useValue: admin }, { provide: OrdersService, useValue: orders }, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: config }, PublicCheckoutRateLimiter,
    ] }).compile();
    app = module.createNestApplication(); app.use(createOrdersJsonRouter()); await app.init();
  }, 30000);
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });
  async function product(quantities: number[] = [8, 40, 3]) {
    const p = await prisma.product.create({ data: { categoryId, name: 'Fictitious cable', slug: `h5-${randomUUID()}`, presentations: { create: (['UNIT', 'METER', 'ROLL'] as const).map((unit, i) => ({ unit, rollLengthMeters: unit === 'ROLL' ? 100 : null, isDefault: i === 0, amountMinor: 1000n, balance: { create: { availableQuantity: quantities[i] } } })) } }, include: { presentations: true } });
    return p.presentations.sort((a, b) => ['UNIT', 'METER', 'ROLL'].indexOf(a.unit) - ['UNIT', 'METER', 'ROLL'].indexOf(b.unit));
  }
  async function order(lines: Array<{ id: string; quantity: number; unit: string; productId: string; rollLengthMeters: number | null }>, method = 'DEMO_TRANSFER', scenario = 'PENDING') {
    const q = await prisma.checkoutQuote.create({ data: { policyVersion: 1, stateFingerprint: '0'.repeat(64), response: {}, expiresAt: new Date(Date.now() + 60000) } });
    const token = key() + key(); const total = lines.reduce((n, l) => n + BigInt(l.quantity) * 1000n, 500n);
    const o = await prisma.order.create({ data: { orderNumber: `ABAR-H5-${randomUUID()}`, quoteId: q.id, deliveryMode: 'PICKUP', customerFirstName: 'Demo', customerLastName: 'Buyer', customerEmail: 'buyer@example.test', customerPhone: '+541155550001', acceptedTermsVersion: 'demo-2026-10-20-v1', subtotalMinor: total - 500n, deliveryFeeMinor: 500n, totalMinor: total, accessTokenHash: digest(token), accessExpiresAt: new Date(Date.now() + 600000),
      items: { create: lines.map(l => ({ presentationId: l.id, productId: l.productId, productSlug: 'demo-cable', productName: 'Frozen cable', unit: l.unit, rollLengthMeters: l.rollLengthMeters, quantity: l.quantity, unitPriceMinor: 1000n, lineTotalMinor: BigInt(l.quantity) * 1000n, snapshot: { productId: l.productId, presentationId: l.id, productSlug: 'demo-cable', productName: 'Frozen cable', unit: l.unit, rollLengthMeters: l.rollLengthMeters, quantity: l.quantity, unitPrice: { amountMinor: '1000', currency: 'ARS' }, lineTotal: { amountMinor: (BigInt(l.quantity) * 1000n).toString(), currency: 'ARS' } } })) } } });
    const p = await prisma.payment.create({ data: { orderId: o.id, amountMinor: total, status: scenario === 'REJECTED' ? 'REJECTED' : 'PENDING' } });
    const a = await prisma.paymentAttempt.create({ data: { paymentId: p.id, methodCode: method as any, status: scenario as any, demoScenario: method === 'DEMO_SIMULATION' ? scenario as any : null, sequence: 1 } });
    await prisma.payment.update({ where: { id: p.id }, data: { currentAttemptId: a.id } });
    return { ...o, paymentId: p.id, attemptId: a.id, token };
  }
  const confirm = (o: any, a = actor, k = key(), patch = {}) => admin.mutate(o.id, 'PAYMENT_CONFIRMATION', req({ expectedVersion: 1, attemptId: o.attemptId, confirmedAmount: { amountMinor: o.totalMinor.toString(), currency: 'ARS' }, ...patch }, a, k));
  const balances = async (ids: string[]) => prisma.stockBalance.findMany({ where: { presentationId: { in: ids } }, orderBy: { presentationId: 'asc' } });
  const hash = (v: any) => digest(JSON.stringify(v, (_, value) => typeof value === 'bigint' ? value.toString() : value));
  async function reject(p: Promise<unknown>, status: number, code?: string) { try { await p; throw Error('Expected rejection'); } catch (e: any) { expect(e.getStatus?.()).toBe(status); if (code) expect(e.message).toBe(code); } }

  it('H5-Q01 preserves its seven migrations and upgrades populated H4 without changing historical bytes', async () => {
    const ledger: any[] = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`; expect(ledger.filter(row => row.migration_name !== '20261022000000_h6_notifications_settings')).toHaveLength(7); expect(ledger.filter(row => row.migration_name.includes('_h6_')).map(row => row.migration_name)).toEqual(ledger.length === 8 ? ['20261022000000_h6_notifications_settings'] : []); expect([7, 8]).toContain(ledger.length);
    const upgrade = new pg.Client({ connectionString: process.env.H5_UPGRADE_DATABASE_URL }); await upgrade.connect();
    try {
      const quote = randomUUID(), oid = randomUUID(), pid = randomUUID(), aid = randomUUID();
      await upgrade.query(`INSERT INTO "CheckoutQuote"(id,"policyVersion","stateFingerprint",response,"expiresAt") VALUES($1,1,$2,'{}',now()+interval '1 hour')`, [quote, '1'.repeat(64)]);
      await upgrade.query(`INSERT INTO "Order"(id,"orderNumber","quoteId","deliveryMode","customerFirstName","customerLastName","customerEmail","customerPhone","acceptedTermsVersion","subtotalMinor","deliveryFeeMinor","totalMinor","accessTokenHash","accessExpiresAt") VALUES($1,$2,$3,'PICKUP','Demo','Upgrade','upgrade@example.test','+541155550002','demo-2026-10-20-v1',1234,0,1234,$4,now()+interval '1 hour')`, [oid, `H4-${oid}`, quote, digest(oid)]);
      await upgrade.query(`INSERT INTO "Payment"(id,"orderId","amountMinor") VALUES($1,$2,1234)`, [pid, oid]);
      await upgrade.query(`INSERT INTO "PaymentAttempt"(id,"paymentId","methodCode",status,sequence) VALUES($1,$2,'DEMO_TRANSFER','PENDING',1)`, [aid, pid]); await upgrade.query(`UPDATE "Payment" SET "currentAttemptId"=$1 WHERE id=$2`, [aid, pid]);
      await upgrade.query(`INSERT INTO "OrderEvent"("orderId","eventType",details) VALUES($1,'ORDER_CREATED','{"source":"H4"}')`, [oid]);
      const snapshot = async () => (await upgrade.query(`SELECT jsonb_build_object('order',(SELECT to_jsonb(t) FROM "Order" t WHERE id=$1),'payment',(SELECT to_jsonb(t)-'confirmedAt'-'confirmedByAdminUserId' FROM "Payment" t WHERE id=$2),'attempt',(SELECT to_jsonb(t) FROM "PaymentAttempt" t WHERE id=$3),'events',(SELECT jsonb_agg(to_jsonb(t)-'actorAdminUserId') FROM "OrderEvent" t WHERE "orderId"=$1))::text value`, [oid, pid, aid])).rows[0].value;
      const cat = randomUUID(), prod = randomUUID(), pres = randomUUID();
      await upgrade.query(`INSERT INTO "Category"(id,name,slug) VALUES($1,'H4 preserved',$2)`, [cat, `h4-${cat}`]);
      await upgrade.query(`INSERT INTO "Product"(id,"categoryId",name,slug,"updatedAt") VALUES($1,$2,'H4 frozen cable',$3,now())`, [prod, cat, `h4-${prod}`]);
      await upgrade.query(`INSERT INTO "ProductPresentation"(id,"productId",unit,"amountMinor") VALUES($1,$2,'UNIT',1234)`, [pres, prod]);
      await upgrade.query(`INSERT INTO "StockBalance"("presentationId","availableQuantity") VALUES($1,7)`, [pres]);
      await upgrade.query(`INSERT INTO "OrderItem"("orderId","presentationId","productId","productSlug","productName",unit,quantity,"unitPriceMinor","lineTotalMinor",snapshot) VALUES($1,$2,$3,'frozen','H4 frozen cable','UNIT',1,1234,1234,'{"price":"1234","immutable":true}')`, [oid, pres, prod]);
      const frozenItems = async () => (await upgrade.query(`SELECT jsonb_agg(to_jsonb(t))::text value FROM "OrderItem" t WHERE "orderId"=$1`, [oid])).rows[0].value;
      const itemsBefore = hash(await frozenItems());
      const before = hash(await snapshot());
      execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--config', process.env.H5_CONFIG!], { env: { ...process.env, H5_DATABASE_URL: process.env.H5_UPGRADE_DATABASE_URL }, stdio: 'pipe' });
      expect(hash(await frozenItems())).toBe(itemsBefore);
      expect(hash(await snapshot())).toBe(before); const after = await upgrade.query('SELECT count(*)::int count FROM _prisma_migrations WHERE finished_at IS NOT NULL'); expect(after.rows[0].count).toBe(ledger.length);
      console.log('H5-Q01 historical hash', before, 'item snapshot', itemsBefore);
      execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code', '--config', process.env.H5_CONFIG!], { cwd: require('node:path').resolve(__dirname, '..'), stdio: 'pipe' });
    } finally { await upgrade.end(); }
  });
  it('H5-Q02/Q03 simulation alone leaves stock intact; full manual confirmation debits UNIT/METER/ROLL once at historical prices', async () => {
    const p = await product(); const o = await order(p.map((x, i) => ({ ...x, quantity: i + 1 })), 'DEMO_SIMULATION', 'APPROVED');
    const before = await balances(p.map(x => x.id)); const publicBefore: any = await orders.get(o.id, o.token); expect(publicBefore.paymentStatus).toBe('PENDING'); expect(hash(await balances(p.map(x => x.id)))).toBe(hash(before));
    await prisma.productPresentation.updateMany({ where: { id: { in: p.map(x => x.id) } }, data: { amountMinor: 9999n } });
    const result: any = await confirm(o); expect(result.orderStatus).toBe('PREPARING'); expect(result.paymentStatus).toBe('PAID'); expect(result.total.amountMinor).toBe(o.totalMinor.toString());
    for (const [i, x] of p.entries()) expect((await prisma.stockBalance.findUniqueOrThrow({ where: { presentationId: x.id } })).availableQuantity).toBe([8, 40, 3][i] - i - 1);
    const op = await prisma.stockOperation.findMany({ where: { paymentId: o.paymentId }, include: { entries: true } }); expect(op).toHaveLength(1); expect(op[0].entries).toHaveLength(3); expect(op[0].entries.every(e => e.delta < 0)).toBe(true);
    expect(await prisma.orderEvent.count({ where: { orderId: o.id, eventType: 'PAYMENT_CONFIRMED', actorAdminUserId: actor.user.id } })).toBe(1); expect(await prisma.notificationJob.count({ where: { orderId: o.id } })).toBe(2);
    console.log('H5-Q03 balances hashes', hash(before), hash(await balances(p.map(x => x.id))));
  });
  it('H5-Q04/Q05 rejects invalid amount, historical/rejected/pending attempts and rolls back insufficient multi-line stock', async () => {
    const p = await product([10, 0, 1]); const o = await order(p.slice(0, 2).map(x => ({ ...x, quantity: 1 }))); const before = hash(await balances(p.map(x => x.id)));
    await reject(confirm(o, actor, key(), { confirmedAmount: { amountMinor: '1', currency: 'ARS' } }), 409, 'AMOUNT_MISMATCH');
    await reject(confirm(o, actor, key(), { attemptId: randomUUID() }), 409, 'INVALID_ATTEMPT'); await reject(confirm(o), 409, 'INSUFFICIENT_STOCK'); expect(hash(await balances(p.map(x => x.id)))).toBe(before);
    for (const status of ['PENDING', 'REJECTED']) { const x = await order([{ ...p[0], quantity: 1 }], 'DEMO_SIMULATION', status); await reject(confirm(x), 409, 'INVALID_ATTEMPT'); }
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('PENDING'); expect(await prisma.stockOperation.count({ where: { paymentId: o.paymentId } })).toBe(0);
  });
  it('H5-Q06 same key replays exact response; changed body/new key/other actor cannot debit twice', async () => {
    const p = await product(); const o = await order([{ ...p[0], quantity: 1 }]); const k = key(); const first = await confirm(o, actor, k); const before = hash(await balances(p.map(x => x.id)));
    expect(await confirm(o, actor, k)).toEqual(first); await reject(confirm(o, actor, k, { expectedVersion: 2 }), 409, 'IDEMPOTENCY_CONFLICT'); await reject(confirm(o, other), 409, 'PAYMENT_ALREADY_CONFIRMED');
    expect(hash(await balances(p.map(x => x.id)))).toBe(before); expect(await prisma.stockOperation.count({ where: { paymentId: o.paymentId } })).toBe(1);
  });
  it('H5-Q07 two admins competing for the last unit really wait on PostgreSQL locks; only one pays', async () => {
    const p = await product([1, 0, 0]); const a = await order([{ ...p[0], quantity: 1 }]), b = await order([{ ...p[0], quantity: 1 }]);
    const blocker = new pg.Client({ connectionString: url }); await blocker.connect(); await blocker.query('BEGIN'); await blocker.query('SELECT * FROM "StockBalance" WHERE "presentationId"=$1 FOR UPDATE', [p[0].id]);
    const promises = [confirm(a, actor), confirm(b, other)].map(p => p.then(value => ({ ok: true, value }), error => ({ ok: false, error })));
    let waiters = 0;
    try { for (let i = 0; i < 100; i++) { const r = await blocker.query(`SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`); waiters = r.rows[0].count; if (waiters >= 2) break; await new Promise(r => setTimeout(r, 20)); } } finally { await blocker.query('COMMIT'); await blocker.end(); }
    const results = await Promise.all(promises); expect(waiters).toBeGreaterThanOrEqual(2); expect(results.filter(x => x.ok)).toHaveLength(1); expect((await balances([p[0].id]))[0].availableQuantity).toBe(0); expect(await prisma.payment.count({ where: { orderId: { in: [a.id, b.id] }, status: 'PAID' } })).toBe(1); console.log('H5-Q07 observed lock waiters', waiters);
  });
  it('H5-Q08 confirmation races with H4 retry and H2 adjustment/opening without double effects', async () => {
    const p = await product([2, 0, 2]); const o = await order([{ ...p[0], quantity: 1 }]);
    const race = await Promise.allSettled([confirm(o, actor), orders.createAttempt(o.id, o.token, key(), { methodCode: 'DEMO_TRANSFER' })]);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payment: { include: { currentAttempt: true } } } });
    if (final.payment!.status === 'PAID') { expect(final.payment!.currentAttemptId).toBe(o.attemptId); expect(race[0].status).toBe('fulfilled'); }
    else { expect(final.version).toBe(2); expect(final.payment!.currentAttemptId).not.toBe(o.attemptId); expect(race[0].status).toBe('rejected'); }
    const a = await order([{ ...p[2], quantity: 2 }]);
    const opening = stock.openRolls(req({ productId: p[2].productId, rollQuantity: 1, reason: 'H5 real race', expectedVersions: { roll: 1, meter: 1 } }, other));
    const sell = confirm(a, actor); const both = await Promise.allSettled([opening, sell]);
    expect(both.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    const roll = (await balances([p[2].id]))[0], meter = (await balances([p[1].id]))[0];
    expect(roll.availableQuantity).toBeGreaterThanOrEqual(0);
    expect(meter.availableQuantity).toBe(both[0].status === 'fulfilled' ? 100 : 0);
    const b = await order([{ ...p[0], quantity: 1 }]); const balance = (await balances([p[0].id]))[0];
    const adjust = stock.adjust(req({ presentationId: p[0].id, delta: -balance.availableQuantity, reason: 'H5 competing adjustment', expectedVersion: balance.version }, other));
    const adjusted = await Promise.allSettled([confirm(b, actor), adjust]);
    expect(adjusted.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect((await balances([p[0].id]))[0].availableQuantity).toBeGreaterThanOrEqual(0);
  });
  it('H5 confirm versus cancel and two actors on the same payment serialize once', async () => {
    const p = await product(); const o = await order([{ ...p[0], quantity: 1 }]);
    const results = await Promise.allSettled([confirm(o, actor), admin.mutate(o.id, 'ORDER_CANCEL', req({ expectedVersion: 1, reason: 'Concurrent request' }, other))]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payment: true } });
    expect((await balances([p[0].id]))[0].availableQuantity).toBe(final.status === 'CANCELLED' ? 8 : 7);
    expect(final.payment!.status).toBe(final.status === 'CANCELLED' ? 'PENDING' : 'PAID');
    const b = await order([{ ...p[0], quantity: 1 }]); const paid = await Promise.allSettled([confirm(b, actor), confirm(b, other)]);
    expect(paid.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(await prisma.stockOperation.count({ where: { paymentId: b.paymentId } })).toBe(1);
  });
  it('H5 database constraints reject second payment-linked operations and history rewrites', async () => {
    const p = await product(); const o = await order([{ ...p[0], quantity: 1 }]); await confirm(o);
    const op = await prisma.stockOperation.findFirstOrThrow({ where: { paymentId: o.paymentId } });
    await expect(prisma.stockOperation.create({ data: { type: 'PAYMENT_CONFIRMATION', paymentId: o.paymentId, orderId: o.id, actorAdminUserId: other.user.id, reason: 'Duplicate forbidden', idempotencyKey: key(), requestHash: '0'.repeat(64) } })).rejects.toMatchObject({ code: 'P2002' });
    const event = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id } });
    await expect(prisma.orderEvent.update({ where: { id: event.id }, data: { eventType: 'ALTERED' } })).rejects.toBeDefined();
    const n: any = await admin.mutate(o.id, 'ORDER_NOTE', req({ expectedVersion: 2, text: 'Append only' }));
    await expect(prisma.orderNote.update({ where: { id: n.id }, data: { text: 'ALTERED' } })).rejects.toBeDefined();
    expect((await prisma.orderNote.findUniqueOrThrow({ where: { id: n.id } })).text).toBe('Append only'); expect(op.orderId).toBe(o.id);
  });
  it('H5 aggregates duplicate presentation lines, preserves replay pointer after PAID, and revalidates session under lock', async () => {
    const p = await product(); const o = await order([{ ...p[0], quantity: 1 }, { ...p[0], quantity: 2 }]);
    const attemptKey = key(); const attempt: any = await orders.createAttempt(o.id, o.token, attemptKey, { methodCode: 'DEMO_TRANSFER' });
    await confirm({ ...o, attemptId: attempt.currentAttempt.id }, actor, key(), { expectedVersion: 2 });
    expect((await balances([p[0].id]))[0].availableQuantity).toBe(5);
    const op = await prisma.stockOperation.findFirstOrThrow({ where: { paymentId: o.paymentId }, include: { entries: true } }); expect(op.entries).toHaveLength(1); expect(op.entries[0].delta).toBe(-3);
    expect(await orders.createAttempt(o.id, o.token, attemptKey, { methodCode: 'DEMO_TRANSFER' })).toEqual(attempt);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('PAID');
    const b = await order([{ ...p[0], quantity: 1 }]); const before = hash(await balances([p[0].id]));
    const locker = new pg.Client({ connectionString: url }); await locker.connect(); await locker.query('BEGIN'); await locker.query('SELECT id FROM "AdminUser" WHERE id=$1 FOR UPDATE', [other.user.id]);
    const action = confirm(b, other).then(() => ({ ok: true, error: null as any }), error => ({ ok: false, error }));
    let waits = 0;
    try {
      for (let n = 0; n < 100; n++) { const rows = await locker.query(`SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`); waits = rows.rows[0].count; if (waits) break; await new Promise(r => setTimeout(r, 10)); }
      await locker.query('UPDATE "AuthSession" SET "revokedAt"=now() WHERE id=$1', [other.sessionId]);
    } finally { await locker.query('COMMIT'); await locker.end(); }
    const result = await action; expect(waits).toBeGreaterThan(0); expect(result.ok).toBe(false); expect(result.error.getStatus()).toBe(401); expect(hash(await balances([p[0].id]))).toBe(before); other = await session();
  });
  it('H5-Q09 failure in operation, event or job causes total rollback', async () => {
    for (const table of ['StockOperation', 'OrderEvent', 'NotificationJob']) {
      const p = await product(); const o = await order([{ ...p[0], quantity: 1 }]); const before = hash(await balances(p.map(x => x.id)));
      await prisma.$executeRawUnsafe(`CREATE FUNCTION h5_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected test failure'; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER h5_test_reject BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION h5_test_reject()`);
      try { await reject(confirm(o), 503); } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER h5_test_reject ON "${table}"`); await prisma.$executeRawUnsafe('DROP FUNCTION h5_test_reject()'); }
      expect(hash(await balances(p.map(x => x.id)))).toBe(before); expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('PENDING'); expect(await prisma.stockOperation.count({ where: { paymentId: o.paymentId } })).toBe(0); expect(await prisma.orderEvent.count({ where: { orderId: o.id } })).toBe(0); expect(await prisma.notificationJob.count({ where: { orderId: o.id } })).toBe(0);
    }
  });
  it('H5-Q10/Q11/Q12 unpaid cancellation preserves stock; paid transitions cannot cancel or debit again', async () => {
    const p = await product();
    for (const scenario of ['PENDING', 'REJECTED']) {
      const o = await order([{ ...p[0], quantity: 1 }], 'DEMO_SIMULATION', scenario); const before = hash(await balances(p.map(x => x.id))); const k = key(); const r = req({ expectedVersion: 1, reason: 'Customer request' }, actor, k);
      const result = await admin.mutate(o.id, 'ORDER_CANCEL', r); expect(await admin.mutate(o.id, 'ORDER_CANCEL', r)).toEqual(result); expect(hash(await balances(p.map(x => x.id)))).toBe(before); await reject(orders.createAttempt(o.id, o.token, key(), { methodCode: 'DEMO_TRANSFER' }), 409);
      expect((await prisma.notificationJob.findMany({ where: { orderId: o.id }, orderBy: { kind: 'asc' } })).map(job => job.kind).sort()).toEqual(['ORDER_CANCELLED_ADMIN', 'ORDER_CANCELLED_BUYER']);
      expect((await orders.get(o.id, o.token) as any).nextActions).not.toContain('RETRY_PAYMENT');
    }
    const o = await order([{ ...p[0], quantity: 1 }]); await reject(admin.mutate(o.id, 'ORDER_STATUS', req({ expectedVersion: 1, status: 'READY' })), 409); await confirm(o); const before = hash(await balances(p.map(x => x.id)));
    for (const [version, status] of [[2, 'READY'], [3, 'DELIVERED']] as const) { await reject(admin.mutate(o.id, 'ORDER_CANCEL', req({ expectedVersion: version, reason: 'Forbidden' })), 409); await admin.mutate(o.id, 'ORDER_STATUS', req({ expectedVersion: version, status })); }
    expect(hash(await balances(p.map(x => x.id)))).toBe(before); const view: any = await orders.get(o.id, o.token); expect(view.orderStatus).toBe('DELIVERED'); expect(view.paymentStatus).toBe('PAID'); expect(view.nextActions).not.toContain('RETRY_PAYMENT');
  });
  it('H5-Q13/Q14 real H1 auth and HTTP privacy/error envelopes fail closed', async () => {
    const p = await product(); const o = await order([{ ...p[0], quantity: 1 }]); const server = app.getHttpServer(); const path = `/api/v1/admin/orders/${o.id}`;
    await request(server).get(path).set('X-Order-Access-Token', o.token).expect(401);
    await request(server).post(`${path}/payment-confirmation`).set('Cookie', `abar_admin_session=${actor.token}`).set('Origin', origin).set('Idempotency-Key', key()).send({}).expect(403);
    const note: any = await admin.mutate(o.id, 'ORDER_NOTE', req({ expectedVersion: 1, text: '<script>private</script>' })); expect(note.text).toContain('<script>');
    const detail = await request(server).get(path).set('Cookie', `abar_admin_session=${actor.token}`).expect(200); expect(detail.headers['cache-control']).toBe('no-store'); expect(detail.body.notes[0].text).toBe(note.text);
    const view = await request(server).get(`/api/v1/public/orders/${o.id}`).set('X-Order-Access-Token', o.token).expect(200); for (const field of ['customer', 'stock', 'notes', 'history']) expect(view.body[field]).toBeUndefined();
    await prisma.adminUser.update({ where: { id: other.user.id }, data: { mustChangePassword: true } }); await reject(confirm(o, other), 403); await prisma.adminUser.update({ where: { id: other.user.id }, data: { mustChangePassword: false } });
    await prisma.authSession.update({ where: { id: other.sessionId }, data: { revokedAt: new Date() } }); await reject(confirm(o, other), 401);
    other = await session();
    const stockRows: any = await stock.list({ cookieHeader: `abar_admin_session=${actor.token}` }); expect(stockRows.items.length).toBeGreaterThan(0);
  });
  it.each(['absolute', 'idle'] as const)('H5 complementary temporal %s expiry rejects confirmation and cancellation without business writes', async expiry => {
    const expired = await session(); const p = await product(); const server = app.getHttpServer();
    const pending = await Promise.all([order([{ ...p[0], quantity: 1 }]), order([{ ...p[0], quantity: 1 }])]);
    const ids = pending.map(o => o.id); const paymentIds = pending.map(o => o.paymentId);
    const state = async () => hash({
      orders: await prisma.order.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
      payments: await prisma.payment.findMany({ where: { id: { in: paymentIds } }, orderBy: { id: 'asc' } }),
      balances: await balances(p.map(x => x.id)),
      operations: await prisma.stockOperation.findMany({ where: { orderId: { in: ids } }, orderBy: { id: 'asc' } }),
      entries: await prisma.stockEntry.findMany({ where: { presentationId: { in: p.map(x => x.id) } }, orderBy: [{ operationId: 'asc' }, { presentationId: 'asc' }] }),
      events: await prisma.orderEvent.findMany({ where: { orderId: { in: ids } }, orderBy: { id: 'asc' } }),
      jobs: await prisma.notificationJob.findMany({ where: { orderId: { in: ids } }, orderBy: { id: 'asc' } }),
      replays: await prisma.orderIdempotencyKey.findMany({ where: { orderId: { in: ids } }, orderBy: { id: 'asc' } }),
    });
    await request(server).get(`/api/v1/admin/orders/${pending[0].id}`).set('Cookie', `abar_admin_session=${expired.token}`).expect(200);
    const now = Date.now(); const absoluteExpiresAt = new Date(now + (expiry === 'absolute' ? -1000 : 3600000));
    await prisma.authSession.update({ where: { id: expired.sessionId }, data: { lastActivityAt: new Date(now - 120000), absoluteExpiresAt, idleExpiresAt: new Date(now - 2000) } });
    const row = await prisma.authSession.findUniqueOrThrow({ where: { id: expired.sessionId } });
    expect(row.revokedAt).toBeNull(); expect(row.idleExpiresAt.getTime()).toBeLessThan(Date.now());
    expect(row.absoluteExpiresAt.getTime() < Date.now()).toBe(expiry === 'absolute');
    const before = await state(); const headers = { Cookie: `abar_admin_session=${expired.token}`, Origin: origin, 'X-CSRF-Token': expired.csrf };
    const confirmation = await request(server).post(`/api/v1/admin/orders/${pending[0].id}/payment-confirmation`).set(headers).set('Idempotency-Key', key()).send({ expectedVersion: 1, attemptId: pending[0].attemptId, confirmedAmount: { amountMinor: pending[0].totalMinor.toString(), currency: 'ARS' } }).expect(401);
    expect(confirmation.body.code).toBe('SESSION_EXPIRED'); expect(await state()).toBe(before);
    const cancellation = await request(server).post(`/api/v1/admin/orders/${pending[1].id}/cancel`).set(headers).set('Idempotency-Key', key()).send({ expectedVersion: 1, reason: 'Expired session must not cancel' }).expect(401);
    expect(cancellation.body.code).toBe('SESSION_EXPIRED'); expect(await state()).toBe(before);
    console.log('H5 temporal expiry invariant', { expiry, confirmationStatus: confirmation.status, cancellationStatus: cancellation.status, beforeHash: before, afterHash: await state(), businessStateUnchanged: true });
  });
  it('Independent public-interface probe: HTTP confirmation replay, rejected side effects, transitions and notes privacy', async () => {
    const p = await product(); const o = await order([{ ...p[0], quantity: 2 }]);
    const server = app.getHttpServer(), path = `/api/v1/admin/orders/${o.id}`;
    const headers = { Cookie: `abar_admin_session=${actor.token}`, Origin: origin, 'X-CSRF-Token': actor.csrf };
    const state = async () => hash({ balances: await balances(p.map(x => x.id)), order: await prisma.order.findUnique({ where: { id: o.id } }), payment: await prisma.payment.findUnique({ where: { id: o.paymentId } }), operations: await prisma.stockOperation.count({ where: { paymentId: o.paymentId } }), events: await prisma.orderEvent.count({ where: { orderId: o.id } }), jobs: await prisma.notificationJob.count({ where: { orderId: o.id } }) });
    const body = { expectedVersion: 1, attemptId: o.attemptId, confirmedAmount: { amountMinor: o.totalMinor.toString(), currency: 'ARS' } };
    let before = await state();
    await request(server).post(`${path}/payment-confirmation`).set(headers).set('Origin', 'https://evil.example.test').set('Idempotency-Key', key()).send(body).expect(403);
    await request(server).post(`${path}/payment-confirmation`).set(headers).set('Idempotency-Key', key()).send({ ...body, paymentStatus: 'PAID' }).expect(400);
    await request(server).post(`${path}/cancel`).set(headers).set('Idempotency-Key', key()).send({ expectedVersion: 1, reason: '   ' }).expect(400);
    expect(await state()).toBe(before);
    const k = key(); const first = await request(server).post(`${path}/payment-confirmation`).set(headers).set('Idempotency-Key', k).send(body).expect(200);
    before = await state();
    const replay = await request(server).post(`${path}/payment-confirmation`).set(headers).set('Idempotency-Key', k).send(body).expect(200); expect(replay.body).toEqual(first.body);
    await request(server).post(`${path}/cancel`).set(headers).set('Idempotency-Key', key()).send({ expectedVersion: 2, reason: 'Paid cannot cancel' }).expect(409);
    await request(server).patch(`${path}/status`).set(headers).set('Idempotency-Key', key()).send({ expectedVersion: 2, status: 'DELIVERED' }).expect(409);
    expect(await state()).toBe(before);
    const note = 'INDEPENDENT_PRIVATE_<img src=x onerror=alert(1)>';
    await request(server).post(`${path}/notes`).set(headers).set('Idempotency-Key', key()).send({ expectedVersion: 2, text: note }).expect(200);
    const view = await request(server).get(`/api/v1/public/orders/${o.id}`).set('X-Order-Access-Token', o.token).expect(200);
    expect(JSON.stringify(view.body)).not.toContain(note); expect(view.body.nextActions).not.toContain('RETRY_PAYMENT');
    const listed = await request(server).get('/api/v1/admin/orders').set(headers).query({ search: o.orderNumber }).expect(200); expect(listed.body.items.some((x: any) => x.orderId === o.id)).toBe(true);
    await request(server).get('/api/v1/admin/orders').set(headers).query({ from: 'nonsense' }).expect(400);
    console.log('Independent HTTP rejected-state hash', before);
  });
});
