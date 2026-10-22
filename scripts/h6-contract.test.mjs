import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateH6Contract } from './h6-contract.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const YAML = require('yaml');
const source = () => YAML.parse(readFileSync(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
test('H6 freezes only the authorized routes and closed schemas', () => assert.deepEqual(validateH6Contract(source()), []));
test('H6 rejects weakening admin auth and CSRF', () => {
  const d = source(); d.paths['/api/v1/admin/settings'].patch.security = [];
  assert.ok(validateH6Contract(d).some(e => e.includes('session')));
  const e = source(); e.paths['/api/v1/admin/settings'].patch.parameters = [];
  assert.ok(validateH6Contract(e).some(e => e.includes('CSRF')));
});
test('H6 rejects arbitrary notification content and open settings DTOs', () => {
  const d = source(); d.components.schemas.H6NotificationRetry.additionalProperties = true;
  assert.ok(validateH6Contract(d).some(e => e.includes('closed')));
  const e = source(); e.components.schemas.H6NotificationView.properties.payload = {type:'object'};
  assert.ok(validateH6Contract(e).some(e => e.includes('private')));
});
test('H6 request examples are closed and reject malformed money and unsafe recipients', async () => {
  const { validateExample } = await import('./h0-contract-validate.mjs');
  const file = new URL('../contracts/openapi.yaml', import.meta.url);
  const body = JSON.parse(readFileSync(new URL('../contracts/examples/h6-settings-write.json', import.meta.url), 'utf8'));
  assert.equal((await validateExample(file, {schema:'H6SettingsWrite',value:body})).valid, true);
  for (const feeMinor of ['-1','1.2','01','92233720368547758080',1]) assert.equal((await validateExample(file, {schema:'H6SettingsWrite',value:{...body,feeMinor}})).valid, false);
  assert.equal((await validateExample(file, {schema:'H6SettingsWrite',value:{...body,contact:{...body.contact,email:'real@external.invalid'}}})).valid, false);
  assert.equal((await validateExample(file, {schema:'H6NotificationRetry',value:{expectedVersion:1,recipient:'arbitrary@example.test'}})).valid, false);
});
