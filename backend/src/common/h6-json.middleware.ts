import { randomUUID } from 'node:crypto';
import { json, Router, type RequestHandler } from 'express';

/** H6-only bounded parser; malformed input never escapes through generic parser diagnostics. */
export function createH6JsonRouter(): ReturnType<typeof Router> {
  const router = Router();
  const parse = json({ limit: '16kb', strict: true });
  const safe: RequestHandler = (request, response, next) => parse(request, response, (error?: unknown) => {
    if (!error) { next(); return; }
    response.setHeader('Cache-Control', 'no-store');
    response.status(400).json({ code: 'VALIDATION_ERROR', message: 'No se pudo completar la operación solicitada',
      requestId: (request as typeof request & { requestId?: string }).requestId ?? randomUUID() });
  });
  router.patch('/api/v1/admin/settings', safe);
  router.patch('/api/v1/admin/payment-methods/:code', safe);
  router.post('/api/v1/admin/notifications/:id/retry', safe);
  return router;
}
