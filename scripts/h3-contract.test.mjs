import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { validateContractDocument, validateExample } from './h0-contract-validate.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const document = () => readFile(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8').then(require('yaml').parse);
test('H3 additive freeze is accepted and remains closed to future order/payment routes', async () => {
 const d=await document(); assert.equal(validateContractDocument(d).valid,true);
 d.paths['/api/v1/public/orders']={post:d.paths['/api/v1/public/checkout/quotes'].post};
 assert.equal(validateContractDocument(d).valid,false);
});
test('H3 requires quote security, request/response and all safe conflicts', async () => {
 for(const mutate of [d=>delete d.paths['/api/v1/public/settings'],d=>delete d.paths['/api/v1/public/checkout/quotes'].post.responses['429'],d=>d.paths['/api/v1/public/checkout/quotes'].post.security=[{AdminSessionCookie:[]}],d=>d.components.schemas.QuoteRequest.additionalProperties=true]){
 const d=await document();mutate(d);assert.equal(validateContractDocument(d).valid,false);
 }
});
test('quote request rejects client money, malformed quantities and oversize input',async()=>{
 const file=new URL('../contracts/openapi.yaml',import.meta.url);
 const request=JSON.parse(await readFile(new URL('../contracts/examples/h3-quote-request.json',import.meta.url),'utf8'));
 const check=v=>validateExample(file,{schema:'QuoteRequest',value:v});
 assert.equal((await check(request)).valid,true);
 for(const quantity of [0,-1,0.5,1000001,'1']) assert.equal((await check({...request,items:[{...request.items[0],quantity}]})).valid,false);
 assert.equal((await check({...request,total:{amountMinor:'1',currency:'ARS'}})).valid,false);
 assert.equal((await check({...request,items:Array(101).fill(request.items[0])})).valid,false);
});
