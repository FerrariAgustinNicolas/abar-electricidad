import { randomUUID } from 'node:crypto';
import { CatalogException } from '../catalog-shared/catalog-error';
import { CheckoutService } from './checkout.service';
import { PublicCheckoutRateLimiter } from './public-checkout-rate-limiter';

const policy = () => ({
  id: 'default', feeMinor: 250n, quoteTtlSeconds: 600, version: 1,
  enabledDeliveryModes: ['PICKUP', 'COORDINATED'],
  paymentMethods: [
    { code: 'DEMO_PAY_ON_PICKUP', label: 'Demo pay on pickup', instructions: 'Fictitious instructions.', deliveryModes: ['PICKUP'], demo: true },
    { code: 'DEMO_TRANSFER', label: 'Demo transfer', instructions: 'Fictitious instructions.', deliveryModes: ['PICKUP', 'COORDINATED'], demo: true },
    { code: 'DEMO_SIMULATION', label: 'Demo simulation', instructions: 'Fictitious instructions.', deliveryModes: ['PICKUP', 'COORDINATED'], demo: true },
  ],
});

const productRow = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(), productId: randomUUID(), unit: 'METER', rollLengthMeters: null,
  amountMinor: 125n, active: true, version: 1, balance: { availableQuantity: 20, version: 1 },
  product: { id: randomUUID(), slug: 'demo-cable', name: 'Demo cable', active: true, version: 1, category: { active: true, version: 1 } },
  ...overrides,
});

function fixture(rows = [productRow()]) {
  const created: Array<Record<string, unknown>> = [];
  const policyReader = { findUnique: jest.fn().mockResolvedValue(policy()) };
  const tx = {
    checkoutPolicy: policyReader,
    productPresentation: { findMany: jest.fn().mockResolvedValue(rows) },
    checkoutQuote: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; }) },
  };
  const prisma = { checkoutPolicy: policyReader, $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
  return { service: new CheckoutService(prisma as never), prisma, tx, created };
}

function request(items: Array<{ presentationId: string; quantity: number }>) {
  return { items, deliveryMode: 'COORDINATED', paymentMethodCode: 'DEMO_TRANSFER' };
}

async function expectError(promise: Promise<unknown>, status: number, code: string) {
  await promise.then(
    () => { throw new Error(`Expected ${status} ${code}`); },
    (error: unknown) => {
      expect(error).toBeInstanceOf(CatalogException);
      expect((error as CatalogException).getStatus()).toBe(status);
      expect((error as CatalogException).getResponse()).toBe(code);
    },
  );
}

