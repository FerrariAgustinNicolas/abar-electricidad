import { H6_OPERATIONS, validateH6Contract } from './h6-contract.mjs';
import { H5_OPERATIONS, validateH5Contract } from './h5-contract.mjs';
import { H4_OPERATIONS, validateH4Contract } from './h4-contract.mjs';
import { H3_OPERATIONS, validateH3Contract } from './h3-contract.mjs';
import { H2_OPERATIONS, validateH2Contract } from './h2-contract.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const require = createRequire(path.join(projectRoot, 'backend/package.json'));
const Ajv = require('ajv');
const YAML = require('yaml');
const contractFile = path.join(projectRoot, 'contracts/openapi.yaml');
const redoclyCli = path.join(projectRoot, 'backend/node_modules/@redocly/cli/bin/cli.js');
const redoclyConfig = path.join(projectRoot, 'contracts/redocly.yaml');
const backendEntry = path.join(projectRoot, 'backend/dist/main.js');
const healthErrorMessage = 'Servicio temporalmente no disponible';

// Closed H1 scope: schemas and examples do not authorize arbitrary extra operations.
const h1Operations = [
  ['/api/v1/auth/csrf', 'get', '200,403,429,503', 'CsrfMetadata', null, 'optional'],
  ['/api/v1/auth/login', 'post', '200,400,401,403,429,503', 'AdminSessionView', 'LoginRequest', 'context'],
  ['/api/v1/auth/me', 'get', '200,401,503', 'AdminSessionView', null, 'session'],
  ['/api/v1/auth/logout', 'post', '204,403,503', null, null, 'optional'],
  ['/api/v1/auth/change-password', 'post', '204,400,401,403,503', null, 'ChangePasswordRequest', 'session'],
  ['/api/v1/admin/users', 'get', '200,400,401,403,503', 'AdminUserList', null, 'session'],
  ['/api/v1/admin/users', 'post', '201,400,401,403,409,503', 'AdminUserView', 'CreateAdminUserRequest', 'session'],
  ['/api/v1/admin/users/{id}', 'patch', '200,400,401,403,404,409,503', 'AdminUserView', 'PatchAdminUserRequest', 'session'],
  ['/api/v1/admin/users/{id}/reset-password', 'post', '204,400,401,403,404,503', null, 'ResetAdminPasswordRequest', 'session'],
];
const frozenErrors = {
  getAuthCsrf: { 403: ['PASSWORD_CHANGE_REQUIRED'], 429: ['RATE_LIMITED'], 503: ['SERVICE_UNAVAILABLE'] },
  loginAdmin: { 400: ['VALIDATION_ERROR'], 401: ['INVALID_CREDENTIALS'], 403: ['ORIGIN_INVALID', 'CSRF_INVALID', 'PASSWORD_CHANGE_REQUIRED'], 429: ['RATE_LIMITED'], 503: ['SERVICE_UNAVAILABLE'] },
  getAdminSession: { 401: ['SESSION_EXPIRED'], 503: ['SERVICE_UNAVAILABLE'] },
  logoutAdmin: { 403: ['ORIGIN_INVALID', 'CSRF_INVALID'], 503: ['SERVICE_UNAVAILABLE'] },
  changeAdminPassword: { 400: ['VALIDATION_ERROR', 'PASSWORD_POLICY'], 401: ['SESSION_EXPIRED', 'INVALID_CREDENTIALS'], 403: ['ORIGIN_INVALID', 'CSRF_INVALID'], 503: ['SERVICE_UNAVAILABLE'] },
  listAdminUsers: { 400: ['VALIDATION_ERROR'], 401: ['SESSION_EXPIRED'], 403: ['PASSWORD_CHANGE_REQUIRED'], 503: ['SERVICE_UNAVAILABLE'] },
  createAdminUser: { 400: ['VALIDATION_ERROR', 'PASSWORD_POLICY'], 401: ['SESSION_EXPIRED'], 403: ['PASSWORD_CHANGE_REQUIRED', 'ORIGIN_INVALID', 'CSRF_INVALID'], 409: ['EMAIL_IN_USE'], 503: ['SERVICE_UNAVAILABLE'] },
  patchAdminUser: { 400: ['VALIDATION_ERROR'], 401: ['SESSION_EXPIRED'], 403: ['PASSWORD_CHANGE_REQUIRED', 'ORIGIN_INVALID', 'CSRF_INVALID'], 404: ['USER_NOT_FOUND'], 409: ['VERSION_CONFLICT', 'LAST_ACTIVE_ADMIN'], 503: ['SERVICE_UNAVAILABLE'] },
  resetAdminUserPassword: { 400: ['VALIDATION_ERROR', 'PASSWORD_POLICY'], 401: ['SESSION_EXPIRED'], 403: ['PASSWORD_CHANGE_REQUIRED', 'ORIGIN_INVALID', 'CSRF_INVALID'], 404: ['USER_NOT_FOUND'], 503: ['SERVICE_UNAVAILABLE'] },
};
const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const operationKeys = (document) => Object.entries(document.paths ?? {}).flatMap(([route, item]) =>
  httpMethods.filter((method) => item?.[method]).map((method) => `${method} ${route}`)).sort();
