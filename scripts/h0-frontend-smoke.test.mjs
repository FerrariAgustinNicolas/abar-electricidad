import assert from 'node:assert/strict';
import test from 'node:test';
import { angularServeArguments } from './h0-frontend-smoke.mjs';

test('Angular CLI smoke arguments keep the supported loopback proxy options', () => {
  const args = angularServeArguments(4567);

  assert.deepEqual(args, ['serve', '--host', '127.0.0.1', '--port', '4567', '--proxy-config', 'proxy.conf.json']);
  assert.equal(args.includes('--no-progress'), false);
});
