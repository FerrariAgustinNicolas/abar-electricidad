import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { validateContractDocument, validateExample } from './h0-contract-validate.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const file = new URL('../contracts/openapi.yaml', import.meta.url);
const document = async () => require('yaml').parse(await readFile(file, 'utf8'));
test('H4 additive freeze explicitly authorizes only the bounded order operations', async () => {
  const d = await document();
  assert.equal(d.info['x-abar-h4-freeze'], 'orders-demo-v1');
  assert.equal(validateContractDocument(d).valid, true);
  d.paths['/api/v1/admin/orders/confirm'] = {post: d.paths['/api/v1/public/orders'].post};
  assert.equal(validateContractDocument(d).valid, false);
});
test('H4 creation accepts buyer and terms, never client totals or payment states', async () => {
  const body = {quoteId:'40000000-0000-4000-8000-000000000001',customer:{firstName:'Demo',lastName:'Buyer',email:'buyer@example.test',phone:'+541155550000'},acceptedTermsVersion:'demo-2026-10-20-v1'};
  const check = value => validateExample(file,{schema:'CreateOrderRequest',value});
  assert.equal((await check(body)).valid,true);
  for(const field of ['paymentStatus','orderStatus','total','items','scenario']) assert.equal((await check({...body,[field]:'PAID'})).valid,false);
  assert.equal((await check({...body,acceptedTermsVersion:'old'})).valid,false);
  assert.equal((await check({...body,customer:{...body.customer,phone:''}})).valid,false);
});
test('H4 requires possession header and durable idempotency on mutations', async () => {
  const d = await document();
  const get = d.paths['/api/v1/public/orders/{id}'].get;
  assert.deepEqual(get.security,[{OrderAccessToken:[]}]);
  assert.equal(d.components.securitySchemes.OrderAccessToken.in,'header');
  delete d.paths['/api/v1/public/orders'].post.parameters;
  assert.equal(validateContractDocument(d).valid,false);
});
test('H4 manual attempts forbid scenarios; public views cannot carry private buyer fields', async () => {
  const check = value => validateExample(file,{schema:'AttemptRequest',value});
  assert.equal((await check({methodCode:'DEMO_TRANSFER'})).valid,true);
  assert.equal((await check({methodCode:'DEMO_TRANSFER',scenario:'APPROVED'})).valid,false);
  assert.equal((await check({methodCode:'DEMO_SIMULATION',scenario:'APPROVED'})).valid,true);
  const d = await document();
  for(const name of ['PublicOrderView','OrderLookupResponse']) for(const field of ['accessToken','customer','deliveryDetails','customerNote']) assert.equal(d.components.schemas[name].properties[field],undefined);
});
