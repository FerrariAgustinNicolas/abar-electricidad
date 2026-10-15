import { types } from 'node:util';
import { json, Router } from 'express';

export type ChangePasswordParserError = Readonly<{
  status: 400;
  code: 'VALIDATION_ERROR';
}>;

const CHANGE_PASSWORD_PARSER_ERROR: ChangePasswordParserError = Object.freeze({
  status: 400,
  code: 'VALIDATION_ERROR',
});
const ownedParserErrors = new WeakMap<object, ChangePasswordParserError>();
const CHANGE_PASSWORD_PATH = '/api/v1/auth/change-password';

/** Return public metadata only for parser failures minted by this router. */
export function readChangePasswordParserError(value: unknown): ChangePasswordParserError | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return undefined;
  return ownedParserErrors.get(value as object);
}

/** Parse JSON only on the real change-password POST route before Nest's parser. */
export function createChangePasswordJsonRouter(): ReturnType<typeof Router> {
  const router = Router();
  const parseJson = json();

  router.post(CHANGE_PASSWORD_PATH, (request, response, next) => {
    parseJson(request, response, (error?: unknown) => {
      if (error === undefined) {
        next();
        return;
      }

      if (!isMalformedJsonParserError(error)) {
        next(error);
        return;
      }

      // Never forward the parser's body, message, cause, or other private fields.
      const publicError = Object.freeze(Object.create(null)) as object;
      ownedParserErrors.set(publicError, CHANGE_PASSWORD_PARSER_ERROR);
      next(publicError);
    });
  });

  return router;
}

function isMalformedJsonParserError(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  if (types.isProxy(value)) return false;

  try {
    const status = Object.getOwnPropertyDescriptor(value, 'status');
    const type = Object.getOwnPropertyDescriptor(value, 'type');
    return status !== undefined && 'value' in status && status.value === 400 &&
      type !== undefined && 'value' in type && type.value === 'entity.parse.failed';
  } catch {
    // Unexpected descriptor-inspection failures are not trusted parser evidence.
    return false;
  }
}
