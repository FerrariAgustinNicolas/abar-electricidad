import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const require = createRequire(new URL('../package.json', import.meta.url));
const YAML = require('yaml');
const script = fileURLToPath(new URL('./copy-catalog-contract.mjs', import.meta.url));
const resource = new URL('../dist/resources/catalog/', import.meta.url);

test('parallel packaging publishes the exact frozen source without leftover temporary files', async () => {
  await Promise.all(Array.from({ length: 4 }, () => execute(process.execPath, [script], { cwd: process.env.TMPDIR ?? '/tmp' })));
  const source = await readFile(new URL('../../contracts/openapi.yaml', import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(await readFile(new URL('openapi.json', resource), 'utf8')), YAML.parse(source));
  assert.equal(await readFile(new URL('openapi.sha256', resource), 'utf8'), createHash('sha256').update(source).digest('hex') + '\n');
  assert.deepEqual((await readdir(resource)).filter((name) => name.endsWith('.tmp')), []);
});