describe('CheckoutService', () => {
  it('returns only enabled public demo choices and reports the authoritative bounded policy', async () => {
    const { service, tx } = fixture();
    const settings = await service.getPublicSettings();
    expect(settings).toMatchObject({ mode: 'DEMO', deliveryModes: ['PICKUP', 'COORDINATED'], deliveryFee: { amountMinor: '250', currency: 'ARS' }, quoteTtlSeconds: 600, maxLines: 100, maxQuantity: 1_000_000 });
    const pickup = await service.getPublicPaymentMethods('PICKUP');
    expect(pickup.items.map((method) => method.code)).toEqual(['DEMO_PAY_ON_PICKUP', 'DEMO_TRANSFER', 'DEMO_SIMULATION']);
    await expectError(service.getPublicPaymentMethods('COORDINATED '), 400, 'VALIDATION_ERROR');
    const coordinated = fixture();
    coordinated.tx.checkoutPolicy.findUnique.mockResolvedValue({ ...policy(), enabledDeliveryModes: ['PICKUP'] });
    expect(await coordinated.service.getPublicPaymentMethods('COORDINATED')).toEqual({ items: [] });
    expect(tx.checkoutPolicy.findUnique).toHaveBeenCalledTimes(2);
  });

  it('aggregates duplicate presentations, sorts snapshots, computes exact money and persists without stock writes', async () => {
    const first = productRow({ id: '30000000-0000-4000-8000-000000000003', amountMinor: 125n });
    const second = productRow({ id: '10000000-0000-4000-8000-000000000001', unit: 'ROLL', rollLengthMeters: 100, amountMinor: 2500n });
    const { service, prisma, tx, created } = fixture([first, second]);
    const response = await service.createQuote(request([
      { presentationId: first.id.toUpperCase(), quantity: 2 }, { presentationId: second.id, quantity: 1 }, { presentationId: first.id, quantity: 3 },
    ]));

    expect(response.items.map((item) => item.presentationId)).toEqual([second.id, first.id]);
    expect(response.items.map((item) => item.quantity)).toEqual([1, 5]);
    expect(response.subtotal).toEqual({ amountMinor: '3125', currency: 'ARS' });
    expect(response.deliveryFee).toEqual({ amountMinor: '250', currency: 'ARS' });
    expect(response.total).toEqual({ amountMinor: '3375', currency: 'ARS' });
    expect(response).toMatchObject({ policyVersion: 1, warnings: ['QUOTE_DOES_NOT_RESERVE_STOCK', 'DEMO_PAYMENT_METHODS_ONLY'] });
    expect(response.stateFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(response.expiresAt)).toBeGreaterThan(Date.now());
    expect(created).toHaveLength(1);
    expect(created[0].response).toEqual(response);
    expect(created[0].stateFingerprint).toBe(response.stateFingerprint);
    expect(tx.productPresentation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [second.id, first.id] } } }));
    expect(tx).not.toHaveProperty('stockBalance.update');
    expect(tx).not.toHaveProperty('stockOperation.create');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
  });

  it('charges no delivery fee for pickup even when coordinated delivery has a configured fee', async () => {
    const row = productRow({ id: '50000000-0000-4000-8000-000000000005', amountMinor: 125n });
    const { service } = fixture([row]);
    const response = await service.createQuote({
      items: [{ presentationId: row.id, quantity: 1 }], deliveryMode: 'PICKUP', paymentMethodCode: 'DEMO_PAY_ON_PICKUP',
    });
    expect(response.deliveryFee).toEqual({ amountMinor: '0', currency: 'ARS' });
    expect(response.paymentMethod.deliveryModes).toEqual(['PICKUP']);
    expect(response.total.amountMinor).toBe('125');
  });

  it('rejects unknown fields and invalid quantities before any database read', async () => {
    const { service, tx } = fixture();
    await expectError(service.createQuote({ ...request([{ presentationId: randomUUID(), quantity: 1 }]), total: '1' }), 400, 'VALIDATION_ERROR');
    await expectError(service.createQuote(request([{ presentationId: randomUUID(), quantity: 1.5 }])), 400, 'VALIDATION_ERROR');
    await expectError(service.createQuote({ ...request([{ presentationId: randomUUID(), quantity: 1 }]), items: [{ presentationId: randomUUID(), quantity: 1, amountMinor: '0' }] }), 400, 'VALIDATION_ERROR');
    await expectError(service.createQuote(request([{ presentationId: randomUUID(), quantity: 0 }])), 400, 'VALIDATION_ERROR');
    expect(tx.checkoutPolicy.findUnique).not.toHaveBeenCalled();
  });

  it('checks duplicate aggregate quantity before catalog lookup and rejects stock shortage without disclosure', async () => {
    const row = productRow({ id: '20000000-0000-4000-8000-000000000002', balance: { availableQuantity: 3, version: 1 } });
    const { service, tx } = fixture([row]);
    await expectError(service.createQuote(request([{ presentationId: row.id, quantity: 1_000_000 }, { presentationId: row.id, quantity: 1 }])), 400, 'VALIDATION_ERROR');
    expect(tx.productPresentation.findMany).not.toHaveBeenCalled();

    await expectError(service.createQuote(request([{ presentationId: row.id, quantity: 4 }])), 409, 'INSUFFICIENT_STOCK');
    expect(JSON.stringify(tx.checkoutQuote.create.mock.calls)).not.toContain('3');
  });

  it('fails closed when persisted policy is malformed or the delivery method is disabled', async () => {
    const { service, tx } = fixture();
    tx.checkoutPolicy.findUnique.mockResolvedValueOnce({ ...policy(), quoteTtlSeconds: 3 });
    await expectError(service.getPublicSettings(), 503, 'SERVICE_UNAVAILABLE');
    const validButDisabled = policy();
    const disabled = fixture();
    disabled.tx.checkoutPolicy.findUnique.mockResolvedValue({ ...validButDisabled, paymentMethods: validButDisabled.paymentMethods.filter((method) => method.code !== 'DEMO_TRANSFER') });
    await expectError(disabled.service.createQuote(request([{ presentationId: randomUUID(), quantity: 1 }])), 409, 'METHOD_UNAVAILABLE');
    expect(disabled.tx.productPresentation.findMany).not.toHaveBeenCalled();
  });

  it('rejects hidden products and prices that would overflow signed 64-bit minor units', async () => {
    const hidden = productRow({ id: '40000000-0000-4000-8000-000000000004', product: { ...productRow().product, active: false } });
    const { service } = fixture([hidden]);
    await expectError(service.createQuote(request([{ presentationId: hidden.id, quantity: 1 }])), 409, 'PRODUCT_UNAVAILABLE');

    const huge = productRow({ amountMinor: 9_223_372_036_854_775_807n, balance: { availableQuantity: 2, version: 1 } });
    const overflow = fixture([huge]);
    await expectError(overflow.service.createQuote(request([{ presentationId: huge.id, quantity: 2 }])), 400, 'VALIDATION_ERROR');
  });
});

describe('PublicCheckoutRateLimiter', () => {
  it('enforces the public limit per direct peer and keeps its key set bounded', () => {
    let now = 0;
    const limiter = new PublicCheckoutRateLimiter({ limit: 2, windowMs: 1_000, maxKeys: 2, now: () => now });
    expect(() => limiter.consume('127.0.0.1')).not.toThrow();
    expect(() => limiter.consume('127.0.0.1')).not.toThrow();
    expect(() => limiter.consume('127.0.0.1')).toThrow('RATE_LIMITED');
    expect(limiter.size).toBeLessThanOrEqual(2);
    now = 1_000;
    expect(() => limiter.consume('127.0.0.1')).not.toThrow();
    limiter.consume('127.0.0.2');
    limiter.consume('127.0.0.3');
    expect(limiter.size).toBeLessThanOrEqual(2);
  });
});