const same = (a, b) => JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));
function dereference(document, value) {
  const seen = new Set();
  while (value?.$ref && !seen.has(value.$ref)) {
    seen.add(value.$ref);
    value = value.$ref.split('/').slice(1).reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], document);
  }
  return value;
}

function result(valid, errors = [], additions = {}) {
  return { valid, ...(errors.length ? { errors } : {}), ...additions };
}

export function validateContractDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return result(false, ['Contract must be a YAML object']);
  }
  const errors = [];
  if (document.openapi !== '3.0.3') errors.push('openapi must be exactly 3.0.3');
  if (!document.info || typeof document.info.title !== 'string' || typeof document.info.version !== 'string') {
    errors.push('info.title and info.version are required strings');
  }
  if (!document.paths || typeof document.paths !== 'object' || Array.isArray(document.paths)) {
    errors.push('paths must be an object');
  }
  if (document.info?.['x-abar-contract-status'] !== 'candidate') errors.push('contract status must remain candidate');
  const h6 = document.info?.['x-abar-h6-freeze'] === 'notifications-settings-v1';
  const h5 = document.info?.['x-abar-h5-freeze'] === 'manual-confirmation-v1';
  const h4 = document.info?.['x-abar-h4-freeze'] === 'orders-demo-v1';
  const h3 = document.info?.['x-abar-h3-freeze'] === 'cart-quote-v1';
  const h2 = document.info?.['x-abar-h2-freeze'] === 'catalog-stock-v1';
  const expectedOperations = ['get /health', ...h1Operations.map(([route, method]) => `${method} ${route}`),
    ...(h2 ? H2_OPERATIONS.map(([route, method]) => `${method} ${route}`) : []),
    ...(h3 ? H3_OPERATIONS.map(([route, method]) => `${method} ${route}`) : []),
    ...(h4 ? H4_OPERATIONS.map(([route, method]) => `${method} ${route}`) : []),
    ...(h5 ? H5_OPERATIONS.map(([route, method]) => `${method} ${route}`) : []),
    ...(h6 ? H6_OPERATIONS.map(([route, method]) => `${method} ${route}`) : [])].sort();
  if (h6) errors.push(...validateH6Contract(document));
  if (h5) errors.push(...validateH5Contract(document));
  if (h4) errors.push(...validateH4Contract(document));
  if (h3) errors.push(...validateH3Contract(document));
  if (h2) errors.push(...validateH2Contract(document));
  if (!same(operationKeys(document), expectedOperations)) errors.push('H1 requires exactly nine frozen operations plus GET /health');
  if (document.info?.['x-abar-milestone'] !== 'H1-contract-freeze' || document.info?.version !== (h6 ? '0.9.0' : h5 ? '0.8.0' : h4 ? '0.7.0' : h3 ? '0.6.0' : h2 ? '0.5.0' : '0.4.0')) errors.push('H1 freeze/version markers are required');
  if (document.info?.['x-abar-runtime-stage'] !== 'h0') errors.push('Current runtime must be honestly marked h0');
  for (const area of ['/api/v1/public', '/api/v1/auth', '/api/v1/admin']) {
    if (!document.info?.['x-abar-projected-areas']?.includes(area)) errors.push(`missing projected area marker ${area}`);
  }
  const schemas = document.components?.schemas ?? {};
  for (const name of ['Money', 'PresentationUnit', 'PositiveQuantity', 'PositiveLengthMeters', 'OpaqueId', 'UtcDateTime', 'ApiError', 'PageInfo', 'OrderStatus', 'PaymentStatus', 'PaymentAttemptStatus', 'DeliveryMode']) {
    if (!schemas[name]?.description) errors.push(`${name} must be documented as a projected candidate`);
  }
  if (schemas.Money?.properties?.amountMinor?.type !== 'string') errors.push('Money.amountMinor must be a decimal string');
  if (schemas.PresentationUnit?.enum?.join(',') !== 'UNIT,METER,ROLL') errors.push('presentation units must be exactly UNIT, METER, ROLL');
  if (schemas.OrderStatus?.enum?.join(',') !== 'RECEIVED,PREPARING,READY,DELIVERED,CANCELLED') errors.push('OrderStatus candidate values do not match plan section 7');
  if (schemas.PaymentStatus?.enum?.join(',') !== 'PENDING,REJECTED,PAID') errors.push('PaymentStatus candidate values do not match plan section 7');
  if (schemas.PaymentAttemptStatus?.enum?.join(',') !== 'PENDING,APPROVED,REJECTED') errors.push('PaymentAttemptStatus candidate values do not match plan section 7');
  if (schemas.DeliveryMode?.enum?.join(',') !== 'PICKUP,COORDINATED') errors.push('DeliveryMode candidate values do not match plan section 7');
  const errorSchema = schemas.ApiError;
  if (!['code', 'message', 'requestId'].every((field) => errorSchema?.required?.includes(field))) errors.push('ApiError must require code, message and requestId');
  if (document['x-abar-review-boundaries']?.unresolved?.join(',') !== 'P01,P02,P03,P04,P05,P06,P07,P08,P09,P10') errors.push('all unresolved P01-P10 items must remain open');
  errors.push(...validateFrozenH1(document));
  return result(errors.length === 0, errors, {
    projectedPaths: ['/api/v1/public/auth/admin'],
    idempotencyHeaders: Object.keys(document.components?.headers ?? {}).filter((name) => name === 'IdempotencyKey').map(() => 'Idempotency-Key'),
    expectedVersionField: 'expectedVersion',
  });
}

