import express from 'express';
import request from 'supertest';
import { createH6JsonRouter } from '../src/common/h6-json.middleware';
describe('bounded H6 JSON parser', () => {
  const app = () => {
    const server = express(); server.use(createH6JsonRouter());
    server.patch('/api/v1/admin/settings', (_req, res) => res.status(200).json({ok:true}));
    server.patch('/api/v1/admin/payment-methods/:code', (_req, res) => res.status(200).json({ok:true}));
    server.post('/api/v1/admin/notifications/:id/retry', (_req, res) => res.status(200).json({ok:true}));
    return server;
  };
  it.each([
    ['patch', '/api/v1/admin/settings'], ['patch', '/api/v1/admin/payment-methods/DEMO_TRANSFER'], ['post', '/api/v1/admin/notifications/demo/retry'],
  ] as const)('returns a safe no-store validation error for malformed %s %s', async (method, path) => {
    const result = await request(app())[method](path).set('Content-Type','application/json').send('{"secret":"PRIVATE_INPUT",');
    expect(result.status).toBe(400); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.code).toBe('VALIDATION_ERROR'); expect(JSON.stringify(result.body)).not.toContain('PRIVATE_INPUT');
  });
  it('accepts valid bounded JSON and rejects oversized bodies', async () => {
    expect((await request(app()).patch('/api/v1/admin/settings').send({expectedVersion:1})).status).toBe(200);
    const tooLarge = await request(app()).patch('/api/v1/admin/settings').send({text:'x'.repeat(32768)});
    expect(tooLarge.status).toBe(400); expect(tooLarge.headers['cache-control']).toBe('no-store');
  });
});
