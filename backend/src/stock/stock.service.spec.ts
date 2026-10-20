import { createHash } from 'node:crypto';
import { AdminUsersRouteException, getAdminUsersErrorMetadata } from '../auth/admin-users.service';
import { StockService } from './stock.service';

const auth = { adminUserId: '00000000-0000-4000-8000-000000000001', recheck: jest.fn() };

describe('StockService adjustment contract', () => {
  it('reads admin stock without creating missing balance rows and hides no admin quantities', async () => {
    const presentationId = '00000000-0000-4000-8000-000000000002';
    const authPolicy = { authorizeCatalog: jest.fn().mockResolvedValue(auth) };
    const prisma = {
      orderItem: { groupBy: jest.fn().mockResolvedValue([{ presentationId, _sum: { quantity: 5 } }]) },
      productPresentation: {
        findMany: jest.fn().mockResolvedValue([{ id: presentationId, productId: 'product', unit: 'METER', rollLengthMeters: null, active: true, lowStockThreshold: 2, balance: null, product: { name: 'Cable' } }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new StockService(prisma as never, authPolicy as never);
    const response = await service.list({ query: { availability: 'OUT_OF_STOCK' } });
    expect(response.items).toEqual([{
      presentationId, productId: 'product', productName: 'Cable', unit: 'METER', rollLengthMeters: null,
      active: true, availableQuantity: 0, lowStockThreshold: 2, version: 1, availability: 'OUT_OF_STOCK',
      requestedUnpaidQuantity: 5,
    }]);
    expect(prisma.productPresentation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.productPresentation.count).toHaveBeenCalledTimes(1);
    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['presentationId'],
      where: expect.objectContaining({ order: { is: { payment: { is: { status: { in: ['PENDING', 'REJECTED'] } } } } } }),
    }));
    expect(prisma).not.toHaveProperty('stockBalance');
  });

  it('preserves canonical H1 session expiry from the post-read authorization recheck', async () => {
    const authError = new AdminUsersRouteException('SESSION_EXPIRED');
    expect(getAdminUsersErrorMetadata(authError)).toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    const prisma = { productPresentation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const admins = { authorizeCatalog: jest.fn().mockResolvedValue({ adminUserId: auth.adminUserId, recheck: jest.fn().mockRejectedValue(authError) }) };
    const service = new StockService(prisma as never, admins as never);
    await expect(service.list({})).rejects.toBe(authError);
  });

  it('preserves canonical H1 password-change restriction from the transaction recheck', async () => {
    const authError = new AdminUsersRouteException('PASSWORD_CHANGE_REQUIRED');
    expect(getAdminUsersErrorMetadata(authError)).toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    const tx = { stockOperation: { findUnique: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (run) => run(tx)) };
    const admins = { authorizeCatalog: jest.fn().mockResolvedValue({ adminUserId: auth.adminUserId, recheck: jest.fn().mockRejectedValue(authError) }) };
    const service = new StockService(prisma as never, admins as never);
    await expect(service.adjust({ body: {
      presentationId: '00000000-0000-4000-8000-000000000002', delta: 1, reason: 'count', expectedVersion: 1,
    }, idempotencyKey: 'h1-recheck' })).rejects.toBe(authError);
    expect(tx.stockOperation.findUnique).not.toHaveBeenCalled();
  });

  it('replays the stored response before checking a stale stock version', async () => {
    const result = { id: '00000000-0000-4000-8000-000000000010', type: 'ADJUSTMENT', reason: 'count', actorAdminUserId: auth.adminUserId, createdAt: '2026-10-20T00:00:00.000Z', entries: [{ presentationId: '00000000-0000-4000-8000-000000000002', delta: 2, resultingQuantity: 12, version: 4 }] };
    const body = { presentationId: '00000000-0000-4000-8000-000000000002', delta: 2, reason: 'count', expectedVersion: 1 };
    const normalized = { body: Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))), type: 'ADJUSTMENT' };
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const tx = { stockOperation: { findUnique: jest.fn().mockResolvedValue({ requestHash, result }) } };
    const prisma = { $transaction: jest.fn(async (run) => run(tx)) };
    const service = new StockService(prisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);
    const response = await service.adjust({ body, idempotencyKey: 'retry-1' });
    expect(response).toEqual(result);
    expect(tx.stockOperation.findUnique).toHaveBeenCalledTimes(1);
    expect(tx).not.toHaveProperty('stockBalance');
  });

  it('locks and updates one balance with an audit entry in the same transaction', async () => {
    const presentationId = '00000000-0000-4000-8000-000000000002';
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: presentationId }]),
      stockOperation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'op', createdAt: new Date('2026-10-20T00:00:00Z') }), update: jest.fn().mockResolvedValue({}) },
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'product' }) },
      productPresentation: { findUnique: jest.fn().mockResolvedValue({ id: presentationId, productId: 'product', unit: 'METER', rollLengthMeters: null }) },
      stockBalance: { findUnique: jest.fn().mockResolvedValue({ availableQuantity: 5, version: 2 }), update: jest.fn().mockResolvedValue({}) },
      stockEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    tx.stockOperation.create.mockImplementation(async ({ data }) => ({ id: 'op', createdAt: data.createdAt }));
    tx.stockOperation.findUnique.mockResolvedValueOnce(null);
    const prisma = { $transaction: jest.fn(async (run) => run(tx)) };
    const service = new StockService(prisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);
    const response = await service.adjust({ body: { presentationId, delta: 3, reason: 'physical count', expectedVersion: 2 }, idempotencyKey: 'adjust-1' });
    expect(response.entries).toEqual([{ presentationId, delta: 3, resultingQuantity: 8, version: 3 }]);
    expect(auth.recheck).toHaveBeenCalledWith(tx);
    expect(tx.stockBalance.update).toHaveBeenCalledWith({ where: { presentationId }, data: { availableQuantity: 8, version: 3 } });
    expect(tx.stockEntry.createMany).toHaveBeenCalledTimes(1);
  });

  it('opens the persisted roll length into the separate meter balance atomically', async () => {
    const rollId = '00000000-0000-4000-8000-000000000003';
    const meterId = '00000000-0000-4000-8000-000000000004';
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      productPresentation: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: rollId, unit: 'ROLL', rollLengthMeters: 75 }, { id: meterId, unit: 'METER', rollLengthMeters: null }])
        .mockResolvedValueOnce([{ id: rollId, unit: 'ROLL', rollLengthMeters: 75 }, { id: meterId, unit: 'METER', rollLengthMeters: null }]) },
      stockOperation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'op-open', createdAt: new Date('2026-10-20T00:00:00Z') }), update: jest.fn().mockResolvedValue({}) },
      stockBalance: {
        findUnique: jest.fn(({ where }) => Promise.resolve(where.presentationId === rollId ? { availableQuantity: 3, version: 7 } : { availableQuantity: 20, version: 9 })),
        update: jest.fn().mockResolvedValue({}),
      },
      stockEntry: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = { $transaction: jest.fn(async (run) => run(tx)) };
    const service = new StockService(prisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);
    const response = await service.openRolls({ body: {
      productId: '00000000-0000-4000-8000-000000000005', rollQuantity: 1, reason: 'open one', expectedVersions: { roll: 7, meter: 9 },
    }, idempotencyKey: 'open-1' });
    expect(response.type).toBe('ROLL_OPENING');
    expect(response.entries).toHaveLength(2);
    expect(response.entries).toContainEqual({ presentationId: rollId, delta: -1, resultingQuantity: 2, version: 8 });
    expect(response.entries).toContainEqual({ presentationId: meterId, delta: 75, resultingQuantity: 95, version: 10 });
    expect(tx.stockBalance.update).toHaveBeenCalledTimes(2);
    expect(tx.stockEntry.createMany).toHaveBeenCalledTimes(1);
  });
});
