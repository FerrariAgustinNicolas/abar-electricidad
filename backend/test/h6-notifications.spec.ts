import { NotificationsService } from '../src/notifications/notifications.service';

const id = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const createdAt = new Date('2026-10-22T12:00:00.000Z');
const auth = { adminUserId: 'admin', recheck: jest.fn().mockResolvedValue(undefined) };
const job = {
  id, orderId, kind: 'ORDER_CREATED_BUYER', state: 'RETRY_WAIT', version: 4,
  attemptCount: 2, nextAttemptAt: createdAt, sentAt: null, lastError: 'SMTP_UNAVAILABLE', createdAt,
};

describe('H6 notification administration', () => {
  it('lists only contract-safe notification fields and rechecks H1 authorization', async () => {
    const prisma = {
      notificationJob: { findMany: jest.fn().mockResolvedValue([job]), count: jest.fn().mockResolvedValue(1) },
    };
    const admins = { authorizeCatalog: jest.fn().mockResolvedValue(auth) };
    const service = new NotificationsService(prisma as never, admins as never);

    const result = await service.list({ query: { page: '1', pageSize: '20', state: 'RETRY_WAIT', orderId } });

    expect(result).toEqual({
      items: [{ id, orderId, kind: 'ORDER_CREATED_BUYER', state: 'RETRY_WAIT', version: 4,
        attemptCount: 2, nextAttemptAt: createdAt.toISOString(), sentAt: null,
        lastError: 'SMTP_UNAVAILABLE', createdAt: createdAt.toISOString() }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/recipient|payload|lease/i);
    expect(prisma.notificationJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ state: 'RETRY_WAIT', orderId }),
      select: expect.objectContaining({ id: true, state: true, attemptCount: true }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    expect(auth.recheck).toHaveBeenCalledWith(prisma);
  });

  it('rejects unknown filters before querying and rejects reversed dates', async () => {
    const prisma = { notificationJob: { findMany: jest.fn(), count: jest.fn() } };
    const service = new NotificationsService(prisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);

    await expect(service.list({ query: { recipient: 'customer@example.test' } })).rejects.toMatchObject({
      status: 400, response: 'VALIDATION_ERROR',
    });
    await expect(service.list({ query: { from: '2026-10-23T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' } })).rejects.toMatchObject({
      status: 400, response: 'VALIDATION_ERROR',
    });
    expect(prisma.notificationJob.findMany).not.toHaveBeenCalled();
  });

  it('requeues only a version-matched eligible job without adding business events', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id }]),
      notificationJob: {
        findUnique: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockResolvedValue({ ...job, state: 'PENDING', version: 5, attemptCount: 0, nextAttemptAt: createdAt, lastError: null }),
      },
    };
    const prisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)) };
    const service = new NotificationsService(prisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);

    const result = await service.retry(id, { body: { expectedVersion: 4 } });

    expect(result).toMatchObject({ id, state: 'PENDING', version: 5, attemptCount: 0, lastError: null });
    expect(tx.notificationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id }, data: expect.objectContaining({ state: 'PENDING', version: { increment: 1 }, attemptCount: 0,
        leaseToken: null, leaseUntil: null }),
    }));
  });

  it('rejects stale eligible versions and SENT jobs without mutating them', async () => {
    const staleTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id }]),
      notificationJob: { findUnique: jest.fn().mockResolvedValue({ ...job, version: 5 }), update: jest.fn() },
    };
    const stalePrisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(staleTx)) };
    const service = new NotificationsService(stalePrisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);

    await expect(service.retry(id, { body: { expectedVersion: 4 } })).rejects.toMatchObject({ status: 409, response: 'VERSION_CONFLICT' });
    expect(staleTx.notificationJob.update).not.toHaveBeenCalled();

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id }]),
      notificationJob: { findUnique: jest.fn().mockResolvedValue({ ...job, version: 5, state: 'SENT' }), update: jest.fn() },
    };
    const sentPrisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)) };
    const sentService = new NotificationsService(sentPrisma as never, { authorizeCatalog: jest.fn().mockResolvedValue(auth) } as never);

    await expect(sentService.retry(id, { body: { expectedVersion: 4 } })).rejects.toMatchObject({ status: 409, response: 'NOT_RETRYABLE' });
    expect(tx.notificationJob.update).not.toHaveBeenCalled();
    expect(tx.notificationJob.findUnique).toHaveBeenCalledTimes(1);
  });
});
