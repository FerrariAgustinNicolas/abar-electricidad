import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiExtension, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { OperationObject, ParameterObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv, { ValidateFunction } from 'ajv';
import { CatalogException } from './catalog-error';

// A build-owned JSON resource from the single normative OpenAPI file, never an
// upload path or environment-selected source. Metadata applies only to real routes.
const contract = JSON.parse(readFileSync(resolve(__dirname, '../../dist/resources/catalog/openapi.json'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat('date-time', (value: string) => !Number.isNaN(Date.parse(value)) && /Z$/.test(value));
ajv.addFormat('int32', { type: 'number', validate: (value: number) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 });
const validators = new Map<string, ValidateFunction>();

function translated(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(translated);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    key === '$ref' && typeof child === 'string' ? child.replace(/^#\/components\/schemas\//, '#/$defs/') : translated(child),
  ]));
}

export function validateCatalogBody<T>(schema: string, value: unknown): T {
  let validate = validators.get(schema);
  if (!validate) {
    if (!Object.hasOwn(contract.components.schemas, schema)) throw new CatalogException(503, 'SERVICE_UNAVAILABLE');
    validate = ajv.compile({ $defs: translated(contract.components.schemas), $ref: `#/$defs/${schema}` });
    validators.set(schema, validate);
  }
  if (!validate(value)) throw new CatalogException(400, 'VALIDATION_ERROR');
  return value as T;
}

function inline(value: unknown, seen = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map((entry) => inline(entry, seen));
  if (value === null || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  if (typeof object.$ref === 'string') {
    if (seen.has(object.$ref)) throw new Error('Recursive H2 schema is not supported');
    const target = object.$ref.split('/').slice(1).reduce((node, key) => node?.[key], contract);
    if (!target) throw new Error('Missing frozen H2 reference');
    return inline(target, new Set([...seen, object.$ref]));
  }
  return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, inline(child, seen)]));
}

export function CatalogEndpoint(route: string, method: 'get' | 'post' | 'patch' | 'delete'): MethodDecorator {
  const operation = contract.paths?.[route]?.[method] as OperationObject | undefined;
  if (!operation) throw new Error('H2 endpoint is not in the frozen contract');
  const decorators: MethodDecorator[] = [ApiOperation({ operationId: operation.operationId, summary: operation.summary, ...(operation.security?.length === 0 ? { security: [] } : {}) }), ApiTags(...operation.tags ?? [])];
  if (route.startsWith('/api/v1/admin/')) decorators.push(ApiSecurity('AdminSessionCookie'));
  for (const raw of operation.parameters ?? []) {
    const parameter = inline(raw) as ParameterObject;
    const options = { name: parameter.name, required: parameter.required, description: parameter.description, schema: parameter.schema as SchemaObject };
    if (parameter.in === 'header') decorators.push(ApiHeader(options));
    else if (parameter.in === 'path') decorators.push(ApiParam(options));
    else decorators.push(ApiQuery(options));
  }
  if (operation.requestBody) {
    const body = inline(operation.requestBody) as { required?: boolean; description?: string; content: Record<string, { schema?: SchemaObject; examples?: object; encoding?: object }> };
    const mediaTypes = Object.keys(body.content);
    if (mediaTypes.length !== 1) throw new Error('H2 request body requires one frozen media type');
    decorators.push(ApiConsumes(...mediaTypes));
    const media = body.content[mediaTypes[0]];
    if (!media.schema) throw new Error('H2 request body requires a frozen schema');
    decorators.push(ApiBody({ required: body.required, description: body.description, schema: media.schema }));
  }
  for (const [status, response] of Object.entries(operation.responses ?? {})) decorators.push(ApiResponse({ status: Number(status), ...inline(response) as object }));
  const errors = (operation as unknown as Record<string, unknown>)['x-abar-errors'];
  if (errors) decorators.push(ApiExtension('x-abar-errors', errors));
  return applyDecorators(...decorators);
}
