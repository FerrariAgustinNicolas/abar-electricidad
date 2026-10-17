import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, HttpStatus, Patch, Post,
  Req, Res, UseFilters,
} from '@nestjs/common';
import { ApiBody, ApiExtension, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  getAdminUsersErrorMessage, getAdminUsersErrorMetadata,
} from './admin-users.service';
import { AdminUsersService } from './admin-users.service';

const noStore = { description: 'No H1 identity or credential data is stored by intermediaries.', schema: { type: 'string', enum: ['no-store'] } };
const errorSchema = {
  type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'],
  properties: {
    code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 },
    requestId: { type: 'string', format: 'uuid' },
  },
};
const userSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'name', 'email', 'active', 'mustChangePassword', 'version', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 }, active: { type: 'boolean' },
    mustChangePassword: { type: 'boolean' }, version: { type: 'integer', minimum: 1 },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
  },
};
const passwordSchema = { type: 'string', minLength: 15, maxLength: 128, writeOnly: true };

type RequestWithId = Request & { requestId?: string };
const singleHeader = (value: string | string[] | undefined): string | undefined => typeof value === 'string' ? value : undefined;
const singleParam = (value: string | string[] | undefined): string | undefined => typeof value === 'string' ? value : undefined;

@Catch()
export class AdminUsersExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const owned = getAdminUsersErrorMetadata(exception);
    const fallbackStatus = exception instanceof HttpException ? exception.getStatus() : HttpStatus.SERVICE_UNAVAILABLE;
    const status = owned?.status ?? (fallbackStatus >= 500 ? HttpStatus.SERVICE_UNAVAILABLE : fallbackStatus);
    const code = owned?.code ?? (status === 400 ? 'VALIDATION_ERROR' : status === 404 ? 'USER_NOT_FOUND' : 'SERVICE_UNAVAILABLE');
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({
      code, message: owned ? getAdminUsersErrorMessage(owned.code) :
        status === 400 ? 'Los datos enviados no son válidos' : 'Servicio temporalmente no disponible',
      requestId: request.requestId ?? randomUUID(),
    });
  }
}

