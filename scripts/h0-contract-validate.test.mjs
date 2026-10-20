import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  validateContractDocument,
  validateContractFile,
  validateExample,
  validateHealthSemantics,
  validateH1Semantics,
} from './h0-contract-validate.mjs';

const contractPath = new URL('../contracts/openapi.yaml', import.meta.url);
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const YAML = require('yaml');
const normative = async () => YAML.parse(await readFile(contractPath, 'utf8'));

const h1Operations = [
  ['/api/v1/auth/csrf', 'get'], ['/api/v1/auth/login', 'post'],
  ['/api/v1/auth/me', 'get'], ['/api/v1/auth/logout', 'post'],
  ['/api/v1/auth/change-password', 'post'], ['/api/v1/admin/users', 'get'],
  ['/api/v1/admin/users', 'post'], ['/api/v1/admin/users/{id}', 'patch'],
  ['/api/v1/admin/users/{id}/reset-password', 'post'],
];

test('H1 freezes exactly nine auth/admin operations alongside unprefixed health', async () => {
  const document = await normative();
  for (const [route, method] of h1Operations) assert.ok(document.paths[route]?.[method], `${method} ${route}`);
  assert.equal(document.info['x-abar-milestone'], 'H1-contract-freeze');
  assert.equal(validateContractDocument(document).valid, true);
});

