import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  validateContractDocument,
  validateContractFile,
  validateExample,
  validateHealthSemantics,
} from './h0-contract-validate.mjs';

const contractPath = new URL('../contracts/openapi.yaml', import.meta.url);

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
  const fixtureRoot = await mkdtemp(path.join(testDirectory, '.h0-contract-fixture-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));

  const fixtureContracts = path.join(fixtureRoot, 'contracts');
  const fixtureExamples = path.join(fixtureContracts, 'examples');
  await mkdir(fixtureExamples, { recursive: true });
  await copyFile(path.join(projectRoot, 'contracts/openapi.yaml'), path.join(fixtureContracts, 'openapi.yaml'));
  await copyFile(path.join(projectRoot, 'contracts/redocly.yaml'), path.join(fixtureContracts, 'redocly.yaml'));
  for (const name of ['health-ok.json', 'health-unavailable.json', 'money-ars.json']) {
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
