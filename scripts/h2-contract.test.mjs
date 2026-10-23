import { H7_OPERATIONS } from './h7-contract.mjs';
import { H6_OPERATIONS } from './h6-contract.mjs';
import { H5_OPERATIONS } from './h5-contract.mjs';
import { H4_OPERATIONS } from './h4-contract.mjs';
import { H3_OPERATIONS } from './h3-contract.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { H2_OPERATIONS, validateH2Contract } from './h2-contract.mjs';
import { validateContractDocument, validateExample as validateExternalExample } from './h0-contract-validate.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const YAML = require('yaml');
const validateExample = (_document, schema, value) => validateExternalExample(new URL('../contracts/openapi.yaml', import.meta.url), { schema, value });
const normative = async () => YAML.parse(await readFile(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));

test('H2 freezes only its explicit catalog, image and stock operations while preserving H1', async () => {
  const document = await normative();
  assert.equal(H2_OPERATIONS.length, 21);
  assert.deepEqual(validateH2Contract(document), []);
  assert.equal(validateContractDocument(document).valid, true);
  const changed = structuredClone(document);
  changed.paths['/api/v1/public/checkout/quotes'] = { post: document.paths['/api/v1/admin/stock/adjustments'].post };
  assert.equal(validateContractDocument(changed).valid, false);
});

test('every admin catalog mutation keeps H1 session, Origin and CSRF, with stock idempotency required', async () => {
  const original = await normative();
  for (const [route, method] of H2_OPERATIONS.filter(([route, method]) => route.includes('/admin/') && method !== 'get')) {
    for (const mutate of [
      (op) => { op.security = []; },
      (op) => { op.parameters = op.parameters.filter((p) => p.$ref !== '#/components/parameters/CsrfToken'); },
      (op) => { op.parameters = op.parameters.filter((p) => p.$ref !== '#/components/parameters/Origin'); },
    ]) {
      const changed = structuredClone(original);
      mutate(changed.paths[route][method]);
      assert.ok(validateH2Contract(changed).length, `${method} ${route}`);
    }
  }
  for (const route of ['/api/v1/admin/stock/adjustments', '/api/v1/admin/stock/roll-openings']) {
    const changed = structuredClone(original);
    changed.paths[route].post.parameters = changed.paths[route].post.parameters.filter((p) => p.name !== 'Idempotency-Key');
    assert.ok(validateH2Contract(changed).length);
  }
});

test('public presentations cannot expose exact stock and Money remains a decimal ARS string', async () => {
  const document = await normative();
  const example = JSON.parse(await readFile(new URL('../contracts/examples/h2-product.json', import.meta.url), 'utf8'));
  assert.equal((await validateExample(document, 'ProductDetail', example)).valid, true);
  for (const mutate of [
    (p) => { p.presentations[0].availableQuantity = 20; },
    (p) => { p.presentations[0].price.amountMinor = 1250.5; },
    (p) => { p.presentations[0].price.currency = 'USD'; },
    (p) => { p.presentations[0].availability = 'invented'; },
  ]) {
    const changed = structuredClone(example); mutate(changed);
    assert.equal((await validateExample(document, 'ProductDetail', changed)).valid, false);
  }
});

test('stock requests disallow fractional or zero deltas, client-computed meters and direct balances', async () => {
  const document = await normative();
  const id = '11111111-1111-4111-8111-111111111111';
  const adjustment = { presentationId: id, delta: 1, reason: 'Initial physical count', expectedVersion: 1 };
  assert.equal((await validateExample(document, 'StockAdjustmentRequest', adjustment)).valid, true);
  for (const delta of [0, 0.5, -0.5]) assert.equal((await validateExample(document, 'StockAdjustmentRequest', { ...adjustment, delta })).valid, false);
  const opening = { productId: id, rollQuantity: 1, reason: 'Open physically', expectedVersions: { roll: 1, meter: 1 } };
  assert.equal((await validateExample(document, 'RollOpeningRequest', opening)).valid, true);
  for (const rollQuantity of [0, 0.5, -1]) assert.equal((await validateExample(document, 'RollOpeningRequest', { ...opening, rollQuantity })).valid, false);
  assert.equal((await validateExample(document, 'RollOpeningRequest', { ...opening, meters: 100 })).valid, false);
  const write = JSON.parse(await readFile(new URL('../contracts/examples/h2-product-write.json', import.meta.url), 'utf8'));
  assert.equal((await validateExample(document, 'ProductWrite', write)).valid, true);
  assert.equal((await validateExample(document, 'ProductWrite', { ...write, availableQuantity: 1 })).valid, false);
  for (const rollLengthMeters of [0, 1.5, null]) {
    const changed = structuredClone(write); changed.presentations[1].rollLengthMeters = rollLengthMeters;
    assert.equal((await validateExample(document, 'ProductWrite', changed)).valid, false);
  }
});

test('frozen H2 validator rejects removal of endpoints, error schemas and multipart content', async () => {
  const original = await normative();
  for (const mutate of [
    (d) => { delete d.paths['/api/v1/public/products/{slug}']; },
    (d) => { delete d.paths['/api/v1/admin/stock/adjustments'].post.responses['409']; },
    (d) => { delete d.paths['/api/v1/admin/products/{id}/images'].post.requestBody.content['multipart/form-data']; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.ok(validateH2Contract(changed).length);
  }
});

test('legacy H1-only contract remains accepted by the same public validator interface', async () => {
  const document = await normative();
  for (const [route] of [...H2_OPERATIONS, ...H3_OPERATIONS, ...H4_OPERATIONS, ...H5_OPERATIONS, ...H6_OPERATIONS, ...H7_OPERATIONS]) delete document.paths[route];
  delete document.info['x-abar-h7-freeze'];
  delete document.info['x-abar-h6-freeze'];
  delete document.info['x-abar-h5-freeze'];
  delete document.info['x-abar-h4-freeze'];
  delete document.info['x-abar-h3-freeze'];
  document.info.version = '0.4.0';
  delete document.info['x-abar-h2-freeze'];
  delete document.info['x-abar-h2-runtime-stage'];
  document.info['x-abar-examples'] = document.info['x-abar-examples'].filter((example) => !example.file.includes('/h2-'));
  assert.equal(validateContractDocument(document).valid, true);
  document.paths['/api/v1/admin/unapproved'] = { get: document.paths['/api/v1/admin/users'].get };
  assert.equal(validateContractDocument(document).valid, false);
});
