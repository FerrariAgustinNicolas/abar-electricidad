import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { validateContractDocument, validateExample } from './h0-contract-validate.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const file = new URL('../contracts/openapi.yaml', import.meta.url);
const document = async () => require('yaml').parse(await readFile(file, 'utf8'));
const confirmation = { expectedVersion: 1, attemptId: '40000000-0000-4000-8000-000000000001', confirmedAmount: { amountMinor: '5000', currency: 'ARS' } };
test('H5 freezes exactly seven protected admin operations, not arbitrary payment writes', async () => {
  const d = await document();
  assert.equal(d.info.version, '0.8.0');
  assert.equal(d.info['x-abar-h5-freeze'], 'manual-confirmation-v1');
  assert.equal(validateContractDocument(d).valid, true);
  const route = '/api/v1/admin/orders/{id}/payment-confirmation';
  assert.deepEqual(d.paths[route].post.security, [{ AdminSessionCookie: [] }]);
  delete d.paths[route].post.parameters;
  assert.equal(validateContractDocument(d).valid, false);
});
test('H5 confirmation accepts only full exact ARS minor units and aggregate preconditions', async () => {
  const check = value => validateExample(file, { schema: 'PaymentConfirmationRequest', value });
  assert.equal((await check(confirmation)).valid, true);
  for (const value of [
    { ...confirmation, paymentStatus: 'PAID' }, { ...confirmation, expectedVersion: 0 },
    { ...confirmation, confirmedAmount: { amountMinor: 5000, currency: 'ARS' } },
    { ...confirmation, confirmedAmount: { amountMinor: '5.00', currency: 'ARS' } },
    { ...confirmation, confirmedAmount: { amountMinor: '5000', currency: 'USD' } },
  ]) assert.equal((await check(value)).valid, false);
});
test('H5 cancellation needs a reason; generic status cannot pay or cancel', async () => {
  const check = (schema, value) => validateExample(file, { schema, value });
  assert.equal((await check('CancelOrderRequest', { expectedVersion: 1, reason: 'Customer request' })).valid, true);
  assert.equal((await check('CancelOrderRequest', { expectedVersion: 1, reason: '' })).valid, false);
  for (const status of ['RECEIVED', 'PREPARING', 'CANCELLED', 'PAID']) assert.equal((await check('OrderStatusRequest', { expectedVersion: 1, status })).valid, false);
  for (const status of ['READY', 'DELIVERED']) assert.equal((await check('OrderStatusRequest', { expectedVersion: 1, status })).valid, true);
});
test('H5 public views remain closed and expose final statuses without private fields', async () => {
  const d = await document();
  for (const name of ['PublicOrderView', 'OrderLookupResponse']) {
    const s = d.components.schemas[name];
    assert.equal(s.additionalProperties, false);
    assert.deepEqual(s.properties.orderStatus.enum, ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']);
    assert.deepEqual(s.properties.paymentStatus.enum, ['PENDING', 'REJECTED', 'PAID']);
    for (const field of ['notes', 'history', 'customer', 'stock', 'accessToken']) assert.equal(s.properties[field], undefined);
  }
});
test('H5 notes and allowed actions are closed, bounded and versioned', async () => {
  const check = value => validateExample(file, { schema: 'OrderNoteRequest', value });
  assert.equal((await check({ expectedVersion: 1, text: 'Call before pickup' })).valid, true);
  assert.equal((await check({ expectedVersion: 1, text: 'x'.repeat(2001) })).valid, false);
  assert.equal((await check({ expectedVersion: 1, text: 'Note', customerNote: 'overwrite' })).valid, false);
  const d = await document();
  for (const name of ['AdminOrderList', 'AdminOrderDetail', 'OrderHistory', 'OrderNote', 'AllowedOrderActions', 'PaymentConfirmationResponse']) assert.equal(d.components.schemas[name].additionalProperties, false);
});
test('H5 movement reads preserve both H2 types and add payment linkage', async () => {
  const d = await document();
  assert.deepEqual(d.paths['/api/v1/admin/stock/movements'].get.parameters.find(p => p.name === 'type').schema.enum, ['ADJUSTMENT', 'ROLL_OPENING', 'PAYMENT_CONFIRMATION']);
  assert.deepEqual(d.components.schemas.StockOperationView.properties.type.enum, ['ADJUSTMENT', 'ROLL_OPENING', 'PAYMENT_CONFIRMATION']);
  assert.equal(d.components.schemas.StockOperationView.properties.paymentId.$ref, '#/components/schemas/OpaqueId');
  assert.equal(d.components.schemas.StockRow.properties.requestedUnpaidQuantity.minimum, 0);
});
