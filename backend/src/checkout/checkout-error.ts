import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CatalogExceptionFilter } from '../catalog-shared/catalog-error';

/** Preserves the shared H2 envelope while mapping the H3 rate-limit code explicitly. */
@Catch()
export class CheckoutExceptionFilter implements ExceptionFilter {
  private readonly catalogFilter = new CatalogExceptionFilter();

  catch(error: unknown, host: ArgumentsHost): void {
    if (error instanceof HttpException && error.getStatus() === 429) {
      const http = host.switchToHttp();
      const request = http.getRequest<Request & { requestId?: string }>();
      const response = http.getResponse<Response>();
      response.setHeader('Cache-Control', 'no-store');
      response.status(429).json({ code: 'RATE_LIMITED', message: 'No se pudo completar la operación solicitada', requestId: request.requestId ?? randomUUID() });
      return;
    }
    this.catalogFilter.catch(error, host);
  }
}
