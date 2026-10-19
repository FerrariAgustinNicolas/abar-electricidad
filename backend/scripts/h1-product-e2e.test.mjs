import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_CHECKS, runAdminProductE2E } from './h1-product-e2e.mjs';

test('optional product stage hook reports only the fixed auth check label and preserves failed result shape', async () => {
  const previousFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ admin: { id: 'not-the-actor' } }), {
    status: 200, headers: { 'cache-control': 'no-store' },
  });
  try {
    const result = await runAdminProductE2E({ baseUrl: 'http://127.0.0.1:3000', origin: 'http://127.0.0.1:3000',
      runId: 'a'.repeat(32), actorId: 'actor', actorCookie: 'cookie', actorCsrf: 'csrf', currentPassword: 'current',
      replacementPassword: 'replacement', deadlineAt: Date.now() + 10000, snapshot: async () => ({ users: [], sessions: [], audits: [] }),
      onStage: (stage, phase, errorClass) => events.push(errorClass === undefined ? [stage, phase] : [stage, phase, errorClass]),
    });
    assert.equal(result.passed, false);
    assert.deepEqual(result.checks, PRODUCT_CHECKS.map(name => ({ name, passed: false })));
    assert.deepEqual(events, [['check.auth.me', 'start'], ['check.auth.me', 'end'], ['check.auth.me', 'error', 'RUNTIME_ERROR']]);
    assert.equal(JSON.stringify(events).includes('actor'), false);
  } finally { globalThis.fetch = previousFetch; }
});

test('product result keeps the original nine-operation check set and exposes only fixed booleans', async () => {
  assert.deepEqual(PRODUCT_CHECKS, [
    'auth.csrf', 'auth.login', 'auth.me', 'auth.logout', 'auth.change-password',
    'admin.list', 'admin.create', 'admin.patch', 'admin.reset-password',
  ]);
  const result = await runAdminProductE2E({});
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks, PRODUCT_CHECKS.map(name => ({ name, passed: false })));
  assert.equal(JSON.stringify(result).includes('passwordHash'), false);
  assert.equal(JSON.stringify(result).includes('replacementPassword'), false);
});


test('failed list assertion retains its current static check label, not completed auth.me', async () => {
  const previousFetch = globalThis.fetch;
  const events = [];
  let count = 0;
  globalThis.fetch = async () => {
    const status = [200, 403, 403, 500][count++];
    return new Response(JSON.stringify(status === 200 ? { admin: { id: 'actor' } } : {}),
      { status, headers: { 'cache-control': 'no-store' } });
  };
  try {
    const result = await runAdminProductE2E({ baseUrl: 'http://127.0.0.1:3000', origin: 'http://127.0.0.1:3000',
      runId: 'a'.repeat(32), actorId: 'actor', actorCookie: 'cookie', actorCsrf: 'csrf', currentPassword: 'current',
      replacementPassword: 'replacement', deadlineAt: Date.now() + 10000,
      snapshot: async () => ({ users: [], sessions: [], audits: [] }),
      onStage: (...event) => events.push(event) });
    assert.equal(result.passed, false);
    assert.deepEqual(events.at(-1), ['check.admin.list', 'error', 'RUNTIME_ERROR']);
  } finally { globalThis.fetch = previousFetch; }
});
