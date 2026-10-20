import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { getAdminUsersErrorMetadata } from '../auth/admin-users.service';

const metadata = new WeakMap<object, Readonly<{ status: number; code: string }>>();
export class CatalogException extends HttpException {
  constructor(status: number, code: string) {
    const safeStatus = [400, 401, 403, 404, 409, 413, 415, 503].includes(status) ? status : 503;
    const safeCode = /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : 'SERVICE_UNAVAILABLE';
    super(safeCode, safeStatus);
    metadata.set(this, Object.freeze({ status: safeStatus, code: safeCode }));
  }
}

@Catch()
export class CatalogExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const own = typeof error === 'object' && error !== null ? metadata.get(error) : undefined;
    const auth = getAdminUsersErrorMetadata(error);
    const multerCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const tooLarge = multerCode === 'LIMIT_FILE_SIZE' ||
      (error instanceof HttpException && error.getStatus() === 413);
    const status = own?.status ?? auth?.status ?? (tooLarge ? 413 : error instanceof HttpException && error.getStatus() < 500 ? error.getStatus() : 503);
    const code = own?.code ?? auth?.code ?? (tooLarge ? 'IMAGE_TOO_LARGE' : status === 400 ? 'VALIDATION_ERROR' : status === 404 ? 'RESOURCE_NOT_FOUND' : 'SERVICE_UNAVAILABLE');
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({ code, message: status >= 500 ? 'Servicio temporalmente no disponible' : 'No se pudo completar la operación solicitada', requestId: request.requestId ?? randomUUID() });
  }
}

export function catalogRequest(request: Request) {
  const single = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  return { cookieHeader: single(request.headers.cookie), origin: single(request.headers.origin), csrfToken: single(request.headers['x-csrf-token']) };
}