@Controller('api/v1/admin/users')
@ApiTags('admin')
@ApiSecurity('AdminSessionCookie')
@UseFilters(AdminUsersExceptionFilter)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ operationId: 'listAdminUsers', summary: 'List sanitized administrators' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'sort', required: false, schema: { type: 'string', enum: ['name', '-name', 'email', '-email', 'createdAt', '-createdAt'], default: '-createdAt' } })
  @ApiExtension('x-abar-errors', { '400': ['VALIDATION_ERROR'], '401': ['SESSION_EXPIRED'], '403': ['PASSWORD_CHANGE_REQUIRED'], '503': ['SERVICE_UNAVAILABLE'] })
  @ApiResponse({ status: 200, description: 'Sanitized page of users.', headers: { 'Cache-Control': noStore }, schema: {
    type: 'object', additionalProperties: false, required: ['items', 'pageInfo'],
    properties: {
      items: { type: 'array', maxItems: 100, items: userSchema },
      pageInfo: { type: 'object', additionalProperties: false, required: ['page', 'pageSize', 'totalItems', 'totalPages'],
        properties: { page: { type: 'integer' }, pageSize: { type: 'integer' }, totalItems: { type: 'integer' }, totalPages: { type: 'integer' } } },
    },
  } })
  @ApiResponse({ status: 400, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 401, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 403, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 503, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  async list(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.users.list({ cookieHeader: request.headers.cookie, query: request.query as Record<string, unknown> });
    response.status(200).json(result);
  }

  @Post()
  @ApiOperation({ operationId: 'createAdminUser', summary: 'Create an administrator requiring a password change' })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string', minLength: 1 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } })
  @ApiBody({ required: true, schema: { type: 'object', additionalProperties: false, required: ['name', 'email', 'temporaryPassword'], properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 }, email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 }, temporaryPassword: passwordSchema,
  } } })
  @ApiExtension('x-abar-errors', { '400': ['VALIDATION_ERROR', 'PASSWORD_POLICY'], '401': ['SESSION_EXPIRED'], '403': ['PASSWORD_CHANGE_REQUIRED', 'ORIGIN_INVALID', 'CSRF_INVALID'], '409': ['EMAIL_IN_USE'], '503': ['SERVICE_UNAVAILABLE'] })
  @ApiResponse({ status: 201, headers: { 'Cache-Control': noStore }, schema: userSchema })
  @ApiResponse({ status: 400, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 401, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 403, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 409, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 503, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  async create(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.users.create({
      body: request.body, cookieHeader: singleHeader(request.headers.cookie), origin: singleHeader(request.headers.origin),
      csrfToken: singleHeader(request.headers['x-csrf-token']),
    });
    response.status(201).json(result);
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'patchAdminUser', summary: 'Update an administrator using optimistic concurrency' })
  @ApiParam({ name: 'id', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string', minLength: 1 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } })
  @ApiBody({ required: true, schema: { type: 'object', additionalProperties: false, required: ['expectedVersion'], minProperties: 2,
    anyOf: [{ required: ['name'] }, { required: ['active'] }], properties: {
      expectedVersion: { type: 'integer', minimum: 1 }, name: { type: 'string', minLength: 1, maxLength: 100 }, active: { type: 'boolean' },
    },
  } })
  @ApiExtension('x-abar-errors', { '400': ['VALIDATION_ERROR'], '401': ['SESSION_EXPIRED'], '403': ['PASSWORD_CHANGE_REQUIRED', 'ORIGIN_INVALID', 'CSRF_INVALID'], '404': ['USER_NOT_FOUND'], '409': ['VERSION_CONFLICT', 'LAST_ACTIVE_ADMIN'], '503': ['SERVICE_UNAVAILABLE'] })
  @ApiResponse({ status: 200, headers: { 'Cache-Control': noStore }, schema: userSchema })
  @ApiResponse({ status: 400, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 401, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 403, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 404, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 409, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 503, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  async patch(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.users.patch({
      id: singleParam(request.params.id), body: request.body, cookieHeader: singleHeader(request.headers.cookie),
      origin: singleHeader(request.headers.origin), csrfToken: singleHeader(request.headers['x-csrf-token']),
    });
    response.status(200).json(result);
  }

  @Post(':id/reset-password')
  @ApiOperation({ operationId: 'resetAdminUserPassword', summary: 'Reset an administrator password and revoke its sessions' })
  @ApiParam({ name: 'id', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string', minLength: 1 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } })
  @ApiBody({ required: true, schema: { type: 'object', additionalProperties: false, required: ['temporaryPassword', 'reason'], properties: {
    temporaryPassword: passwordSchema, reason: { type: 'string', minLength: 1, maxLength: 500 },
  } } })
  @ApiExtension('x-abar-errors', { '400': ['VALIDATION_ERROR', 'PASSWORD_POLICY'], '401': ['SESSION_EXPIRED'], '403': ['PASSWORD_CHANGE_REQUIRED', 'ORIGIN_INVALID', 'CSRF_INVALID'], '404': ['USER_NOT_FOUND'], '503': ['SERVICE_UNAVAILABLE'] })
  @ApiResponse({ status: 204, description: 'No content; target sessions are revoked.', headers: { 'Cache-Control': noStore } })
  @ApiResponse({ status: 400, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 401, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 403, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 404, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  @ApiResponse({ status: 503, headers: { 'Cache-Control': noStore }, schema: errorSchema })
  async resetPassword(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    await this.users.resetPassword({
      id: singleParam(request.params.id), body: request.body, cookieHeader: singleHeader(request.headers.cookie),
      origin: singleHeader(request.headers.origin), csrfToken: singleHeader(request.headers['x-csrf-token']),
    });
    response.status(204).end();
  }
}
