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
  const paths = Object.keys(document.paths ?? {});
  if (paths.length !== 1 || paths[0] !== '/health' || !document.paths['/health']?.get) {
    errors.push('H0 may document only GET /health as an operation');
  }
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
  return result(errors.length === 0, errors, {
    projectedPaths: ['/api/v1/public/auth/admin'],
    idempotencyHeaders: Object.keys(document.components?.headers ?? {}).filter((name) => name === 'IdempotencyKey').map(() => 'Idempotency-Key'),
    expectedVersionField: 'expectedVersion',
  });
}

function addOasFormats(ajv) {
  ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  ajv.addFormat('date-time', (value) => !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value));
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

export async function validateLive() {
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
    differences.push(...validateHealthSemantics(normative, swagger));
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
  return 'Live Swagger, PostgreSQL-backed HTTP 200, and safe HTTP 503 verified; only owned backend processes stopped.';
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
  if (live) console.log(await validateLive());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
