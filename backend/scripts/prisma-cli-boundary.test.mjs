import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(backend, '../odd/probes/h1-prisma-cli-boundary');
const denial = 'Default Prisma CLI configuration is disabled. Use an explicit approved config.';
mkdirSync(artifacts, { recursive: true });
const run = mkdtempSync(join(artifacts, 'boundary-'));

// Preserve a full generated-client inventory before any build, without dumping code.
function inventory(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(prefix, entry.name);
    return entry.isDirectory()
      ? inventory(join(directory, entry.name), relative)
      : [{ path: relative, sha256: createHash('sha256').update(readFileSync(join(directory, entry.name))).digest('hex') }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
writeFileSync(join(run, 'generated-before.json'), JSON.stringify(inventory(join(backend, 'src/generated/prisma')), null, 2));

function fixture() {
  const directory = mkdtempSync(join(run, 'case-'));
  for (const name of ['home', 'cache', 'config', 'data', 'state', 'tmp', 'jiti']) {
    mkdirSync(join(directory, name));
  }
  symlinkSync(join(backend, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const env = {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: join(directory, 'home'),
    XDG_CACHE_HOME: join(directory, 'cache'),
    XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_DATA_HOME: join(directory, 'data'),
    XDG_STATE_HOME: join(directory, 'state'),
    TMPDIR: join(directory, 'tmp'),
    TMP: join(directory, 'tmp'),
    TEMP: join(directory, 'tmp'),
    JITI_FS_CACHE: join(directory, 'jiti'),
  };
  return { directory, env };
}

function loadDefault(owned = fixture()) {
  const { directory, env } = owned;
  copyFileSync(join(backend, 'prisma.config.ts'), join(directory, 'prisma.config.ts'));
  const script = `
    import { loadConfigFromFile } from ${JSON.stringify(join(backend, 'node_modules/@prisma/config/dist/index.js'))};
    const result = await loadConfigFromFile({ configRoot: process.cwd() });
    const message = result.error?.error?.message;
    console.log(JSON.stringify({ denied: !!result.error, exact: message === ${JSON.stringify(denial)},
      diagnosticsEmpty: result.diagnostics.length === 0 }));
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory, env, encoding: 'utf8', timeout: 30000,
  });
}

test('default discovery denies with exactly one fixed safe error', () => {
  const result = loadDefault();
  assert.equal(result.status === 0 && !result.error, true, 'loader child completed');
  const flags = JSON.parse(result.stdout);
  assert.equal(flags.denied, true, 'default configuration must deny');
  assert.equal(flags.exact, true, 'only the fixed denial is exposed');
  assert.equal(flags.diagnosticsEmpty, true, 'no config diagnostics are emitted');
  assert.equal(result.stderr.length === 0, true, 'no private stderr diagnostics');
});

// Installed CLI initializes commands.json before loading config, but returns on
// config failure before parse/checkpoint/engine dispatch. Never run a DB command
// against the repository context; select a copy of the actual denying config.
for (const command of [['generate'], ['validate'], ['migrate', 'status']]) {
  test(`CLI rejects before dispatch: ${command.join(' ')}`, () => {
    const { directory, env } = fixture();
    // A failing Node test does not stop later tests. Gate every CLI launch on
    // real-loader denial of its own selected copy, including future regressions.
    const gate = loadDefault({ directory, env });
    assert.equal(gate.status === 0 && JSON.parse(gate.stdout).exact === true, true, 'loader denial required before CLI');
    const config = join(directory, 'prisma.config.ts');
    const result = spawnSync(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'),
      ...command, '--config', config], {
      cwd: directory, env, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(!result.error && result.signal === null, true, 'CLI completed within timeout');
    assert.equal(result.status === 1, true, 'CLI denial exit');
    const expected = `Failed to load config file "${config}" as a TypeScript/JavaScript module. Error: Error: ${denial}\n`;
    assert.equal(result.stderr === expected, true, 'only config-load denial is emitted');
    assert.equal(result.stdout.length === 0, true, 'no command dispatch output');
    const state = process.platform === 'darwin'
      ? join(env.HOME, 'Library/Preferences/prisma-nodejs/commands.json')
      : join(env.XDG_CONFIG_HOME, 'prisma-nodejs/commands.json');
    assert.equal(existsSync(state), true, 'command state is inside owned fixture');
  });
}

for (const inherited of [false, true]) {
  test(`explicit schema-only config ignores inherited URL: ${inherited}`, () => {
    const { directory, env } = fixture();
    copyFileSync(join(backend, 'prisma.schema.config.ts'), join(directory, 'prisma.schema.config.ts'));
    if (inherited) env.DATABASE_URL = 'postgresql://synthetic.invalid/synthetic';
    const script = `
      import { loadConfigFromFile } from ${JSON.stringify(join(backend, 'node_modules/@prisma/config/dist/index.js'))};
      import { resolve } from 'node:path';
      const result = await loadConfigFromFile({ configRoot: process.cwd(), configFile: 'prisma.schema.config.ts' });
      console.log(JSON.stringify({ loaded: !result.error,
        exactPath: result.resolvedPath === resolve('prisma.schema.config.ts'),
        exactSchema: result.config?.schema === resolve('prisma/schema.prisma'),
        // defineConfig normalizes an omitted datasource to an undefined property.
        noDatasource: result.config?.datasource === undefined }));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: directory, env, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status === 0 && !result.error, true, 'loader child completed');
    const flags = JSON.parse(result.stdout);
    for (const key of ['loaded', 'exactPath', 'exactSchema', 'noDatasource']) {
      assert.equal(flags[key], true, key);
    }
    assert.equal(result.stderr.length === 0, true, 'no private diagnostics');
  });
}