test('strict H1 static validation rejects missing operations, headers, DTO fields and security', async () => {
  const original = await normative();
  for (const [label, mutate] of [
    ['operation', (d) => { delete d.paths['/api/v1/auth/me']; }],
    ['CSRF header', (d) => { if (d.paths['/api/v1/auth/me']) delete d.paths['/api/v1/auth/me'].get.responses['200'].headers['X-CSRF-Token']; }],
    ['DTO', (d) => { if (d.components.schemas.AdminSessionView) d.components.schemas.AdminSessionView.required = ['admin']; }],
    ['security', (d) => { if (d.paths['/api/v1/admin/users']) d.paths['/api/v1/admin/users'].get.security = []; }],
    ['auth metadata', (d) => { if (d.components.schemas.CsrfMetadata) d.components.schemas.CsrfMetadata.properties.headerName.enum = ['Wrong']; }],
    ['error field constraints', (d) => { delete d.components.schemas.FieldError.additionalProperties; }],
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(validateContractDocument(changed).valid, false, label);
  }
});

test('full H1 fixture semantics reject operation/header/security/request/DTO constraint drift', async () => {
  const document = await normative();
  const reordered = structuredClone(document);
  reordered.components.schemas.AdminUserView.required.reverse();
  reordered.paths['/api/v1/admin/users'].get.parameters.reverse();
  reordered.paths['/api/v1/auth/login'].post.security.reverse();
  assert.deepEqual(validateH1Semantics(document, reordered), []);
  for (const [label, mutate] of [
    ['operation', (d) => { delete d.paths['/api/v1/auth/login']; }],
    ['response header', (d) => { delete d.paths['/api/v1/auth/me'].get.responses['200'].headers['X-CSRF-Token']; }],
    ['cookie header', (d) => { delete d.paths['/api/v1/auth/login'].post.responses['200'].headers['Set-Cookie']; }],
    ['security', (d) => { d.paths['/api/v1/admin/users'].get.security = []; }],
    ['DTO required', (d) => { d.components.schemas.AdminSessionView.required = ['admin']; }],
    ['auth metadata', (d) => { d.components.schemas.CsrfMetadata.properties.headerName.enum = ['Wrong']; }],
    ['error field constraint', (d) => { delete d.components.schemas.FieldError.additionalProperties; }],
    ['request header', (d) => { d.components.parameters.CsrfToken.required = false; }],
    ['query constraint', (d) => { d.paths['/api/v1/admin/users'].get.parameters[1].schema.maximum = 101; }],
    ['request constraint', (d) => { d.components.schemas.PatchAdminUserRequest.anyOf = []; }],
    ['extra endpoint', (d) => { d.paths['/api/v1/admin/unapproved'] = { get: d.paths['/api/v1/admin/users'].get }; }],
  ]) {
    const changed = structuredClone(document);
    mutate(changed);
    assert.notDeepEqual(validateH1Semantics(document, changed), [], label);
    assert.equal(validateContractDocument(changed).valid, false, `${label}: static freeze`);
  }
  const healthOnly = structuredClone(document);
  healthOnly.paths = { '/health': healthOnly.paths['/health'] };
  assert.deepEqual(validateHealthSemantics(document, healthOnly), [], 'explicit H0 subset remains health-only');
  assert.ok(validateH1Semantics(document, healthOnly).length > 0, 'default full H1 must reject health-only runtime');
});

test('H1 public DTO examples reject secret metadata, invalid UTC and fieldErrors input echoes', async () => {
  const user = JSON.parse(await readFile(new URL('../contracts/examples/admin-user.json', import.meta.url), 'utf8'));
  const session = JSON.parse(await readFile(new URL('../contracts/examples/admin-session.json', import.meta.url), 'utf8'));
  for (const [schema, value] of [
    ['AdminSessionView', { ...session, sessionId: 'forbidden' }],
    ['AdminSessionView', { ...session, admin: { ...session.admin, active: true } }],
    ['AdminUserView', { ...user, passwordHash: 'forbidden' }],
    ['AdminUserView', { ...user, version: 0 }],
    ['AdminUserView', { ...user, createdAt: '2026-10-02T15:04:05+03:00' }],
    ['AdminUserView', { ...user, name: '😀'.repeat(101) }],
    ['AdminUserView', { ...user, email: 'not-an-email' }],
    ['AdminUserList', { items: [user] }],
    ['ApiError', { code: 'VALIDATION_ERROR', message: 'Datos inválidos', requestId: user.id, fieldErrors: [{ field: 'name', code: 'INVALID', message: 'Campo inválido', value: 'forbidden' }] }],
    ['PatchAdminUserRequest', { expectedVersion: 1 }],
    ['PatchAdminUserRequest', { active: false, expectedVersion: 0 }],
    ['PatchAdminUserRequest', { active: true, expectedVersion: 1, email: 'other@example.test' }],
    ['LoginRequest', { email: 'admin@example.test', password: '' }],
  ]) {
    const checked = await validateExample(contractPath, { schema, value });
    assert.equal(checked.valid, false, `${schema} negative example`);
  }
  assert.equal((await validateExample(contractPath, { schema: 'AdminUserView', value: { ...user, name: '😀'.repeat(100) } })).valid, true, 'length counts Unicode code points');
  assert.equal((await validateExample(contractPath, { schema: 'PatchAdminUserRequest', value: { active: false, expectedVersion: 1 } })).valid, true);
  const document = await normative();
  assert.deepEqual(document.components.schemas.ResetAdminPasswordRequest.required, ['temporaryPassword', 'reason']);
  assert.equal(document.components.schemas.ResetAdminPasswordRequest.properties.expectedVersion, undefined);
});

test('normative OpenAPI loads and validates', async () => {
  const result = await validateContractFile(contractPath);
  assert.equal(result.valid, true, result.errors?.join('\n'));
});

test('missing and invalid contract documents fail explicitly', () => {
  assert.equal(validateContractDocument(null).valid, false);
  assert.equal(validateContractDocument({ openapi: '3.0.3', info: null, paths: [] }).valid, false);
});

test('external examples validate against their OpenAPI schemas', async () => {
  const valid = await validateExample(contractPath, 'examples/health-ok.json', 'HealthOk');
  assert.equal(valid.valid, true, valid.errors?.join('\n'));

  const badMoney = await validateExample(contractPath, {
    schema: 'Money',
    value: { amountMinor: 12.5, currency: 'ARS' },
  });
  assert.equal(badMoney.valid, false, 'numeric minor units must be rejected');

  const badUnit = await validateExample(contractPath, {
    schema: 'PresentationUnit',
    value: 'BUNDLE',
  });
  assert.equal(badUnit.valid, false, 'unknown presentation units must be rejected');

  const badQuantity = await validateExample(contractPath, {
    schema: 'PositiveQuantity',
    value: 0,
  });
  assert.equal(badQuantity.valid, false, 'zero quantity must be rejected');

  const badError = await validateExample(contractPath, {
    schema: 'ApiError',
    value: { code: 'X', message: 'safe', requestId: 'not-a-uuid', trace: 'leak' },
  });
  assert.equal(badError.valid, false, 'invalid request IDs and undeclared error fields must fail');
});

test('projected API and transversal conventions stay explicitly candidate', async () => {
  const result = await validateContractFile(contractPath);
  assert.equal(result.valid, true, result.errors?.join('\n'));
  assert.deepEqual(result.projectedPaths, ['/api/v1/public/auth/admin']);
  assert.deepEqual(result.idempotencyHeaders, ['Idempotency-Key']);
  assert.deepEqual(result.expectedVersionField, 'expectedVersion');
});

test('invalid external JSON examples keep validateContractFile and CLI invalid', async (t) => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDirectory, '..');
  const fixtureRoot = await mkdtemp(path.join(projectRoot, 'contracts', '.h0-contract-fixture-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));

  const fixtureContracts = path.join(fixtureRoot, 'contracts');
  const fixtureExamples = path.join(fixtureContracts, 'examples');
  await mkdir(fixtureExamples, { recursive: true });
  await copyFile(path.join(projectRoot, 'contracts/openapi.yaml'), path.join(fixtureContracts, 'openapi.yaml'));
  await copyFile(path.join(projectRoot, 'contracts/redocly.yaml'), path.join(fixtureContracts, 'redocly.yaml'));
  const registered = (await normative()).info['x-abar-examples'].map((example) => path.basename(example.file));
  for (const name of registered) {
    await copyFile(path.join(projectRoot, 'contracts/examples', name), path.join(fixtureExamples, name));
  }

  const moneyPath = path.join(fixtureExamples, 'money-ars.json');
  const invalidMoney = JSON.parse(await readFile(moneyPath, 'utf8'));
  invalidMoney.amountMinor = 1250000;
  await writeFile(moneyPath, `${JSON.stringify(invalidMoney, null, 2)}\n`);

  const contractPath = path.join(fixtureContracts, 'openapi.yaml');
  const validation = await validateContractFile(contractPath);
  assert.equal(validation.valid, false, 'a numeric amountMinor must invalidate the copied contract examples');
  assert.match(validation.errors.join('\n'), /money-ars\.json/);

  const cli = spawnSync(process.execPath, [
    path.join(testDirectory, 'h0-contract-validate.mjs'),
    '--contract',
    contractPath,
  ], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(cli.status, 1, `${cli.stdout}\n${cli.stderr}`);
  assert.match(`${cli.stdout}\n${cli.stderr}`, /money-ars\.json/);
});

test('health schema comparison preserves constraints and canonicalizes unordered schema sets', () => {
  const documentFor = (schema) => ({
    paths: {
      '/health': { get: { responses: { '200': { schema } } } },
    },
  });
  const expected = {
    type: 'object',
    nullable: true,
    required: ['name', 'tags'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 40, enum: ['short', 'long'] },
      tags: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
    },
    oneOf: [{ type: 'string' }, { type: 'integer' }],
  };
  const reordered = {
    oneOf: [{ type: 'integer' }, { type: 'string' }],
    properties: {
      tags: { items: { type: 'string' }, maxItems: 4, minItems: 1, type: 'array' },
      name: { enum: ['long', 'short'], maxLength: 40, minLength: 2, type: 'string' },
    },
    required: ['tags', 'name'],
    nullable: true,
    type: 'object',
  };
  assert.deepEqual(validateHealthSemantics(documentFor(expected), documentFor(reordered)), []);

  for (const mutate of [
    (schema) => { schema.properties.name.minLength = 3; },
    (schema) => { schema.properties.name.maxLength = 39; },
    (schema) => { schema.properties.tags.minItems = 2; },
    (schema) => { schema.properties.tags.maxItems = 3; },
    (schema) => { schema.nullable = false; },
    (schema) => { schema.oneOf = [{ type: 'string' }, { type: 'number' }]; },
  ]) {
    const changed = structuredClone(expected);
    mutate(changed);
    assert.notDeepEqual(validateHealthSemantics(documentFor(expected), documentFor(changed)), []);
  }
});

test('live Swagger health contract matches actual health operations and response semantics', () => {
  const normative = {
    paths: {
      '/health': {
        get: {
          responses: {
            '200': { schema: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } } },
            '503': { schema: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: { code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 }, fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'code', 'message'], properties: { field: { type: 'string', minLength: 1 }, code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 } } } }, requestId: { type: 'string', format: 'uuid' } } } },
          },
        },
      },
    },
  };
  const live = structuredClone(normative);
  assert.deepEqual(validateHealthSemantics(normative, live), []);

  delete live.paths['/health'].get.responses['200'].schema.additionalProperties;
  delete live.paths['/health'].get.responses['503'].schema;
  const differences = validateHealthSemantics(normative, live);
  assert.ok(differences.some((difference) => difference.includes('200')));
  assert.ok(differences.some((difference) => difference.includes('503')));
});