function validateFrozenH1(document) {
  const errors = [];
  const schemas = document.components?.schemas ?? {};
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const exactObject = (name, properties, required = properties) => {
    const schema = schemas[name];
    check(schema?.type === 'object' && schema.additionalProperties === false
      && same(Object.keys(schema.properties ?? {}).sort(), [...properties].sort())
      && same([...(schema.required ?? [])].sort(), [...required].sort()), `${name} must have exact closed DTO fields/required fields`);
  };
  exactObject('AdminIdentity', ['id', 'name', 'email', 'mustChangePassword']);
  exactObject('AdminSessionView', ['admin', 'expiresAt']);
  exactObject('AdminUserView', ['id', 'name', 'email', 'active', 'mustChangePassword', 'version', 'createdAt', 'updatedAt']);
  exactObject('AdminUserList', ['items', 'pageInfo']);
  exactObject('CsrfMetadata', ['csrfToken', 'headerName']);
  exactObject('LoginRequest', ['email', 'password']);
  exactObject('ChangePasswordRequest', ['currentPassword', 'newPassword']);
  exactObject('CreateAdminUserRequest', ['name', 'email', 'temporaryPassword']);
  exactObject('PatchAdminUserRequest', ['name', 'active', 'expectedVersion'], ['expectedVersion']);
  exactObject('ResetAdminPasswordRequest', ['temporaryPassword', 'reason']);
  exactObject('ApiError', ['code', 'message', 'fieldErrors', 'requestId'], ['code', 'message', 'requestId']);
  exactObject('FieldError', ['field', 'code', 'message']);
  for (const name of ['AdminName', 'AdminEmail', 'PasswordInput', 'NewPassword']) {
    const [min, max] = { AdminName: [1, 100], AdminEmail: [1, 254], PasswordInput: [1, 128], NewPassword: [15, 128] }[name];
    check(schemas[name]?.type === 'string' && schemas[name].minLength === min && schemas[name].maxLength === max, `${name} length constraints differ`);
  }
  check(schemas.AdminEmail?.format === 'email', 'AdminEmail requires email format');
  exactObject('PageInfo', ['page', 'pageSize', 'totalItems', 'totalPages']);
  for (const [field, expected] of [
    ['page', { type: 'integer', minimum: 1 }], ['pageSize', { type: 'integer', minimum: 1, maximum: 100 }],
    ['totalItems', { type: 'integer', minimum: 0 }], ['totalPages', { type: 'integer', minimum: 0 }],
  ]) check(same(schemas.PageInfo?.properties?.[field], expected), `PageInfo.${field} constraints differ`);
  check(schemas.PasswordInput?.writeOnly === true && schemas.NewPassword?.writeOnly === true, 'password inputs must be writeOnly');
  const ref = (name, field, target) => check(schemas[name]?.properties?.[field]?.$ref === `#/components/schemas/${target}`, `${name}.${field} must reference ${target}`);
  for (const name of ['AdminIdentity', 'AdminUserView']) {
    for (const [field, target] of [['id', 'OpaqueId'], ['name', 'AdminName'], ['email', 'AdminEmail']]) ref(name, field, target);
    check(schemas[name]?.properties?.mustChangePassword?.type === 'boolean', `${name}.mustChangePassword must be boolean`);
  }
  ref('AdminSessionView', 'admin', 'AdminIdentity');
  ref('AdminSessionView', 'expiresAt', 'H1UtcDateTime');
  for (const field of ['createdAt', 'updatedAt']) ref('AdminUserView', field, 'H1UtcDateTime');
  check(schemas.AdminUserView?.properties?.active?.type === 'boolean', 'AdminUserView.active must be boolean');
  check(schemas.AdminUserView?.properties?.version?.type === 'integer' && schemas.AdminUserView.properties.version.minimum === 1, 'AdminUserView.version starts at 1');
  ref('AdminUserList', 'pageInfo', 'PageInfo');
  check(schemas.AdminUserList?.properties?.items?.type === 'array' && schemas.AdminUserList.properties.items.maxItems === 100 && schemas.AdminUserList.properties.items.items?.$ref === '#/components/schemas/AdminUserView', 'AdminUserList requires bounded user items');
  ref('CsrfMetadata', 'csrfToken', 'CsrfNonce');
  check(same(schemas.CsrfMetadata?.properties?.headerName, { type: 'string', enum: ['X-CSRF-Token'] }), 'CSRF header metadata is fixed');
  check(schemas.CsrfNonce?.type === 'string' && schemas.CsrfNonce.minLength === 43 && schemas.CsrfNonce.maxLength === 43 && schemas.CsrfNonce.pattern === '^[A-Za-z0-9_-]{43}$', 'CSRF nonce must encode random 32 bytes');
  check(schemas.OpaqueId?.format === 'uuid' && schemas.H1UtcDateTime?.format === 'date-time' && schemas.H1UtcDateTime?.pattern === '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$', 'H1 requires UUID and RFC3339 UTC Z timestamps');
  for (const [name, field, target] of [
    ['LoginRequest', 'email', 'AdminEmail'], ['LoginRequest', 'password', 'PasswordInput'],
    ['ChangePasswordRequest', 'currentPassword', 'PasswordInput'], ['ChangePasswordRequest', 'newPassword', 'NewPassword'],
    ['CreateAdminUserRequest', 'name', 'AdminName'], ['CreateAdminUserRequest', 'email', 'AdminEmail'], ['CreateAdminUserRequest', 'temporaryPassword', 'NewPassword'],
    ['PatchAdminUserRequest', 'name', 'AdminName'], ['PatchAdminUserRequest', 'expectedVersion', 'ExpectedVersion'],
    ['ResetAdminPasswordRequest', 'temporaryPassword', 'NewPassword'],
  ]) ref(name, field, target);
  check(schemas.ExpectedVersion?.type === 'integer' && schemas.ExpectedVersion.minimum === 1, 'expectedVersion must be integer >= 1');
  check(schemas.PatchAdminUserRequest?.minProperties === 2 && same(canonicalSet(schemas.PatchAdminUserRequest?.anyOf ?? []), canonicalSet([{ required: ['name'] }, { required: ['active'] }])) && schemas.PatchAdminUserRequest?.properties?.active?.type === 'boolean', 'PATCH needs a change plus expectedVersion');
  const reason = schemas.ResetAdminPasswordRequest?.properties?.reason;
  check(reason?.type === 'string' && reason.minLength === 1 && reason.maxLength === 500, 'reset reason bounds required');
  for (const name of ['ApiError', 'FieldError']) {
    for (const field of name === 'ApiError' ? ['code', 'message'] : ['field', 'code', 'message']) {
      check(schemas[name]?.properties?.[field]?.type === 'string' && schemas[name].properties[field].minLength === 1, `${name}.${field} constraints required`);
    }
  }
  check(schemas.ApiError?.properties?.requestId?.format === 'uuid' && schemas.ApiError?.properties?.fieldErrors?.type === 'array' && schemas.ApiError.properties.fieldErrors.items?.$ref === '#/components/schemas/FieldError', 'ApiError must preserve safe fieldErrors/requestId');
  check(same(resolveSchema(document, schemas.HealthOk), { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } }), 'H0 HealthOk constraints must remain unchanged');
  const health = document.paths?.['/health']?.get;
  check(same(Object.keys(health?.responses ?? {}).sort(), ['200', '503']) && health?.responses?.['200']?.content?.['application/json']?.schema?.$ref === '#/components/schemas/HealthOk' && health?.responses?.['503']?.content?.['application/json']?.schema?.$ref === '#/components/schemas/ApiError', 'H0 health response contract must remain unchanged');
  for (const [name, cookie] of [['AdminSessionCookie', 'abar_admin_session'], ['AuthPreauthCookie', 'abar_auth_context']]) {
    const scheme = document.components?.securitySchemes?.[name];
    check(scheme?.type === 'apiKey' && scheme.in === 'cookie' && scheme.name === cookie, `${name} must use the frozen cookie name`);
  }
  for (const [route, method, codes, responseDto, requestDto, mode] of h1Operations) {
    const operation = document.paths?.[route]?.[method];
    if (!operation) { errors.push(`missing ${method} ${route}`); continue; }
    const label = `${method} ${route}`;
    const errorCodes = frozenErrors[operation.operationId];
    check(errorCodes && same(operation['x-abar-errors'], errorCodes), `${label} requires exact normative error codes and known operationId`);
    check(same(Object.keys(operation.responses ?? {}).sort(), codes.split(',')), `${label} status codes differ`);
    const security = mode === 'session' ? [{ AdminSessionCookie: [] }] : mode === 'context' ? [{ AuthPreauthCookie: [] }, { AdminSessionCookie: [] }] : [{}, { AdminSessionCookie: [] }];
    check(same(canonicalSet(operation.security ?? []), canonicalSet(security)), `${label} security differs`);
    const success = operation.responses?.[codes.split(',')[0]];
    if (responseDto) check(success?.content?.['application/json']?.schema?.$ref === `#/components/schemas/${responseDto}`, `${label} success DTO differs`);
    else check(!success?.content, `${label} 204 must have no body`);
    if (requestDto) check(operation.requestBody?.required === true && operation.requestBody?.content?.['application/json']?.schema?.$ref === `#/components/schemas/${requestDto}`, `${label} request DTO required`);
    else check(!operation.requestBody, `${label} must not add request body`);
    const parameters = (operation.parameters ?? []).map((p) => dereference(document, p));
    const expectedParameters = method !== 'get' ? ['header Origin', 'header X-CSRF-Token'] : route === '/api/v1/admin/users' ? ['query page', 'query pageSize', 'query sort'] : [];
    if (route.includes('{id}')) expectedParameters.push('path id');
    check(same(parameters.map((p) => `${p?.in} ${p?.name}`).sort(), expectedParameters.sort()), `${label} parameter set differs`);
    if (method !== 'get') {
      const origin = parameters.find((p) => p?.name === 'Origin' && p.in === 'header');
      const csrf = parameters.find((p) => p?.name === 'X-CSRF-Token' && p.in === 'header');
      check(origin?.required === true && origin.schema?.type === 'string', `${label} requires Origin`);
      check(csrf?.required === (route !== '/api/v1/auth/logout') && csrf?.schema?.$ref === '#/components/schemas/CsrfNonce', `${label} requires conditional/stateful CSRF header`);
    }
    if (route.includes('{id}')) check(parameters.some((p) => p?.name === 'id' && p.in === 'path' && p.required === true && p.schema?.$ref === '#/components/schemas/OpaqueId'), `${label} requires opaque id`);
    for (const code of codes.split(',')) {
      const response = dereference(document, operation.responses?.[code]);
      const cache = dereference(document, response?.headers?.['Cache-Control']);
      check(cache?.['x-required'] === true && same(cache.schema, { type: 'string', enum: ['no-store'] }), `${label} ${code} requires no-store`);
      if (Number(code) >= 400) {
        check(response?.content?.['application/json']?.schema?.$ref === '#/components/schemas/ApiError', `${label} ${code} must use safe ApiError`);
        check(operation['x-abar-errors']?.[code]?.length > 0, `${label} ${code} needs normative error codes`);
      }
      if (code === '429') {
        const retry = dereference(document, response?.headers?.['Retry-After']);
        check(retry?.['x-required'] === true && retry.schema?.type === 'integer' && retry.schema.minimum === 0, `${label} 429 requires Retry-After seconds`);
      }
    }
    if (['/api/v1/auth/me', '/api/v1/auth/login', '/api/v1/auth/change-password'].includes(route)) {
      const nonce = dereference(document, success?.headers?.['X-CSRF-Token']);
      check(nonce?.['x-required'] === true && nonce.schema?.$ref === '#/components/schemas/CsrfNonce', `${label} requires CSRF response header`);
    }
    if (['/api/v1/auth/login', '/api/v1/auth/logout', '/api/v1/auth/change-password'].includes(route)) {
      check(dereference(document, success?.headers?.['Set-Cookie'])?.['x-required'] === true, `${label} requires Set-Cookie`);
    }
  }
  const query = document.paths?.['/api/v1/admin/users']?.get?.parameters ?? [];
  for (const [name, schema] of [
    ['page', { type: 'integer', minimum: 1, default: 1 }],
    ['pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 }],
    ['sort', { type: 'string', enum: ['name', '-name', 'email', '-email', 'createdAt', '-createdAt'], default: '-createdAt' }],
  ]) check(query.some((p) => p.name === name && p.in === 'query' && p.required === false && same(p.schema, schema)), `users ${name} query constraints differ`);
  return errors;
}

