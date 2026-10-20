import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const selectedTest = '^v2 separates bootstrap superuser identity and migration credentials$';

function sandbox(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'h1-owned-startup-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'repository');
  const target = path.join(root, 'backend/scripts');
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const name of ['h1-owned-postgres.mjs', 'h1-owned-postgres.test.mjs']) {
    fs.copyFileSync(path.join(scripts, name), path.join(target, name));
  }
  return { directory, root };
}

function start({ directory, root }) {
  return spawnSync(process.execPath, [
    '--test', '--test-reporter=tap', `--test-name-pattern=${selectedTest}`,
    'backend/scripts/h1-owned-postgres.test.mjs',
  ], {
    cwd: root,
    env: { HOME: directory, TMPDIR: directory, XDG_CONFIG_HOME: directory, XDG_CACHE_HOME: directory },
    encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
  });
}

function accepted(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /# pass 1\b/);
  assert.match(result.stdout, /# fail 0\b/);
}

test('runner prepares a missing ignored odd directory in a clean copy', (t) => {
  const fixture = sandbox(t);
  const odd = path.join(fixture.root, 'odd');
  assert.equal(fs.existsSync(odd), false);
  accepted(start(fixture));
  const stat = fs.lstatSync(odd);
  assert.equal(stat.isDirectory() && !stat.isSymbolicLink(), true);
  assert.equal(stat.mode & 0o777, 0o700);
  assert.deepEqual(fs.readdirSync(odd), []);
});

test('runner preserves an existing odd directory and its contents', (t) => {
  const fixture = sandbox(t);
  const odd = path.join(fixture.root, 'odd');
  fs.mkdirSync(odd, { mode: 0o700 });
  const sentinel = path.join(odd, 'sentinel');
  fs.writeFileSync(sentinel, 'preserve', { mode: 0o600 });
  const before = fs.lstatSync(odd).mode;
  accepted(start(fixture));
  assert.equal(fs.lstatSync(odd).mode, before);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
  assert.deepEqual(fs.readdirSync(odd), ['sentinel']);
});

for (const dangling of [false, true]) {
  test(`runner rejects a ${dangling ? 'dangling' : 'directory'} odd symlink without following it`, (t) => {
    const fixture = sandbox(t);
    const outside = path.join(fixture.directory, 'outside');
    if (!dangling) fs.mkdirSync(outside, { mode: 0o700 });
    const odd = path.join(fixture.root, 'odd');
    fs.symlinkSync(outside, odd, 'dir');
    const result = start(fixture);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.equal(fs.lstatSync(odd).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(odd), outside);
    assert.equal(fs.existsSync(outside), !dangling);
    if (!dangling) assert.deepEqual(fs.readdirSync(outside), []);
  });
}
