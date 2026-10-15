import { Controller, Get, HttpCode, Optional, Post, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiBody, ApiExtension, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CsrfService } from './csrf.service';
import { LoginService } from './login.service';
import { LogoutService } from './logout.service';
import { SessionService } from './session.service';
import { ChangePasswordService } from './change-password.service';

const noStoreHeader = {
  description: 'Prevents storage of authentication metadata.',
  schema: { type: 'string', enum: ['no-store'] },
};
const csrfErrorSchema = {
  type: 'object', additionalProperties: false,
  required: ['code', 'message', 'requestId'],
  properties: {
    code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 },
    fieldErrors: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['field', 'code', 'message'],
        properties: { field: { type: 'string', minLength: 1 }, code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 } },
      },
    },
    requestId: { type: 'string', format: 'uuid' },
  },
};
const sessionViewSchema = {
  type: 'object', additionalProperties: false, required: ['admin', 'expiresAt'],
  properties: {
    admin: {
      type: 'object', additionalProperties: false,
      required: ['id', 'name', 'email', 'mustChangePassword'],
      properties: {
        id: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 1, maxLength: 100 },
        email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 }, mustChangePassword: { type: 'boolean' },
      },
    },
    expiresAt: { type: 'string', format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$' },
  },
};
const loginSessionSchema = {
  type: 'object', additionalProperties: false, required: ['admin', 'expiresAt'],
  properties: {
    admin: {
      type: 'object', additionalProperties: false,
      required: ['id', 'name', 'email', 'mustChangePassword'],
      properties: {
        id: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 1, maxLength: 100 },
        email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 }, mustChangePassword: { type: 'boolean' },
      },
    },
    expiresAt: { type: 'string', format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$' },
  },
};
const loginErrorSchema = {
  type: 'object', additionalProperties: false,
  required: ['code', 'message', 'requestId'],
  properties: {
    code: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
    fieldErrors: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['field', 'code', 'message'],
        properties: {
          field: { type: 'string', minLength: 1 },
          code: { type: 'string', minLength: 1 },
          message: { type: 'string', minLength: 1 },
        },
      },
    },
    requestId: { type: 'string', format: 'uuid' },
  },
};

