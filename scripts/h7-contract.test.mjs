import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateH7Contract } from './h7-contract.mjs';
import { validateContractDocument } from './h0-contract-validate.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const YAML = require('yaml');
const contract = YAML.parse(readFileSync(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
test('H7 freezes three protected read-only operations, exact money and dates', () => {
  assert.deepEqual(validateH7Contract(contract), []);
  assert.equal(validateContractDocument(contract).valid, true);
});
test('H7 rejects missing session security, open DTOs and CSV cache drift', () => {
  for (const alter of [
    d => d.paths['/api/v1/admin/dashboard'].get.security = [],
    d => d.components.schemas.H7SalesReport.additionalProperties = true,
    d => delete d.paths['/api/v1/admin/reports/sales/export'].get.responses['200'].headers['Cache-Control'],
    d => d.components.schemas.H7SalesTotals.properties.confirmedTotal = {type:'number'},
    d => delete d.paths['/api/v1/admin/dashboard'].get.parameters[0].required,
  ]) { const d=structuredClone(contract); alter(d); assert.ok(validateH7Contract(d).length); }
});

test('H7 methods match persisted H4 codes and CSV counts have explicit columns', () => {
  const codes = contract.components.schemas.H7MethodSales.properties.methodCode.enum;
  assert.deepEqual([...codes].sort(), ['DEMO_PAY_ON_PICKUP', 'DEMO_TRANSFER', 'DEMO_SIMULATION'].sort());
  const csv = contract.paths['/api/v1/admin/reports/sales/export'].get.description;
  assert.match(csv, /averageTicketMinor,activeUnpaidCount,cancelledUnpaidCount,rejectedPaymentCount,rejectedCurrentAttemptCount,currency/);
  assert.doesNotMatch(csv, /quantity=activeUnpaidCount|c\/r\/a/);
});

test('pre-H7 invalid versions retain the exact H6 public diagnostic', () => {
  const d = structuredClone(contract);
  delete d.info['x-abar-h7-freeze'];
  d.info.version = '0.1.0';
  const result = validateContractDocument(d);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('H6 version must be 0.9.0'));
  assert.ok(!result.errors.some(error => error.includes('or additive frozen H7')));
});

test('H7 rejects cacheable responses and missing or unsafe CSV headers', () => {
  const routes = ['/api/v1/admin/dashboard', '/api/v1/admin/reports/sales', '/api/v1/admin/reports/sales/export'];
  for (const route of routes) for (const status of ['200', '400', '401', '403', '503']) {
    const d = structuredClone(contract);
    d.paths[route].get.responses[status].headers['Cache-Control'].schema.enum = ['public, max-age=3600'];
    assert.ok(validateH7Contract(d).length, `${route} ${status} must be no-store`);
  }
  const route = routes[2];
  for (const name of ['Content-Disposition', 'X-Content-Type-Options', 'Content-Type']) {
    for (const mutate of [h => { delete h[name]; }, h => { h[name]['x-required'] = false; }, h => { h[name].schema.enum = ['unsafe']; }]) {
      const d = structuredClone(contract);
      mutate(d.paths[route].get.responses['200'].headers);
      assert.ok(validateH7Contract(d).length, `${name} must retain its exact required value`);
    }
  }
});
