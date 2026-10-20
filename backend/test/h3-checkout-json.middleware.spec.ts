import express from 'express';
import request from 'supertest';
import { createCheckoutJsonRouter } from '../src/checkout/checkout-json.middleware';

describe('H3 quote JSON parser', () => {
  it('maps malformed or oversized quote JSON to a private 400 validation envelope', async () => {
    const app = express();
    app.use((req, _res, next) => { (req as typeof req & { requestId?: string }).requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; next(); });
    app.use(createCheckoutJsonRouter());
    app.use(express.json());
    app.post('/api/v1/public/checkout/quotes', (req, res) => res.status(201).json(req.body));

    const malformed = await request(app).post('/api/v1/public/checkout/quotes').set('Content-Type', 'application/json').send('{"secret":"malformed-bank-value"} trailing').expect(400);
    expect(malformed.headers['cache-control']).toBe('no-store');
    expect(malformed.body).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    expect(JSON.stringify(malformed.body)).not.toContain('malformed-bank-value');

    const oversized = await request(app).post('/api/v1/public/checkout/quotes').set('Content-Type', 'application/json').send(JSON.stringify({ payload: 'x'.repeat(33_000) })).expect(400);
    expect(oversized.headers['cache-control']).toBe('no-store');
    expect(oversized.body.code).toBe('VALIDATION_ERROR');
  });

  it('leaves other routes to the ordinary JSON parser', async () => {
    const app = express();
    app.use(createCheckoutJsonRouter());
    app.use(express.json());
    app.post('/api/v1/auth/login', (_req, res) => res.status(201).json({ ok: true }));
    await request(app).post('/api/v1/auth/login').send({}).expect(201);
  });
});