@Controller('api/v1/auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly csrf: CsrfService,
    private readonly loginService: LoginService,
    private readonly sessionService?: SessionService,
    @Optional() private readonly logoutService?: LogoutService,
    @Optional() private readonly changePasswordService?: ChangePasswordService,
  ) {}

  @Get('me')
  @HttpCode(200)
  @ApiSecurity('AdminSessionCookie')
  @ApiOperation({ operationId: 'getAdminSession', summary: 'Restore the current sanitized admin session' })
  @ApiExtension('x-abar-errors', { '401': ['SESSION_EXPIRED'], '503': ['SERVICE_UNAVAILABLE'] })
  @ApiOkResponse({ schema: sessionViewSchema, headers: {
    'Cache-Control': noStoreHeader,
    'X-CSRF-Token': { description: 'Existing session-bound CSRF nonce; not part of the identity DTO.', schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } },
  } })
  @ApiResponse({ status: 401, description: 'SESSION_EXPIRED.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 503, description: 'SERVICE_UNAVAILABLE.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  async getMe(@Req() request: Request, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.sessionService!.restoreSession({ cookieHeader: request.headers.cookie });
    response.setHeader('X-CSRF-Token', result.csrfToken);
    response.status(200).json(result.session);
  }

  @Get('csrf')
  @ApiOperation({ operationId: 'getAuthCsrf', summary: 'Obtain stateful CSRF metadata' })
  @ApiOkResponse({ schema: {
    type: 'object', additionalProperties: false, required: ['csrfToken', 'headerName'],
    properties: {
      csrfToken: { type: 'string', minLength: 43, maxLength: 43 },
      headerName: { type: 'string', enum: ['X-CSRF-Token'] },
    },
  }, headers: {
    'Cache-Control': noStoreHeader,
    'Set-Cookie': {
      description: 'Anonymous responses set or reuse abar_auth_context; authenticated responses do not set a cookie.',
      schema: { type: 'string' },
    },
  } })
  @ApiResponse({ status: 403, description: 'PASSWORD_CHANGE_REQUIRED.', headers: { 'Cache-Control': noStoreHeader }, schema: csrfErrorSchema })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED.', headers: {
    'Cache-Control': noStoreHeader,
    'Retry-After': { description: 'Seconds until the request window expires.', schema: { type: 'integer', minimum: 1 } },
  }, schema: csrfErrorSchema })
  @ApiResponse({ status: 503, description: 'SERVICE_UNAVAILABLE.', headers: { 'Cache-Control': noStoreHeader }, schema: csrfErrorSchema })
  async getCsrf(@Req() request: Request, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    // Do not trust X-Forwarded-For; only the direct socket address is a limiter key.
    const result = await this.csrf.getMetadata({
      cookieHeader: request.headers.cookie,
      clientIp: request.socket.remoteAddress ?? 'unknown',
    });
    if (result.setCookie) response.setHeader('Set-Cookie', result.setCookie);
    response.status(200).json(result.metadata);
  }

  @ApiSecurity('AdminSessionCookie')
  @ApiSecurity('AuthPreauthCookie')
  @ApiHeader({
    name: 'Origin',
    required: true,
    description: 'Exact configured allowlist, never derived from request/Forwarded. Missing/null/mismatch is 403 ORIGIN_INVALID, no Referer fallback. Defaults are http://127.0.0.1:4200 and http://localhost:4200. Same-origin proxy expected; no arbitrary credentialed CORS. Tests may inject an explicitly owned local origin.',
    schema: { type: 'string', minLength: 1 },
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Independent stateful nonce bound to context/session, never logged.',
    schema: {
      type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$',
      description: 'Independent random 32 bytes, base64url without padding; never log or persist client-side.',
    },
  })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ operationId: 'loginAdmin', summary: 'Authenticate and rotate session' })
  @ApiBody({ required: true, schema: {
    type: 'object', additionalProperties: false, required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', minLength: 1, maxLength: 254 },
      password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
    },
  } })
  @ApiOkResponse({ schema: loginSessionSchema, headers: {
    'Cache-Control': noStoreHeader,
    'Set-Cookie': { description: 'Rotated session and cleared pre-auth cookies as separate fields.', schema: { type: 'string' } },
    'X-CSRF-Token': { description: 'Fresh session-bound CSRF nonce.', schema: { type: 'string', minLength: 43, maxLength: 43 } },
  } })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 403, description: 'ORIGIN_INVALID, CSRF_INVALID, or PASSWORD_CHANGE_REQUIRED.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED.', headers: {
    'Cache-Control': noStoreHeader,
    'Retry-After': { description: 'Seconds until the login window expires.', schema: { type: 'integer', minimum: 1, maximum: 3600 } },
  }, schema: loginErrorSchema })
  @ApiResponse({ status: 503, description: 'SERVICE_UNAVAILABLE.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  async login(@Req() request: Request, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.loginService.login({
      body: request.body,
      origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      csrfToken: typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : undefined,
      cookieHeader: request.headers.cookie,
      // Forwarded headers and Host are deliberately not used as the client identity.
      clientIp: request.socket.remoteAddress ?? 'unknown',
    });
    response.setHeader('Set-Cookie', [result.sessionCookie, result.clearPreAuthCookie]);
    response.setHeader('X-CSRF-Token', result.csrfToken);
    response.status(200).json(result.session);
  }

  @ApiHeader({
    name: 'Origin',
    required: true,
    description: 'Exact configured allowlist; never derived from request, Host, or Forwarded, and no Referer fallback. Defaults are http://127.0.0.1:4200 and http://localhost:4200.',
    schema: { type: 'string', minLength: 1 },
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: false,
    description: 'When an active session cookie is present, the matching session-bound 32-byte nonce encoded as unpadded base64url is mandatory; never log or persist it.',
    schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' },
  })
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ operationId: 'logoutAdmin', summary: 'Revoke the current admin session when present', security: [{}, { AdminSessionCookie: [] }] })
  @ApiExtension('x-abar-errors', { '403': ['ORIGIN_INVALID', 'CSRF_INVALID'], '503': ['SERVICE_UNAVAILABLE'] })
  @ApiResponse({ status: 204, description: 'No content. Clears abar_admin_session with its matching Path, HttpOnly, SameSite and optional Secure attributes, Max-Age=0 and a past Expires value.', headers: {
    'Cache-Control': noStoreHeader,
    'Set-Cookie': { description: 'Clears abar_admin_session with matching path/attributes, Max-Age=0 and past Expires.', schema: { type: 'string' } },
  } })
  @ApiResponse({ status: 403, description: 'ORIGIN_INVALID or CSRF_INVALID.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 503, description: 'SERVICE_UNAVAILABLE.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  async logout(@Req() request: Request, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.logoutService!.logout({
      origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      csrfToken: typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : undefined,
      cookieHeader: request.headers.cookie,
    });
    response.setHeader('Set-Cookie', result.clearSessionCookie);
    response.status(204).end();
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiSecurity('AdminSessionCookie')
  @ApiOperation({ operationId: 'changeAdminPassword', summary: 'Change own password, rotate current session and revoke others' })
  @ApiHeader({ name: 'Origin', required: true, description: 'Exact configured allowlist; never derived from request, Host, or Forwarded, and no Referer fallback.', schema: { type: 'string', minLength: 1 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, description: 'Session-bound nonce; never logged or persisted client-side.', schema: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } })
  @ApiBody({ required: true, schema: {
    type: 'object', additionalProperties: false, required: ['currentPassword', 'newPassword'],
    properties: {
      currentPassword: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
      newPassword: { type: 'string', minLength: 15, maxLength: 128, writeOnly: true },
    },
  } })
  @ApiExtension('x-abar-errors', {
    '400': ['VALIDATION_ERROR', 'PASSWORD_POLICY'],
    '401': ['SESSION_EXPIRED', 'INVALID_CREDENTIALS'],
    '403': ['ORIGIN_INVALID', 'CSRF_INVALID'],
    '503': ['SERVICE_UNAVAILABLE'],
  })
  @ApiResponse({ status: 204, description: 'Password changed; other sessions revoked and current session rotated without extending expiry. No response body.', headers: {
    'Cache-Control': noStoreHeader,
    'Set-Cookie': { description: 'Rotated abar_admin_session cookie.', schema: { type: 'string' } },
    'X-CSRF-Token': { description: 'Fresh session-bound CSRF nonce.', schema: { type: 'string', minLength: 43, maxLength: 43 } },
  } })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR or PASSWORD_POLICY.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 401, description: 'SESSION_EXPIRED or INVALID_CREDENTIALS.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 403, description: 'ORIGIN_INVALID or CSRF_INVALID.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  @ApiResponse({ status: 503, description: 'SERVICE_UNAVAILABLE.', headers: { 'Cache-Control': noStoreHeader }, schema: loginErrorSchema })
  async changePassword(@Req() request: Request, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!this.changePasswordService) throw new ServiceUnavailableException();
    const result = await this.changePasswordService.changePassword({
      body: request.body,
      origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      csrfToken: typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : undefined,
      cookieHeader: request.headers.cookie,
    });
    response.setHeader('Set-Cookie', result.sessionCookie);
    response.setHeader('X-CSRF-Token', result.csrfToken);
    response.status(204).end();
  }
}
