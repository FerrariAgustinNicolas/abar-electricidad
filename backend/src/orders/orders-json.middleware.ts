import { randomUUID } from 'node:crypto';
import { json, Router, type RequestHandler } from 'express';

const bodyParser = json({ limit: '32kb', strict: true });

/** Parse only the bounded H4 JSON operations and never expose parser details or request bytes. */
export function createOrdersJsonRouter(): ReturnType<typeof Router> {
  const router = Router();
  const safeParser: RequestHandler = (request, response, next) => bodyParser(request, response, (error?: unknown) => {
    if (!error) { next(); return; }
    response.setHeader('Cache-Control', 'no-store');
    response.status(400).json({ code: 'VALIDATION_ERROR', message: 'No se pudo completar la operación solicitada',
      requestId: (request as typeof request & { requestId?: string }).requestId ?? randomUUID() });
  });
  router.post('/api/v1/public/orders', safeParser);
  router.post('/api/v1/public/orders/lookup', safeParser);
  router.post('/api/v1/public/orders/:id/payment-attempts', safeParser);
  router.use((error: unknown, request: any, response: any, next: (error?: unknown) => void) => {
    if (request.method === 'POST' && /^\/api\/v1\/public\/orders(?:\/lookup|\/[^/]+\/payment-attempts)?$/.test(request.path)) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(400).json({ code: 'VALIDATION_ERROR', message: 'No se pudo completar la operación solicitada',
        requestId: request.requestId ?? randomUUID() });
      return;
    }
    next(error);
  });
  return router;
}
