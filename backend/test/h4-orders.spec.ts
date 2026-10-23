import { createHash, randomUUID } from 'node:crypto';
import { orderFingerprint, OrdersService } from '../src/orders/orders.service';

describe('H4 order terms and no-store contract', () => {
  it('returns the exact provisional contract text and server simulation capability', () => {
    const config = { get: jest.fn().mockReturnValue(true) };
    const service = new OrdersService({} as never, {} as never, config as never);
    expect(service.terms()).toEqual({
      version: 'demo-2026-10-20-v1',
      text: 'Condiciones de demostración académica, provisionales y no validadas como términos legales de ABAR. Registrar un pedido no reserva ni garantiza existencias futuras. Los medios e intentos de pago son ficticios. Una simulación aprobada no confirma un cobro: requiere confirmación administrativa posterior fuera de H4.',
      demoMode: true,
      simulationEnabled: true,
    });
  });
});


describe('H8 payment-attempt raw-query conflict recovery', () => {
  const conflict = { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict' } } } };
  async function fixture(error: unknown = conflict) {
    const orderId = randomUUID(), token = 'synthetic-order-access-token-for-h8-only';
    const key = 'synthetic-h8-replay-key-0001', body = { methodCode: 'DEMO_TRANSFER' };
    const response = { orderId, currentAttempt: { id: randomUUID(), sequence: 2 } };
    const current = { id: orderId, accessTokenHash: createHash('sha256').update(token).digest('hex'), accessExpiresAt: new Date(Date.now() + 60000) };
    let stored: unknown;
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(error),
      order: { findUnique: jest.fn().mockResolvedValue(current) },
      orderIdempotencyKey: { findUnique: jest.fn().mockImplementation(async () => stored) },
    };
    const config = { get: () => Buffer.alloc(32, 42).toString('base64') };
    const service = new OrdersService(prisma as never, {} as never, config as never);
    await service.storeReplay({ orderIdempotencyKey: { create: async ({ data }: { data: unknown }) => { stored = data; } } } as never,
      { kind: 'PAYMENT_ATTEMPT', scope: `attempt:${orderId}`, key, fingerprint: orderFingerprint({ orderId, body }), responseStatus: 201, orderId, response }, Buffer.alloc(32, 42));
    return { service, prisma, orderId, token, key, body, response };
  }

  it('replays the committed attempt on the observed adapter write conflict without another transaction', async () => {
    const f = await fixture();
    await expect(f.service.createAttempt(f.orderId, f.token, f.key, f.body)).resolves.toEqual(f.response);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rechecks possession and expiry before returning a conflict replay', async () => {
    const f = await fixture();
    await expect(f.service.createAttempt(f.orderId, 'wrong-token', f.key, f.body)).rejects.toMatchObject({ status: 403 });
    f.prisma.order.findUnique.mockResolvedValue({ accessExpiresAt: new Date(0) } as never);
    await expect(f.service.createAttempt(f.orderId, f.token, f.key, f.body)).rejects.toMatchObject({ status: 403 });
    expect(f.prisma.orderIdempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('keeps unrecognized raw-query errors unavailable rather than replaying them', async () => {
    const f = await fixture({ code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'OtherError' } } } });
    await expect(f.service.createAttempt(f.orderId, f.token, f.key, f.body)).rejects.toMatchObject({ status: 503 });
    expect(f.prisma.orderIdempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it.each(['P2002', '23505', 'P2034'])('keeps access ahead of a historical %s replay', async (code) => {
    const f = await fixture({ code });
    await expect(f.service.createAttempt(f.orderId, f.token, f.key, f.body)).resolves.toEqual(f.response);
    f.prisma.orderIdempotencyKey.findUnique.mockClear();
    await expect(f.service.createAttempt(f.orderId, 'another-order-token', f.key, f.body)).rejects.toMatchObject({ status: 403 });
    f.prisma.order.findUnique.mockResolvedValue({ accessExpiresAt: new Date(0) } as never);
    await expect(f.service.createAttempt(f.orderId, f.token, f.key, f.body)).rejects.toMatchObject({ status: 403 });
    expect(f.prisma.orderIdempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('fails unavailable authorization reads without consulting replay or starting another transaction', async () => {
    const f = await fixture();
    f.prisma.order.findUnique.mockRejectedValue(new Error('Synthetic authorization read failure'));
    await expect(f.service.createAttempt(f.orderId, f.token, f.key, f.body)).rejects.toMatchObject({ status: 503 });
    expect(f.prisma.orderIdempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

});
