import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { json, Router, type ErrorRequestHandler, type RequestHandler } from 'express';

const QUOTE_PATH = '/api/v1/public/checkout/quotes';
const MAX_BODY_BYTES = 32 * 1024;

/** Parse quote JSON before Nest's general parser and keep parser diagnostics private. */
export function createCheckoutJsonRouter(): ReturnType<typeof Router> {
  const router = Router();
  const parseJson = json({ limit: MAX_BODY_BYTES, strict: true });
  const parseQuoteJson: RequestHandler = (request, response, next) => {
    parseJson(request, response, (error?: unknown) => {
      if (error === undefined) { next(); return; }
      // This parser is mounted only for the quote route; its failures are all bad request bodies.
      // Do not pass parser messages, request bytes, or cause chains into app-level error handlers.
      response.setHeader('Cache-Control', 'no-store');
      response.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'No se pudo completar la operación solicitada',
        requestId: (request as typeof request & { requestId?: string }).requestId ?? randomUUID(),
      });
    });
  };
  const rejectUnexpectedRouteError: ErrorRequestHandler = (error, request, response, next) => {
    if (request.method === 'POST' && request.path === QUOTE_PATH && isOwnedJsonParserError(error)) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'No se pudo completar la operación solicitada',
        requestId: (request as typeof request & { requestId?: string }).requestId ?? randomUUID(),
      });
      return;
    }
    next(error);
  };
  router.post(QUOTE_PATH, parseQuoteJson);
  router.use(rejectUnexpectedRouteError);
  return router;
}

function isOwnedJsonParserError(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  if (types.isProxy(value)) return false;
  try {
    const status = Object.getOwnPropertyDescriptor(value, 'status');
    const type = Object.getOwnPropertyDescriptor(value, 'type');
    const statusValue = status && 'value' in status ? status.value : undefined;
    const typeValue = type && 'value' in type ? type.value : undefined;
    return (statusValue === 400 && typeValue === 'entity.parse.failed') || statusValue === 413;
  } catch { return false; }
}
