import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AdminUsersService, getAdminUsersErrorMetadata } from '../auth/admin-users.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { CatalogException } from '../catalog-shared/catalog-error';

const MAX_QUANTITY = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{1,200}$/;

type StockEntryView = Readonly<{ presentationId: string; delta: number; resultingQuantity: number; version: number }>;
type StockOperationView = Readonly<{
  id: string; type: 'ADJUSTMENT' | 'ROLL_OPENING'; reason: string; actorAdminUserId: string;
  createdAt: string; entries: readonly StockEntryView[];
}>;
type Adjustment = Readonly<{ presentationId: string; delta: number; reason: string; expectedVersion: number }>;
type RollOpening = Readonly<{
  productId: string; rollQuantity: number; reason: string; expectedVersions: Readonly<{ roll: number; meter: number }>;
}>;

function fail(status: number, code: string): never { throw new CatalogException(status, code); }
function safePage(query: Record<string, unknown>): { page: number; pageSize: number } {
  const number = (key: string, fallback: number, max: number): number => {
    const value = query[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(400, 'VALIDATION_ERROR');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) fail(400, 'VALIDATION_ERROR');
    return parsed;
  };
  return { page: number('page', 1, MAX_QUANTITY), pageSize: number('pageSize', 20, 100) };
}
function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) fail(400, 'VALIDATION_ERROR');
  return value;
}
function availability(quantity: number, threshold: number): 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (quantity === 0) return 'OUT_OF_STOCK';
  return quantity <= threshold ? 'LOW_STOCK' : 'AVAILABLE';
}
function toOperationView(operation: any): StockOperationView {
  const saved = operation.result as StockOperationView | null;
  if (saved && typeof saved === 'object' && Array.isArray(saved.entries)) return saved;
  return Object.freeze({
    id: operation.id, type: operation.type, reason: operation.reason,
    actorAdminUserId: operation.actorAdminUserId, createdAt: operation.createdAt.toISOString(),
    entries: Object.freeze(operation.entries.map((entry: any) => Object.freeze({
      presentationId: entry.presentationId, delta: entry.delta,
      resultingQuantity: entry.resultingQuantity, version: entry.version,
    }))),
  });
}
function canonicalHash(type: string, body: object): string {
  const normalize = (value: any): any => Array.isArray(value) ? value.map(normalize) :
    value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(normalize({ type, body }))).digest('hex');
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminUsersService) {}

  async list(request: { cookieHeader?: string; query?: Record<string, unknown> }) {
    const auth = await this.admins.authorizeCatalog(request, false);
    const query = request.query ?? {};
    const { page, pageSize } = safePage(query);
    const q = optionalText(query.q, 200);
    const productId = optionalText(query.productId, 36);
    if (productId !== undefined && !UUID.test(productId)) fail(400, 'VALIDATION_ERROR');
    const unit = optionalText(query.unit, 8);
    if (unit !== undefined && !['UNIT', 'METER', 'ROLL'].includes(unit)) fail(400, 'VALIDATION_ERROR');
    const state = optionalText(query.availability, 20);
    if (state !== undefined && !['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(state)) fail(400, 'VALIDATION_ERROR');
    const where: any = {
      ...(productId ? { productId } : {}), ...(unit ? { unit } : {}),
      ...(q ? { product: { OR: [
        { name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ] } } : {}),
    };
    try {
      const [rows, count] = await Promise.all([
        this.prisma.productPresentation.findMany({
          where, include: { product: { select: { name: true } }, balance: true },
          orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
          ...(state === undefined ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
        }),
        this.prisma.productPresentation.count({ where }),
      ]);
      const demandRows = rows.length ? await this.prisma.orderItem.groupBy({
        by: ['presentationId'],
        where: { presentationId: { in: rows.map((row: any) => row.id) }, order: { is: { status: 'RECEIVED', payment: { is: { status: { in: ['PENDING', 'REJECTED'] } } } } } },
        _sum: { quantity: true },
      }) : [];
      const demandByPresentation = new Map<string, number>();
      for (const demand of demandRows) {
        const quantity = demand._sum.quantity ?? 0;
        if (!Number.isSafeInteger(quantity) || quantity < 0) fail(503, 'SERVICE_UNAVAILABLE');
        demandByPresentation.set(demand.presentationId, quantity);
      }
      const paidRows = rows.length ? await this.prisma.orderItem.groupBy({
        by: ['presentationId'], where: { presentationId: { in: rows.map((r: any) => r.id) },
          order: { is: { status: { in: ['PREPARING', 'READY'] }, payment: { is: { status: 'PAID' } } } } }, _sum: { quantity: true },
      }) : [];
      const paid = new Map(paidRows.map(r => [r.presentationId, r._sum.quantity ?? 0]));
      await auth.recheck(this.prisma as never);
      const filtered = rows.map((row: any) => {
        const quantity = row.balance?.availableQuantity ?? 0;
        const derived = availability(quantity, row.lowStockThreshold);
        return {
          presentationId: row.id, productId: row.productId, productName: row.product.name,
          unit: row.unit, rollLengthMeters: row.rollLengthMeters, active: row.active,
          availableQuantity: quantity, lowStockThreshold: row.lowStockThreshold,
          version: row.balance?.version ?? 1, availability: derived,
          requestedUnpaidQuantity: demandByPresentation.get(row.id) ?? 0,
          paidPendingDeliveryQuantity: paid.get(row.id) ?? 0,
        };
      }).filter((item: any) => state === undefined || item.availability === state);
      const totalItems = state === undefined ? count : filtered.length;
      const items = state === undefined ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
      return { items, pageInfo: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
    } catch (error) {
      if (error instanceof CatalogException || getAdminUsersErrorMetadata(error)) throw error;
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }

  async movements(request: { cookieHeader?: string; query?: Record<string, unknown> }) {
    const auth = await this.admins.authorizeCatalog(request, false);
    const query = request.query ?? {};
    const { page, pageSize } = safePage(query);
    const presentationId = optionalText(query.presentationId, 36);
    const productId = optionalText(query.productId, 36);
    const actorAdminUserId = optionalText(query.actorAdminUserId, 36);
    for (const id of [presentationId, productId, actorAdminUserId]) if (id !== undefined && !UUID.test(id)) fail(400, 'VALIDATION_ERROR');
    const type = optionalText(query.type, 20);
    if (type !== undefined && !['ADJUSTMENT', 'ROLL_OPENING', 'PAYMENT_CONFIRMATION'].includes(type)) fail(400, 'VALIDATION_ERROR');
    const from = dateFilter(query.from);
    const to = dateFilter(query.to);
    if (from && to && from > to) fail(400, 'VALIDATION_ERROR');
    const where: any = {
      ...(actorAdminUserId ? { actorAdminUserId } : {}), ...(type ? { type } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...((presentationId || productId) ? { entries: { some: {
        ...(presentationId ? { presentationId } : {}),
        ...(productId ? { presentation: { productId } } : {}),
      } } } : {}),
    };
    try {
      const [rows, totalItems] = await Promise.all([
        this.prisma.stockOperation.findMany({ where, include: { entries: { orderBy: { presentationId: 'asc' } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.stockOperation.count({ where }),
      ]);
      await auth.recheck(this.prisma as never);
      return { items: rows.map(toOperationView), pageInfo: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
    } catch (error) {
      if (error instanceof CatalogException || getAdminUsersErrorMetadata(error)) throw error;
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }

  async adjust(request: { body: unknown; idempotencyKey?: string; cookieHeader?: string; origin?: string; csrfToken?: string }) {
    const validated = validateCatalogBody<Adjustment>('StockAdjustmentRequest', request.body);
    if (validated.reason.trim().length === 0) fail(400, 'VALIDATION_ERROR');
    const body: Adjustment = { ...validated, reason: validated.reason.trim() };
    return this.mutate('ADJUSTMENT', body, request.idempotencyKey, request, async (tx, actorId, now, key, hash) => {
      await this.lockPresentations(tx, [body.presentationId]);
      const replayed = await this.findReplay(tx, actorId, key, hash);
      if (replayed) return replayed;
      const presentation = await tx.productPresentation.findUnique({ where: { id: body.presentationId }, select: { id: true } });
      if (!presentation) fail(404, 'RESOURCE_NOT_FOUND');
      const balance = await this.lockBalance(tx, body.presentationId);
      if (balance.version !== body.expectedVersion) fail(409, 'VERSION_CONFLICT');
      if (balance.version >= MAX_QUANTITY) fail(409, 'VERSION_CONFLICT');
      const quantity = balance.availableQuantity + body.delta;
      if (quantity < 0 || quantity > MAX_QUANTITY) fail(409, 'INSUFFICIENT_STOCK');
      return this.persistOperation(tx, actorId, 'ADJUSTMENT', body.reason, now, key, hash, [
        { presentationId: body.presentationId, delta: body.delta, resultingQuantity: quantity, version: balance.version + 1 },
      ], [{ presentationId: body.presentationId, availableQuantity: quantity, version: balance.version + 1 }]);
    });
  }

  async openRolls(request: { body: unknown; idempotencyKey?: string; cookieHeader?: string; origin?: string; csrfToken?: string }) {
    const validated = validateCatalogBody<RollOpening>('RollOpeningRequest', request.body);
    if (validated.reason.trim().length === 0) fail(400, 'VALIDATION_ERROR');
    const body: RollOpening = { ...validated, reason: validated.reason.trim() };
    return this.mutate('ROLL_OPENING', body, request.idempotencyKey, request, async (tx, actorId, now, key, hash) => {
      const configured = await tx.productPresentation.findMany({ where: { productId: body.productId, unit: { in: ['ROLL', 'METER'] } }, select: { id: true, unit: true, rollLengthMeters: true } });
      const roll = configured.find((item: any) => item.unit === 'ROLL');
      const meter = configured.find((item: any) => item.unit === 'METER');
      if (!roll || !meter || !Number.isInteger(roll.rollLengthMeters) || roll.rollLengthMeters < 1) fail(400, 'INVALID_ROLL_CONFIGURATION');
      await this.lockPresentations(tx, [roll.id, meter.id]);
      const replayed = await this.findReplay(tx, actorId, key, hash);
      if (replayed) return replayed;
      const lockedPresentations = await tx.productPresentation.findMany({
        where: { id: { in: [roll.id, meter.id] }, productId: body.productId, unit: { in: ['ROLL', 'METER'] } },
        select: { id: true, unit: true, rollLengthMeters: true },
      });
      const lockedRoll = lockedPresentations.find((item: any) => item.unit === 'ROLL');
      const lockedMeter = lockedPresentations.find((item: any) => item.unit === 'METER');
      if (!lockedRoll || !lockedMeter || lockedRoll.id !== roll.id || lockedMeter.id !== meter.id || !Number.isInteger(lockedRoll.rollLengthMeters) || lockedRoll.rollLengthMeters < 1) fail(400, 'INVALID_ROLL_CONFIGURATION');
      const balances = new Map<string, any>();
      for (const id of [roll.id, meter.id].sort()) balances.set(id, await this.lockBalance(tx, id));
      const rollBalance = balances.get(roll.id);
      const meterBalance = balances.get(meter.id);
      if (rollBalance.version !== body.expectedVersions.roll || meterBalance.version !== body.expectedVersions.meter) fail(409, 'VERSION_CONFLICT');
      if (rollBalance.version >= MAX_QUANTITY || meterBalance.version >= MAX_QUANTITY) fail(409, 'VERSION_CONFLICT');
      if (rollBalance.availableQuantity < body.rollQuantity) fail(409, 'INSUFFICIENT_ROLLS');
      const metersToAdd = body.rollQuantity * lockedRoll.rollLengthMeters;
      const resultingMeters = meterBalance.availableQuantity + metersToAdd;
      if (!Number.isSafeInteger(metersToAdd) || resultingMeters > MAX_QUANTITY) fail(409, 'INSUFFICIENT_STOCK');
      const entries = [
        { presentationId: roll.id, delta: -body.rollQuantity, resultingQuantity: rollBalance.availableQuantity - body.rollQuantity, version: rollBalance.version + 1 },
        { presentationId: meter.id, delta: metersToAdd, resultingQuantity: resultingMeters, version: meterBalance.version + 1 },
      ].sort((left, right) => left.presentationId.localeCompare(right.presentationId));
      return this.persistOperation(tx, actorId, 'ROLL_OPENING', body.reason, now, key, hash, entries, entries.map((entry) => ({
        presentationId: entry.presentationId, availableQuantity: entry.resultingQuantity, version: entry.version,
      })));
    });
  }

  private async mutate<T extends object>(
    type: 'ADJUSTMENT' | 'ROLL_OPENING', body: T, idempotencyKey: string | undefined,
    request: { cookieHeader?: string; origin?: string; csrfToken?: string },
    action: (tx: any, actorId: string, now: Date, key: string, hash: string) => Promise<StockOperationView>,
  ): Promise<StockOperationView> {
    if (typeof idempotencyKey !== 'string' || !KEY.test(idempotencyKey)) fail(400, 'VALIDATION_ERROR');
    const auth = await this.admins.authorizeCatalog(request, true);
    const requestHash = canonicalHash(type, body);
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        await auth.recheck(tx);
        const existing = await tx.stockOperation.findUnique({ where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: auth.adminUserId, idempotencyKey } } });
        if (existing) return replay(existing, requestHash);
        const result = await action(tx, auth.adminUserId, new Date(), idempotencyKey, requestHash);
        return result;
      });
    } catch (error) {
      if (error instanceof CatalogException) throw error;
      if (getAdminUsersErrorMetadata(error)) throw error;
      if ((error as any)?.code === 'P2002' || (error as any)?.code === '23505') {
        const existing = await this.prisma.stockOperation.findUnique({ where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: auth.adminUserId, idempotencyKey } } }).catch(() => null);
        if (existing) return replay(existing, requestHash);
        fail(503, 'SERVICE_UNAVAILABLE');
      }
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private async lockPresentations(tx: any, ids: string[]): Promise<void> {
    for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM "ProductPresentation" WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private async lockBalance(tx: any, presentationId: string): Promise<any> {
    await tx.$queryRaw`SELECT "presentationId" FROM "StockBalance" WHERE "presentationId" = ${presentationId}::uuid FOR UPDATE`;
    let balance = await tx.stockBalance.findUnique({ where: { presentationId } });
    if (!balance) balance = await tx.stockBalance.create({ data: { presentationId, availableQuantity: 0, version: 1 } });
    return balance;
  }

  private async findReplay(tx: any, actorId: string, key: string, requestHash: string): Promise<StockOperationView | undefined> {
    const operation = await tx.stockOperation.findUnique({ where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: actorId, idempotencyKey: key } } });
    return operation ? replay(operation, requestHash) : undefined;
  }

  private async persistOperation(
    tx: any, actorId: string, type: 'ADJUSTMENT' | 'ROLL_OPENING', reason: string, now: Date,
    idempotencyKey: string, requestHash: string,
    entries: StockEntryView[], balances: Array<{ presentationId: string; availableQuantity: number; version: number }>,
  ): Promise<StockOperationView> {
    for (const balance of balances.sort((a, b) => a.presentationId.localeCompare(b.presentationId))) {
      await tx.stockBalance.update({ where: { presentationId: balance.presentationId }, data: { availableQuantity: balance.availableQuantity, version: balance.version } });
    }
    const operationId = randomUUID();
    const operation = await tx.stockOperation.create({ data: {
      id: operationId, type, reason, actorAdminUserId: actorId, createdAt: now,
      idempotencyKey, requestHash,
      metadata: {}, result: {},
    } });
    await tx.stockEntry.createMany({ data: entries.map((entry) => ({ operationId, ...entry })) });
    const result: StockOperationView = Object.freeze({
      id: operation.id, type, reason, actorAdminUserId: actorId, createdAt: operation.createdAt.toISOString(),
      entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
    });
    await tx.stockOperation.update({ where: { id: operation.id }, data: { result: result as any } });
    return result;
  }
}

function dateFilter(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !/^\d{4}-\d\d-\d\dT.*Z$/.test(value)) fail(400, 'VALIDATION_ERROR');
  return new Date(value);
}

function replay(operation: any, requestHash: string): StockOperationView {
  if (operation.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT');
  const result = operation.result as StockOperationView;
  if (!result || typeof result !== 'object' || !Array.isArray(result.entries)) fail(503, 'SERVICE_UNAVAILABLE');
  return result;
}
