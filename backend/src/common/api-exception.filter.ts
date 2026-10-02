import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };
type ErrorBody = { code: string; message: string; requestId: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.safeBody(status, requestId);
    response.status(status).json(body);
  }

  private safeBody(status: number, requestId: string): ErrorBody {
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return { code: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente no disponible', requestId };
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return { code: 'VALIDATION_FAILED', message: 'Los datos enviados no son válidos', requestId };
    }
    if (status === HttpStatus.NOT_FOUND) {
      return { code: 'NOT_FOUND', message: 'Recurso no encontrado', requestId };
    }
    if (status >= 500) {
      return { code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor', requestId };
    }
    return { code: 'REQUEST_FAILED', message: 'No se pudo procesar la solicitud', requestId };
  }
}
