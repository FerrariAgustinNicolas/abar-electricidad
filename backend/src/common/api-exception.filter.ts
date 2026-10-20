import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { getCsrfRouteErrorMetadata } from '../auth/csrf.service';
import { getLoginRouteErrorMetadata } from '../auth/login.service';
import { getSessionRouteErrorMetadata } from '../auth/session.service';
import { readChangePasswordError } from '../auth/change-password.service';
import { readChangePasswordParserError } from './change-password-json.middleware';

type RequestWithId = Request & { requestId?: string; route?: { path?: unknown }; baseUrl?: string };
type ErrorBody = { code: string; message: string; requestId: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    // Resolve immutable WeakMap metadata before consulting exception accessors.
    const changePasswordError = readChangePasswordError(exception);
    const parserError = readChangePasswordParserError(exception);
    const sessionError = getSessionRouteErrorMetadata(exception);
    const csrfError = getCsrfRouteErrorMetadata(exception);
    const loginError = getLoginRouteErrorMetadata(exception);
    const ownedError = changePasswordError ?? parserError ?? sessionError ?? loginError ?? csrfError;
    const requestId = request.requestId ?? randomUUID();
    const status = ownedError?.status ??
      (exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
    const ownedStatus = ownedError?.status;
    if (sessionError !== undefined || csrfError !== undefined || loginError !== undefined ||
        changePasswordError !== undefined || parserError !== undefined || this.isAuthHandler(request)) {
      response.setHeader('Cache-Control', 'no-store');
    }
    const code = ownedStatus === status
      ? changePasswordError?.code ?? parserError?.code ?? sessionError?.code ?? loginError?.code ?? csrfError?.code
      : undefined;
    const retryAfter = loginError?.status === status ? loginError.retryAfter
      : csrfError?.status === status ? csrfError.retryAfter : undefined;
    if (status === HttpStatus.TOO_MANY_REQUESTS && retryAfter !== undefined) {
      response.setHeader('Retry-After', String(retryAfter));
    }
    const body = this.safeBody(status, requestId, code);
    response.status(status).json(body);
  }

  private isAuthHandler(request: RequestWithId): boolean {
    const routePath = request.route?.path;
    if (typeof routePath !== 'string') return false;
    const normalize = (path: string): string => path.toLowerCase().replace(/\/+$/, '') || '/';
    const base = (request.baseUrl ?? '').replace(/\/+$/, '');
    const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
    const matched = normalize(`${base}${route}`);
    return normalize(routePath) === '/api/v1/auth/csrf' || matched === '/api/v1/auth/csrf' ||
      normalize(routePath) === '/api/v1/auth/login' || matched === '/api/v1/auth/login' ||
      normalize(routePath) === '/api/v1/auth/me' || matched === '/api/v1/auth/me' ||
      normalize(routePath) === '/api/v1/auth/change-password' || matched === '/api/v1/auth/change-password';
  }

  private safeBody(status: number, requestId: string, ownedCode?: string): ErrorBody {
    if (ownedCode) {
      const messages: Record<string, string> = {
        VALIDATION_ERROR: 'Los datos enviados no son válidos',
        INVALID_CREDENTIALS: 'Credenciales inválidas',
        ORIGIN_INVALID: 'Origen no permitido',
        CSRF_INVALID: 'Solicitud inválida',
        PASSWORD_CHANGE_REQUIRED: 'Se requiere cambiar la contraseña',
        RATE_LIMITED: 'Demasiadas solicitudes',
        SERVICE_UNAVAILABLE: 'Servicio temporalmente no disponible',
        SESSION_EXPIRED: 'La sesión ha expirado',
        PASSWORD_POLICY: 'La contraseña no cumple la política de seguridad',
      };
      return { code: ownedCode, message: messages[ownedCode] ?? 'No se pudo procesar la solicitud', requestId };
    }
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
