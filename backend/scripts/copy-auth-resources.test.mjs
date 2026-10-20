import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'password-blocklist.bin',
  'password-blocklist.manifest.json',
  'LICENSE.pwdb.txt',
  'LICENSE.seclists.txt',
];
const failure = 'Auth resource packaging failed.\n';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'abar-auth-packaging-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = join(root, 'backend');
  const source = join(base, 'resources/auth');
  const destination = join(base, 'dist/resources/auth');
  const script = join(base, 'scripts/copy-auth-resources.mjs');
  const cli = join(base, 'scripts/copy-auth-resources-cli.mjs');
  await mkdir(source, { recursive: true });
  await mkdir(join(base, 'scripts'), { recursive: true });
  await mkdir(join(base, 'dist/auth'), { recursive: true });
  for (const name of files) {
    await copyFile(join(backend, 'resources/auth', name), join(source, name));
  }
  for (const name of ['password-blocklist.js', 'password-policy.js']) {
    await copyFile(join(backend, 'dist/auth', name), join(base, 'dist/auth', name));
  }
  await copyFile(join(backend, 'scripts/copy-auth-resources.mjs'), script);
  await copyFile(join(backend, 'scripts/copy-auth-resources-cli.mjs'), cli);
  return { root, base, source, destination, script, cli };
}

async function run(f, args = []) {
  try {
    const result = await execute(process.execPath, [...args, f.cli], { cwd: f.root });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

function assertFailure(result) {
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, failure);
}

async function assertAbsent(path) {
  await assert.rejects(access(path), { code: 'ENOENT' });
}

test('copies all four authentic files from fixed paths, unrelated cwd, repeatable', async (t) => {
  const f = await fixture(t);
  await mkdir(f.destination, { recursive: true });
  const unrelated = join(f.destination, 'unrelated.txt');
  await writeFile(unrelated, 'preserve');
  for (let repetition = 0; repetition < 2; repetition++) {
    const result = await run(f);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    for (const name of files) {
      assert.deepEqual(await readFile(join(f.destination, name)), await readFile(join(f.source, name)));
    }
  }
  assert.equal(await readFile(unrelated, 'utf8'), 'preserve');
  const probe = `const {loadPasswordBlocklist}=require(${JSON.stringify(join(f.base, 'dist/auth/password-blocklist.js'))});const lookup=loadPasswordBlocklist(${JSON.stringify(f.destination)});if(typeof lookup.hasDigest('0'.repeat(64))!=='boolean')process.exit(1);`;
  await execute(process.execPath, ['-e', probe], { cwd: f.root });
});

test('explicit CLI packages authenticated files when optional main API is absent', async (t) => {
  const f = await fixture(t);
  const entry = await readFile(f.cli, 'utf8');
  // Simulates feature absence on the current runner, not an older Node execution.
  const removeMain = `if (!delete import.meta.main || 'main' in import.meta) throw Error('simulation failed');\n`;
  await writeFile(f.cli, removeMain + entry);
  const result = await run(f);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  for (const name of files) {
    assert.deepEqual(await readFile(join(f.destination, name)), await readFile(join(f.source, name)));
  }
  const probe = `const {loadPasswordBlocklist}=require(${JSON.stringify(join(f.base, 'dist/auth/password-blocklist.js'))});const lookup=loadPasswordBlocklist(${JSON.stringify(f.destination)});if(typeof lookup.hasDigest('0'.repeat(64))!=='boolean')process.exit(1);`;
  await execute(process.execPath, ['-e', probe], { cwd: f.root });
});

for (const name of files) {
  for (const mode of ['missing', 'corrupt']) {
    test(`${mode} ${name} fails before any destination copy, redacted CLI`, async (t) => {
      const f = await fixture(t);
      const path = join(f.source, name);
      if (mode === 'missing') await rm(path);
      else {
        const bytes = await readFile(path);
        bytes[0] ^= 1;
        await writeFile(path, bytes);
      }
      assertFailure(await run(f));
      await assertAbsent(f.destination);
    });
  }
}

test('authenticates destination after copying, redacts corrupt-copy failure', async (t) => {
  const f = await fixture(t);
  const preload = join(f.root, 'corrupt-copy.cjs');
  await writeFile(preload, `const fs=require('node:fs');const copy=fs.copyFileSync;fs.copyFileSync=(source,destination)=>{copy(source,destination);if(destination.endsWith('LICENSE.seclists.txt'))fs.writeFileSync(destination,'corrupt');};require('node:module').syncBuiltinESMExports();`);
  assertFailure(await run(f, ['--require', preload]));
  await access(join(f.destination, files[0]));
});

test('import has no filesystem or packaging effects, even without loader/resources', async (t) => {
  const f = await fixture(t);
  await rm(join(f.base, 'dist'), { recursive: true });
  await rm(join(f.base, 'resources'), { recursive: true });
  const probe = `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const bytes=fs.readFileSync(${JSON.stringify(f.script)});fs.readFileSync=(path)=>{if(!String(path).endsWith('/scripts/copy-auth-resources.mjs'))throw Error('unexpected read');return bytes;};for(const name of ['mkdirSync','copyFileSync','openSync'])fs[name]=()=>{throw Error('unexpected I/O');};syncBuiltinESMExports();const module=await import(${JSON.stringify(pathToFileURL(f.script).href)});if(typeof module.copyAuthResources!=='function')process.exit(1);`;
  const result = await execute(process.execPath, ['--input-type=module', '-e', probe], { cwd: f.root });
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  await assertAbsent(f.destination);
});

test('callable API failure has only a fixed message, no raw cause', async (t) => {
  const f = await fixture(t);
  await rm(join(f.source, files[0]));
  const probe = `const {copyAuthResources}=await import(${JSON.stringify(pathToFileURL(f.script).href)});try{await copyAuthResources();process.exit(2);}catch(error){if(error.message!==${JSON.stringify(failure.trim())}||error.cause!==undefined)process.exit(3);}`;
  await execute(process.execPath, ['--input-type=module', '-e', probe], { cwd: f.root });
  await assertAbsent(f.destination);
});

test('CLI rejects resource override flags without copying', async (t) => {
  const f = await fixture(t);
  try {
    await execute(process.execPath, [f.cli, '--source', f.root], { cwd: f.root });
    assert.fail('CLI accepted override');
  } catch (error) {
    assertFailure({ code: error.code, stdout: error.stdout, stderr: error.stderr });
  }
  await assertAbsent(f.destination);
});

test('missing compiled loader produces fixed CLI failure without copying', async (t) => {
  const f = await fixture(t);
  await rm(join(f.base, 'dist/auth/password-blocklist.js'));
  assertFailure(await run(f));
  await assertAbsent(f.destination);
});
