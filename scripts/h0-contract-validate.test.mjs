import assert from 'node:assert/strict';
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
