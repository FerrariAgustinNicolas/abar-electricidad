import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminUsersService, getAdminUsersErrorMetadata } from '../auth/admin-users.service';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { CatalogException } from '../catalog-shared/catalog-error';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { OrdersService, orderFingerprint } from './orders.service';

type Request = { cookieHeader?: string; origin?: string; csrfToken?: string; idempotencyKey?: string; body?: unknown; query?: Record<string, unknown> };
type Mutation = { expectedVersion: number; attemptId?: string; confirmedAmount?: { amountMinor: string; currency: 'ARS' }; status?: 'READY' | 'DELIVERED'; reason?: string; text?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX = 2147483647;
const include = { items: true, payment: { include: { currentAttempt: true } } };
function fail(status: number, code: string): never { throw new CatalogException(status, code); }
function id(value: string): string { if (!UUID.test(value)) fail(400, 'VALIDATION_ERROR'); return value.toLowerCase(); }
function page(query: Record<string, unknown>) {
  const number = (name: string, fallback: number, max: number) => {
    const v = query[name]; if (v === undefined) return fallback;
    if (typeof v !== 'string' || !/^[1-9][0-9]*$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > max) fail(400, 'VALIDATION_ERROR');
    return Number(v);
  };
  const p = number('page', 1, MAX), pageSize = number('pageSize', 20, 100);
  if (!Number.isSafeInteger((p - 1) * pageSize)) fail(400, 'VALIDATION_ERROR');
  return { page: p, pageSize };
}
const money = (n: bigint) => ({ amountMinor: n.toString(), currency: 'ARS' });
const history = (row: any) => ({ id: row.id, eventType: row.eventType, createdAt: row.createdAt.toISOString(),
  ...(row.actorAdminUserId ? { actorAdminUserId: row.actorAdminUserId } : {}), ...(row.attemptId ? { attemptId: row.attemptId } : {}),
  ...Object.fromEntries(['reason', 'fromStatus', 'toStatus'].filter(k => typeof row.details?.[k] === 'string').map(k => [k, row.details[k]])) });
const noteView = (row: any) => ({ id: row.id, orderId: row.orderId, actorAdminUserId: row.actorAdminUserId, text: row.text, createdAt: row.createdAt.toISOString(), version: row.version });

@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminUsersService,
    private readonly orders: OrdersService, private readonly config: ConfigService) {}

  allowed(order: any) {
    const payment = order.payment;
    const attempt = payment?.currentAttempt;
    const eligible = attempt && attempt.paymentId === payment.id && (attempt.methodCode === 'DEMO_SIMULATION' ? attempt.status === 'APPROVED' : attempt.status === 'PENDING');
    const unpaid = order.status === 'RECEIVED' && payment?.status !== 'PAID';
    return { confirmPayment: !!(unpaid && payment?.status === 'PENDING' && eligible), cancel: unpaid,
      markReady: order.status === 'PREPARING' && payment?.status === 'PAID', markDelivered: order.status === 'READY' && payment?.status === 'PAID', addNote: true };
  }
  private summary(o: any) {
    return { orderId: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt.toISOString(), version: o.version,
      orderStatus: o.status, paymentStatus: o.payment.status, deliveryMode: o.deliveryMode,
      customer: { firstName: o.customerFirstName, lastName: o.customerLastName, email: o.customerEmail, phone: o.customerPhone },
      total: money(o.totalMinor), allowedActions: this.allowed(o) };
  }
  async list(request: Request) {
    const auth = await this.admins.authorizeCatalog(request, false);
    const q = request.query ?? {}; const paging = page(q);
    if (Object.keys(q).some(k => !['page', 'pageSize', 'orderStatus', 'paymentStatus', 'deliveryMode', 'from', 'to', 'search'].includes(k))) fail(400, 'VALIDATION_ERROR');
    const where: any = {};
    for (const [key, values] of Object.entries({ orderStatus: ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'], paymentStatus: ['PENDING', 'REJECTED', 'PAID'], deliveryMode: ['PICKUP', 'COORDINATED'] })) {
      const v = q[key]; if (v === undefined) continue;
      if (typeof v !== 'string' || !values.includes(v)) fail(400, 'VALIDATION_ERROR');
      if (key === 'paymentStatus') where.payment = { is: { status: v } }; else where[key === 'orderStatus' ? 'status' : key] = v;
    }
    for (const key of ['from', 'to']) if (q[key] !== undefined) {
      if (typeof q[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(q[key] as string) || Number.isNaN(Date.parse(q[key] as string))) fail(400, 'VALIDATION_ERROR');
      where.createdAt = { ...where.createdAt, [key === 'from' ? 'gte' : 'lte']: new Date(q[key] as string) };
    }
    if (where.createdAt?.gte > where.createdAt?.lte) fail(400, 'VALIDATION_ERROR');
    if (q.search !== undefined) {
      if (typeof q.search !== 'string' || !q.search.trim() || q.search.length > 100) fail(400, 'VALIDATION_ERROR');
      const contains = q.search.trim().replace(/[\\%_]/g, '\\$&');
      where.OR = ['orderNumber', 'customerFirstName', 'customerLastName', 'customerEmail', 'customerPhone'].map(k => ({ [k]: { contains, mode: 'insensitive' } }));
    }
    return this.read(async () => {
      const [rows, totalItems] = await Promise.all([this.prisma.order.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (paging.page - 1) * paging.pageSize, take: paging.pageSize }), this.prisma.order.count({ where })]);
      await auth.recheck(this.prisma as never);
      return { items: rows.map(o => this.summary(o)), pageInfo: { ...paging, totalItems, totalPages: Math.ceil(totalItems / paging.pageSize) } };
    });
  }
  async detail(orderId: string, request: Request) {
    const auth = await this.admins.authorizeCatalog(request, false); const order = id(orderId);
    if (Object.keys(request.query ?? {}).length) fail(400, 'VALIDATION_ERROR');
    return this.read(async () => {
      const o = await this.prisma.order.findUnique({ where: { id: order }, include: { ...include,
        events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1000 }, notes: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1000 } } });
      if (!o || !o.payment?.currentAttempt) fail(404, 'ORDER_NOT_FOUND');
      const quantities = this.quantities(o.items);
      const rows = await this.prisma.productPresentation.findMany({ where: { id: { in: [...quantities.keys()] } }, include: { balance: true } });
      await auth.recheck(this.prisma as never);
      const a = o.payment.currentAttempt;
      return { ...this.summary(o), paymentId: o.payment.id, paymentAmount: money(o.payment.amountMinor),
        currentAttempt: { id: a.id, methodCode: a.methodCode, status: a.status, sequence: a.sequence, createdAt: a.createdAt.toISOString(), demoMode: true },
        items: o.items.map(i => i.snapshot), subtotal: money(o.subtotalMinor), deliveryFee: money(o.deliveryFeeMinor),
        ...(o.customerNote !== null ? { customerNote: o.customerNote } : {}),
        ...(o.deliveryAddressLine ? { deliveryDetails: { addressLine: o.deliveryAddressLine, locality: o.deliveryLocality, ...(o.deliveryInstructions !== null ? { instructions: o.deliveryInstructions } : {}) } } : {}),
        stock: rows.sort((a, b) => a.id.localeCompare(b.id)).map(p => ({ presentationId: p.id, unit: p.unit, quantity: quantities.get(p.id), availableQuantity: p.balance?.availableQuantity ?? 0, version: p.balance?.version ?? 1 })),
        history: o.events.map(history), notes: o.notes.map(noteView) };
    });
  }
  async history(orderId: string, request: Request) {
    const auth = await this.admins.authorizeCatalog(request, false); const order = id(orderId); const p = page(request.query ?? {});
    if (Object.keys(request.query ?? {}).some(k => !['page', 'pageSize'].includes(k))) fail(400, 'VALIDATION_ERROR');
    return this.read(async () => {
      if (!await this.prisma.order.findUnique({ where: { id: order }, select: { id: true } })) fail(404, 'ORDER_NOT_FOUND');
      const [rows, totalItems] = await Promise.all([this.prisma.orderEvent.findMany({ where: { orderId: order }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.orderEvent.count({ where: { orderId: order } })]);
      await auth.recheck(this.prisma as never);
      return { items: rows.map(history), pageInfo: { ...p, totalItems, totalPages: Math.ceil(totalItems / p.pageSize) } };
    });
  }
  private quantities(items: any[]) {
    const q = new Map<string, number>();
    for (const i of items) { const n = (q.get(i.presentationId) ?? 0) + i.quantity; if (!Number.isSafeInteger(n) || n < 1 || n > MAX) fail(409, 'INSUFFICIENT_STOCK'); q.set(i.presentationId, n); }
    return q;
  }
  async mutate(orderId: string, kind: 'PAYMENT_CONFIRMATION' | 'ORDER_STATUS' | 'ORDER_CANCEL' | 'ORDER_NOTE', request: Request) {
    const auth = await this.admins.authorizeCatalog(request, true); const order = id(orderId);
    if (Object.keys(request.query ?? {}).length || typeof request.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,200}$/.test(request.idempotencyKey)) fail(400, 'VALIDATION_ERROR');
    const schemas = { PAYMENT_CONFIRMATION: 'PaymentConfirmationRequest', ORDER_STATUS: 'OrderStatusRequest', ORDER_CANCEL: 'CancelOrderRequest', ORDER_NOTE: 'OrderNoteRequest' };
    const raw = validateCatalogBody<Mutation>(schemas[kind], request.body);
    const body = { ...raw, ...(raw.attemptId ? { attemptId: id(raw.attemptId) } : {}), ...(raw.reason !== undefined ? { reason: raw.reason.trim() } : {}), ...(raw.text !== undefined ? { text: raw.text.trim() } : {}) };
    if (body.reason === '' || body.text === '') fail(400, 'VALIDATION_ERROR');
    const hash = orderFingerprint(body); const key = request.idempotencyKey;
    // Persisted scope is bounded by H4 VARCHAR(64), actor-bound and operation-specific.
    const scope = `${kind === 'PAYMENT_CONFIRMATION' ? 'p' : kind === 'ORDER_CANCEL' ? 'c' : kind === 'ORDER_STATUS' ? 's' : 'n'}:${createHash('sha256').update(`${auth.adminUserId}:${order}`).digest('hex').slice(0, 60)}`;
    const replayKey = this.orders.replayKey();
    try {
      return await this.prisma.$transaction(async tx => {
        await auth.recheck(tx);
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order}::uuid FOR UPDATE`;
        const o = await tx.order.findUnique({ where: { id: order }, include });
        if (!o || !o.payment) fail(404, 'ORDER_NOT_FOUND');
        await this.orders.lockKey(tx, scope, key);
        const existing = await tx.orderIdempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
        if (existing) return this.orders.replay(existing, hash, scope, key, replayKey);
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${o.payment.id}::uuid FOR UPDATE`;
        if (o.payment.currentAttemptId) await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id = ${o.payment.currentAttemptId}::uuid FOR UPDATE`;
        if (kind === 'PAYMENT_CONFIRMATION' && o.payment.status === 'PAID') fail(409, 'PAYMENT_ALREADY_CONFIRMED');
        if (o.version !== body.expectedVersion || o.version >= MAX) fail(409, 'VERSION_CONFLICT');
        const now = new Date(); const version = o.version + 1; let result: any;
        if (kind === 'ORDER_NOTE') {
          const note = await tx.orderNote.create({ data: { orderId: order, actorAdminUserId: auth.adminUserId, text: body.text!, version, createdAt: now } });
          await tx.order.update({ where: { id: order }, data: { version } });
          await tx.orderEvent.create({ data: { orderId: order, actorAdminUserId: auth.adminUserId, eventType: 'INTERNAL_NOTE_ADDED', createdAt: now, details: {} } });
          result = noteView(note);
        } else {
          let status: 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'; let confirmation: any;
          if (kind === 'PAYMENT_CONFIRMATION') {
            if (o.status !== 'RECEIVED') fail(409, 'INVALID_TRANSITION');
            const a = o.payment.currentAttempt;
            if (o.payment.status !== 'PENDING' || !a || a.paymentId !== o.payment.id || a.id !== body.attemptId || (a.methodCode === 'DEMO_SIMULATION' ? a.status !== 'APPROVED' : a.status !== 'PENDING')) fail(409, 'INVALID_ATTEMPT');
            if (body.confirmedAmount!.amountMinor !== o.totalMinor.toString() || o.payment.amountMinor !== o.totalMinor) fail(409, 'AMOUNT_MISMATCH');
            const quantities = this.quantities(o.items); if (!quantities.size) fail(409, 'INSUFFICIENT_STOCK');
            const ids = [...quantities.keys()].sort();
            for (const p of ids) await tx.$queryRaw`SELECT id FROM "ProductPresentation" WHERE id = ${p}::uuid FOR UPDATE`;
            const entries = [];
            for (const p of ids) {
              await tx.$queryRaw`SELECT "presentationId" FROM "StockBalance" WHERE "presentationId" = ${p}::uuid FOR UPDATE`;
              const b = await tx.stockBalance.findUnique({ where: { presentationId: p } }); const quantity = quantities.get(p)!;
              if (!b || b.availableQuantity < quantity || b.version >= MAX) fail(409, 'INSUFFICIENT_STOCK');
              entries.push({ presentationId: p, delta: -quantity, resultingQuantity: b.availableQuantity - quantity, version: b.version + 1 });
            }
            const operationId = randomUUID();
            for (const e of entries) await tx.stockBalance.update({ where: { presentationId: e.presentationId }, data: { availableQuantity: e.resultingQuantity, version: e.version } });
            const view = { id: operationId, type: 'PAYMENT_CONFIRMATION', reason: 'Manual full payment confirmation', actorAdminUserId: auth.adminUserId, createdAt: now.toISOString(), entries, paymentId: o.payment.id, orderId: order };
            await tx.stockOperation.create({ data: { id: operationId, type: 'PAYMENT_CONFIRMATION', reason: view.reason, actorAdminUserId: auth.adminUserId, createdAt: now, paymentId: o.payment.id, orderId: order,
              idempotencyKey: `h5-${createHash('sha256').update(`${scope}:${key}`).digest('hex')}`, requestHash: hash, metadata: {}, result: view, entries: { create: entries } } });
            await tx.payment.update({ where: { id: o.payment.id }, data: { status: 'PAID', confirmedAt: now, confirmedByAdminUserId: auth.adminUserId } });
            confirmation = { paymentId: o.payment.id, attemptId: a.id, confirmedAt: now.toISOString(), confirmedByAdminUserId: auth.adminUserId, stockOperationId: operationId, total: money(o.totalMinor) };
            status = 'PREPARING';
          } else if (kind === 'ORDER_CANCEL') {
            if (o.payment.status === 'PAID' || o.status !== 'RECEIVED') fail(409, 'INVALID_TRANSITION'); status = 'CANCELLED';
          } else {
            if (o.payment.status !== 'PAID' || !((o.status === 'PREPARING' && body.status === 'READY') || (o.status === 'READY' && body.status === 'DELIVERED'))) fail(409, 'INVALID_TRANSITION'); status = body.status!;
          }
          await tx.order.update({ where: { id: order }, data: { status, version } });
          const eventType = kind === 'PAYMENT_CONFIRMATION' ? 'PAYMENT_CONFIRMED' : status === 'CANCELLED' ? 'ORDER_CANCELLED' : `ORDER_${status}`;
          await tx.orderEvent.create({ data: { orderId: order, actorAdminUserId: auth.adminUserId, ...(confirmation ? { attemptId: confirmation.attemptId } : {}), eventType, createdAt: now,
            details: { fromStatus: o.status, toStatus: status, ...(body.reason ? { reason: body.reason } : {}) } } });
          const jobs: any[] = [];
          if (confirmation) jobs.push({ kind: 'PAYMENT_CONFIRMED_BUYER', recipient: o.customerEmail }, { kind: 'PAYMENT_CONFIRMED_ADMIN', recipient: this.config.get<string>('H4_ADMIN_NOTIFICATION_EMAIL') ?? 'orders-admin@example.test' });
          if (status === 'READY') jobs.push({ kind: 'ORDER_READY_BUYER', recipient: o.customerEmail });
          if (status === 'CANCELLED') jobs.push({ kind: 'ORDER_CANCELLED_BUYER', recipient: o.customerEmail });
          if (jobs.length) await tx.notificationJob.createMany({ data: jobs.map(j => ({ ...j, orderId: order, dedupeKey: `${order}:${j.kind}`, payload: { template: eventType, orderNumber: o.orderNumber }, state: 'PENDING' })) });
          const updated = { ...o, status, version, payment: { ...o.payment, ...(confirmation ? { status: 'PAID' } : {}) } };
          result = { orderId: order, version, orderStatus: status, paymentStatus: updated.payment.status, allowedActions: this.allowed(updated), ...confirmation };
        }
        await this.orders.storeReplay(tx, { kind, scope, key, fingerprint: hash, responseStatus: 200, orderId: order, response: result }, replayKey);
        await auth.recheck(tx);
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
    } catch (e) {
      if (e instanceof CatalogException || getAdminUsersErrorMetadata(e)) throw e;
      if (['P2034', 'P2002', '23505', '40P01', '40001'].includes((e as any)?.code) || ['40P01', '40001'].includes((e as any)?.meta?.driverAdapterError?.cause?.originalCode)) fail(409, 'VERSION_CONFLICT');
      fail(503, 'SERVICE_UNAVAILABLE');
    } finally { replayKey.fill(0); }
  }
  private async read<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) { if (e instanceof CatalogException || getAdminUsersErrorMetadata(e)) throw e; fail(503, 'SERVICE_UNAVAILABLE'); }
  }
}
