import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogException } from '../src/catalog-shared/catalog-error';
import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { PublicCheckoutRateLimiter } from '../src/checkout/public-checkout-rate-limiter';

const settings = { mode: 'DEMO', policyVersion: 1, deliveryModes: ['PICKUP'], deliveryFee: { amountMinor: '0', currency: 'ARS' }, quoteTtlSeconds: 600, maxLines: 100, maxQuantity: 1_000_000 };
const presentationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const quote = { quoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: '2026-10-20T12:00:00.000Z', items: [
  { presentationId, productId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', productSlug: 'demo', productName: 'Demo item', unit: 'METER', rollLengthMeters: null, quantity: 1, unitPrice: { amountMinor: '100', currency: 'ARS' }, lineTotal: { amountMinor: '100', currency: 'ARS' } },
], subtotal: { amountMinor: '100', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' }, total: { amountMinor: '100', currency: 'ARS' }, deliveryMode: 'PICKUP', paymentMethod: { code: 'DEMO_TRANSFER', label: 'Demo transfer', instructions: 'Fictitious instructions.', demo: true, deliveryModes: ['PICKUP'] }, policyVersion: 1, stateFingerprint: 'a'.repeat(64), warnings: ['QUOTE_DOES_NOT_RESERVE_STOCK', 'DEMO_PAYMENT_METHODS_ONLY'] };

async function createApp(limit = 30) {
  const service = {
    getPublicSettings: jest.fn().mockResolvedValue(settings),
    getPublicPaymentMethods: jest.fn().mockResolvedValue({ items: [] }),
    createQuote: jest.fn().mockResolvedValue(quote),
  };
  const module = await Test.createTestingModule({
    controllers: [CheckoutController],
    providers: [
      { provide: CheckoutService, useValue: service },
      { provide: PublicCheckoutRateLimiter, useFactory: () => new PublicCheckoutRateLimiter({ limit, windowMs: 60_000 }) },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return { app, service };
}

describe('H3 public checkout HTTP routes', () => {
  it('serves settings and demo methods with no-store and rejects unexpected query keys', async () => {
    const { app, service } = await createApp();
    try {
      await request(app.getHttpServer()).get('/api/v1/public/settings').expect(200).expect('Cache-Control', 'no-store').expect(settings);
      await request(app.getHttpServer()).get('/api/v1/public/payment-methods?deliveryMode=PICKUP').expect(200).expect('Cache-Control', 'no-store').expect({ items: [] });
      await request(app.getHttpServer()).get('/api/v1/public/settings?debug=1').expect(400).expect('Cache-Control', 'no-store');
      expect(service.getPublicPaymentMethods).toHaveBeenCalledWith('PICKUP');
    } finally { await app.close(); }
  });

  it('accepts a public quote without session or CSRF and bounds the peer quota with a sanitized envelope', async () => {
    const { app, service } = await createApp(1);
    try {
      const body = { items: [{ presentationId, quantity: 1 }], deliveryMode: 'PICKUP', paymentMethodCode: 'DEMO_TRANSFER' };
      const result = await request(app.getHttpServer()).post('/api/v1/public/checkout/quotes').send(body)
        .expect(201).expect('Cache-Control', 'no-store');
      expect(result.body).toEqual(quote);
      expect(service.createQuote).toHaveBeenCalledWith(body);
      const limited = await request(app.getHttpServer()).get('/api/v1/public/settings').expect(429).expect('Cache-Control', 'no-store');
      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', message: expect.any(String), requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
      expect(JSON.stringify(limited.body)).not.toContain('availableQuantity');
    } finally { await app.close(); }
  });

  it('keeps contract 4xx codes and standard messages safe', async () => {
    const { app, service } = await createApp();
    (service.createQuote as jest.Mock).mockRejectedValueOnce(new CatalogException(409, 'PRODUCT_UNAVAILABLE'));
    try {
      const error = await request(app.getHttpServer()).post('/api/v1/public/checkout/quotes').send({}).expect(409).expect('Cache-Control', 'no-store');
      expect(error.body).toMatchObject({ code: 'PRODUCT_UNAVAILABLE', message: expect.any(String), requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
      expect(JSON.stringify(error.body)).not.toContain('availableQuantity');
    } finally { await app.close(); }
  });
});