function addOasFormats(ajv) {
  ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  ajv.addFormat('date-time', (value) => !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value));
  ajv.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/u);
  ajv.addFormat('int32', (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647);
  return ajv;
}

function translateSchema(schema) {
  if (Array.isArray(schema)) return schema.map(translateSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [
    key,
    key === '$ref' && typeof value === 'string'
      ? value.replace(/^#\/components\/schemas\//, '#/$defs/')
      : translateSchema(value),
  ]));
}

function validateValue(document, schemaName, value) {
  const schemas = document.components?.schemas;
  if (!schemas?.[schemaName]) return result(false, [`Unknown schema: ${schemaName}`]);
  try {
    const ajv = addOasFormats(new Ajv({ allErrors: true, strict: false, validateFormats: true }));
    const validator = ajv.compile({ $defs: translateSchema(schemas), $ref: `#/$defs/${schemaName}` });
    const valid = validator(value);
    return result(valid, (validator.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`));
  } catch (error) {
    return result(false, [`Could not compile ${schemaName}: ${error.message}`]);
  }
}

export async function validateExample(contract, example, schemaName) {
  try {
    const contractUrl = contract instanceof URL ? contract : new URL(contract, `file://${projectRoot}/`);
    const yaml = await readFile(contractUrl, 'utf8');
    const document = YAML.parse(yaml);
    if (typeof example === 'string') {
      const examplesRoot = path.resolve(path.dirname(fileURLToPath(contractUrl)), 'examples');
      const examplePath = path.resolve(path.dirname(fileURLToPath(contractUrl)), example);
      if (examplePath !== examplesRoot && !examplePath.startsWith(`${examplesRoot}${path.sep}`)) {
        return result(false, ['Example path must remain inside contracts/examples']);
      }
      const value = JSON.parse(await readFile(examplePath, 'utf8'));
      return validateValue(document, schemaName, value);
    }
    if (example && typeof example === 'object') return validateValue(document, example.schema, example.value);
    return result(false, ['Example must be a contract-relative file or { schema, value } object']);
  } catch (error) {
    return result(false, [`Could not validate example: ${error.message}`]);
  }
}

export async function validateContractFile(file = contractFile) {
  const filePath = file instanceof URL ? fileURLToPath(file) : path.resolve(file);
  let document;
  try {
    document = YAML.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    return result(false, [`Could not read or parse contract: ${error.message}`]);
  }
  const shape = validateContractDocument(document);
  if (!shape.valid) return shape;
  const lint = spawnSync(process.execPath, [redoclyCli, 'lint', '--config', path.relative(projectRoot, redoclyConfig), path.relative(projectRoot, filePath)], { cwd: projectRoot, encoding: 'utf8' });
  if (lint.error || lint.status !== 0) {
    return result(false, [`Redocly lint failed${lint.status === null ? '' : ` (exit ${lint.status})`}: ${(lint.stderr || lint.stdout || lint.error?.message || '').trim()}`]);
  }
  const examples = document.info['x-abar-examples'] ?? [];
  const errors = [];
  for (const example of examples) {
    const checked = await validateExample(filePath, example.file, example.schema);
    if (!checked.valid) errors.push(`${example.file} against ${example.schema}: ${(checked.errors ?? []).join('; ')}`);
  }
  if (!examples.length) errors.push('No external JSON examples are registered for validation');
  return result(errors.length === 0, errors, {
    projectedPaths: shape.projectedPaths,
    idempotencyHeaders: shape.idempotencyHeaders,
    expectedVersionField: shape.expectedVersionField,
  });
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalSet(values) {
  return values.map(canonicalValue).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function resolveSchema(document, schema, seen = new Set()) {
  if (Array.isArray(schema)) return schema.map((entry) => resolveSchema(document, entry, seen));
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { $ref: schema.$ref };
    const target = schema.$ref.split('/').at(-1).replace(/~1/g, '/').replace(/~0/g, '~');
    return resolveSchema(document, document.components?.schemas?.[target], new Set([...seen, schema.$ref]));
  }

  const normalized = {};
  const semanticKeys = [
    'type', 'format', 'enum', 'const', 'required', 'additionalProperties', 'nullable',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems',
    'minProperties', 'maxProperties', 'default', 'readOnly', 'writeOnly', 'discriminator',
  ];
  for (const key of semanticKeys) {
    if (schema[key] === undefined) continue;
    if (key === 'nullable' && schema[key] !== true) continue;
    if (key === 'additionalProperties' && schema[key] === true) continue;
    if (key === 'required' || key === 'enum') normalized[key] = canonicalSet(schema[key]);
    else normalized[key] = canonicalValue(schema[key]);
  }

  for (const key of ['items', 'not']) {
    if (schema[key] !== undefined) normalized[key] = resolveSchema(document, schema[key], seen);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    normalized.additionalProperties = resolveSchema(document, schema.additionalProperties, seen);
  }
  if (schema.properties) {
    normalized.properties = Object.fromEntries(Object.keys(schema.properties).sort().map((name) => [
      name,
      resolveSchema(document, schema.properties[name], seen),
    ]));
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (schema[key] !== undefined) {
      normalized[key] = schema[key]
        .map((entry) => resolveSchema(document, entry, seen))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
  }
  return normalized;
}

function responseSchema(document, response) {
  response = dereference(document, response);
  return resolveSchema(document, response?.content?.['application/json']?.schema ?? response?.schema);
}

export function validateHealthSemantics(normative, live) {
  const differences = [];
  const contractOperation = normative.paths?.['/health']?.get;
  const livePaths = Object.keys(live.paths ?? {});
  if (!contractOperation) differences.push('Normative contract has no GET /health');
  if (livePaths.length !== 1 || livePaths[0] !== '/health' || !live.paths['/health']?.get) differences.push('Swagger must expose only GET /health as an operation');
  const actual = live.paths?.['/health']?.get;
  if (!actual) return differences;
  const expectedCodes = Object.keys(contractOperation.responses ?? {}).sort();
  const actualCodes = Object.keys(actual.responses ?? {}).sort();
  if (JSON.stringify(expectedCodes) !== JSON.stringify(actualCodes)) differences.push(`Health response codes differ: contract ${expectedCodes.join(',')}; Swagger ${actualCodes.join(',')}`);
  for (const code of expectedCodes) {
    const expectedSchema = responseSchema(normative, contractOperation.responses[code]);
    const actualSchema = responseSchema(live, actual.responses?.[code]);
    if (JSON.stringify(expectedSchema) !== JSON.stringify(actualSchema)) differences.push(`Health ${code} response schema differs`);
  }
  return differences;
}

function operationSemantics(document, operation) {
  const normalized = {
    security: canonicalSet(operation.security ?? document.security ?? []),
    parameters: canonicalSet((operation.parameters ?? []).map((entry) => {
      const p = dereference(document, entry);
      return { name: p?.name, in: p?.in, required: p?.required ?? false, schema: resolveSchema(document, p?.schema) };
    })),
    responses: Object.fromEntries(Object.entries(operation.responses ?? {}).sort().map(([code, entry]) => {
      const response = dereference(document, entry);
      return [code, {
        schema: responseSchema(document, response),
        headers: Object.fromEntries(Object.entries(response?.headers ?? {}).sort().map(([name, value]) => {
          const header = dereference(document, value);
          return [name.toLowerCase(), { required: header?.['x-required'] === true, schema: resolveSchema(document, header?.schema) }];
        })),
      }];
    })),
  };
  if (operation.requestBody) {
    const request = dereference(document, operation.requestBody);
    normalized.requestBody = { required: request?.required === true, schema: resolveSchema(document, request?.content?.['application/json']?.schema) };
  }
  return canonicalValue(normalized);
}

// Fixture compatibility is schema evidence, not proof of functioning authentication.
export function validateH1Semantics(normative, live) {
  const differences = [];
  if (!same(operationKeys(normative), operationKeys(live))) differences.push('H1 operation set differs (nine auth/admin operations plus health required)');
  for (const key of operationKeys(normative)) {
    const [method, route] = key.split(' ');
    const expected = normative.paths[route][method];
    const actual = live.paths?.[route]?.[method];
    if (!actual) differences.push(`Missing ${key}`);
    else if (!same(operationSemantics(normative, expected), operationSemantics(live, actual))) differences.push(`${key} request/response/header/security semantics differ`);
  }
  return differences;
}

function freeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitFor(url, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Owned backend exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch { /* Wait while the owned process binds its local port. */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for the owned local backend');
}

function startOwnedBackend(port, databaseUrl) {
  const child = spawn(process.execPath, [backendEntry], {
    cwd: projectRoot,
    env: { DATABASE_URL: databaseUrl, HOST: '127.0.0.1', NODE_ENV: 'development', PORT: String(port) },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return child;
}

async function stopOwnedBackend(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function getJson(url, expectedStatus) {
  const response = await fetch(url);
  const body = await response.json();
  if (response.status !== expectedStatus) throw new Error(`${url} returned HTTP ${response.status}; expected ${expectedStatus}`);
  return body;
}

export async function validateLive(stage = 'h1') {
  if (!['h0', 'h1'].includes(stage)) throw new Error('stage must be h0 or h1');
  const normativeYaml = await readFile(contractFile, 'utf8');
  const normative = YAML.parse(normativeYaml);
  const differences = [];
  const healthPort = await freeLocalPort();
  const healthyChild = startOwnedBackend(healthPort, 'postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public');
  try {
    const base = `http://127.0.0.1:${healthPort}`;
    await waitFor(`${base}/api/docs-json`, healthyChild);
    const health = await getJson(`${base}/health`, 200);
    if (JSON.stringify(health) !== JSON.stringify({ status: 'ok' })) throw new Error('Live HTTP 200 health body differs from {"status":"ok"}');
    const swagger = await getJson(`${base}/api/docs-json`, 200);
    differences.push(...(stage === 'h0' ? validateHealthSemantics(normative, swagger) : validateH1Semantics(normative, swagger)));
  } finally {
    await stopOwnedBackend(healthyChild);
  }

  const failurePort = await freeLocalPort();
  const failingChild = startOwnedBackend(failurePort, 'postgresql://abar_local:abar_local_demo_only@127.0.0.1:1/abar_local?schema=public');
  try {
    const base = `http://127.0.0.1:${failurePort}`;
    await waitFor(`${base}/api/docs-json`, failingChild);
    const error = await getJson(`${base}/health`, 503);
    if (error.code !== 'SERVICE_UNAVAILABLE' || error.message !== healthErrorMessage || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(error.requestId) || Object.keys(error).sort().join(',') !== 'code,message,requestId') {
      throw new Error('Live HTTP 503 error body is not the uniform safe health error');
    }
    const checkedError = validateValue(normative, 'ApiError', error);
    if (!checkedError.valid) differences.push(`Live HTTP 503 body violates ApiError: ${(checkedError.errors ?? []).join('; ')}`);
  } finally {
    await stopOwnedBackend(failingChild);
  }
  if (differences.length) throw new Error(`Live Swagger semantic mismatch: ${differences.join('; ')}. Live HTTP 200/503 bodies and safe error fields were exercised.`);
  return stage === 'h0'
    ? 'H0 transitional health-only LIVE PASS: Swagger health schemas, PostgreSQL HTTP 200 and safe HTTP 503 verified; H1 runtime NOT IMPLEMENTED / NOT APPLICABLE. Only owned backend processes stopped.'
    : 'Full H1 Swagger semantic compatibility and health HTTP 200/503 verified; authentication behavior requires separate H1 runtime tests. Only owned backend processes stopped.';
}

async function main() {
  const live = process.argv.includes('--live');
  const contractArgumentIndex = process.argv.indexOf('--contract');
  const targetContract = contractArgumentIndex < 0 ? contractFile : process.argv[contractArgumentIndex + 1];
  if (!targetContract) {
    console.error('--contract requires a file path');
    process.exitCode = 1;
    return;
  }
  const validation = await validateContractFile(targetContract);
  if (!validation.valid) {
    console.error(validation.errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`OpenAPI 3.0.3 and ${YAML.parse(await readFile(targetContract, 'utf8')).info['x-abar-examples'].length} external JSON examples validated.`);
  const stageArguments = process.argv.filter((argument) => argument.startsWith('--stage='));
  const stage = stageArguments[0]?.slice('--stage='.length) ?? 'h1';
  if (stageArguments.length > 1 || !['h0', 'h1'].includes(stage)) {
    console.error('Use exactly one --stage=h0 or --stage=h1 (default h1)');
    process.exitCode = 1;
    return;
  }
  if (live) {
    try { console.log(await validateLive(stage)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
