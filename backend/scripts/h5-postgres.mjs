import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
if (process.argv.includes('--help')) { console.log('Usage: node backend/scripts/h5-postgres.mjs [--keep]\nCreates new owned loopback PostgreSQL 17 clean/upgrade databases and runs H5 integration tests. --keep retains only this execution container for further local evidence; parent must verify ownership before cleanup. No existing database is reused.'); process.exit(0); }
if (process.argv.slice(2).some(a => a !== '--keep')) { console.error('Unknown option. Use --help.'); process.exit(2); }
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(backend, 'package.json')); const { Client } = require('pg');
const dockerHost = 'unix:///Users/agustin/.docker/run/docker.sock';
const owner = randomUUID(); const scratch = mkdtempSync(resolve(tmpdir(), 'abar-h5-pg.'));
const password = randomBytes(32).toString('base64url');
const docker = args => spawnSync('docker', ['--host', dockerHost, ...args], { encoding: 'utf8', env: { ...process.env, POSTGRES_PASSWORD: password } });
let container; let exit = 1;
try {
  const started = docker(['run', '--pull=never', '-d', '--name', `abar-h5-${owner}`, '--label', `com.abar.h5-owner=${owner}`, '--label', 'com.abar.h5-purpose=integration', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=h5_orders', '-e', 'POSTGRES_DB=h5_orders', '-p', '127.0.0.1::5432', 'postgres:17.11-bookworm']);
  if (started.status !== 0 || !/^[0-9a-f]{64}$/.test(started.stdout.trim())) throw Error('Unable to create owned local PostgreSQL fixture');
  container = started.stdout.trim();
  writeFileSync(resolve(scratch, 'ownership.json'), JSON.stringify({ container, owner, dockerHost }), { mode: 0o600 });
  const inspected = JSON.parse(docker(['inspect', container]).stdout)[0];
  const port = inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const url = `postgresql://h5_orders:${password}@127.0.0.1:${port}/h5_orders`;
  let ready = false;
  for (let n = 0; n < 60; n++) { const c = new Client({ connectionString: url }); try { await c.connect(); await c.query('SELECT 1'); ready = true; } catch { await new Promise(r => setTimeout(r, 250)); } finally { await c.end().catch(() => {}); } if (ready) break; }
  if (!ready) throw Error('Owned PostgreSQL did not become ready');
  const c = new Client({ connectionString: url }); await c.connect(); await c.query('CREATE DATABASE h5_upgrade'); await c.end();
  const config = resolve(scratch, 'full.config.ts'), historical = resolve(scratch, 'h4-migrations'); mkdirSync(historical);
  for (const m of readdirSync(resolve(backend, 'prisma/migrations'))) if (/^\d+_/.test(m) && !m.includes('_h5_') && !m.includes('_h6_')) cpSync(resolve(backend, 'prisma/migrations', m), resolve(historical, m), { recursive: true });
  const source = migrationPath => `import { defineConfig } from ${JSON.stringify(resolve(backend, 'node_modules/prisma/config.js'))};\nexport default defineConfig({ schema:${JSON.stringify(resolve(backend, 'prisma/schema.prisma'))},migrations:{path:${JSON.stringify(migrationPath)}},datasource:{url:process.env.H5_DATABASE_URL} });\n`;
  writeFileSync(config, source(resolve(backend, 'prisma/migrations'))); const oldConfig = resolve(scratch, 'h4.config.ts'); writeFileSync(oldConfig, source(historical));
  const upgradeUrl = new URL(url); upgradeUrl.pathname = '/h5_upgrade';
  const env = { ...process.env, H5_DATABASE_URL: url, H5_UPGRADE_DATABASE_URL: upgradeUrl.toString(), H5_CONTAINER_ID: container, H5_OWNER: owner, H5_CONFIG: config };
  const run = (args, e = env) => spawnSync(process.execPath, [resolve(backend, 'node_modules/prisma/build/index.js'), ...args], { cwd: backend, env: e, stdio: 'inherit' }).status ?? 1;
  if (run(['migrate', 'deploy', '--config', config]) !== 0 || run(['migrate', 'deploy', '--config', oldConfig], { ...env, H5_DATABASE_URL: env.H5_UPGRADE_DATABASE_URL }) !== 0) throw Error('Owned migration deployment failed');
  writeFileSync(resolve(scratch, 'fixture.json'), JSON.stringify({ ...Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('H5_'))), scratch }), { mode: 0o600 });
  const result = spawnSync('npm', ['run', 'test:e2e', '--', '--runInBand', '--testPathPatterns=h5-orders.e2e-spec.ts'], { cwd: backend, env, stdio: 'inherit' }); exit = result.status ?? 1;
  console.log(`Owned fixture manifest (private, never commit): ${resolve(scratch, 'fixture.json')}`);
} catch (e) { console.error(e.message); }
finally {
  if (container && !process.argv.includes('--keep')) {
    const inspected = JSON.parse(docker(['inspect', container]).stdout)[0];
    if (inspected.Id === container && inspected.Config.Labels['com.abar.h5-owner'] === owner && inspected.Mounts.length === 0) docker(['rm', '-f', container]);
  }
  console.log(`Scratch retained for parent cleanup: ${scratch}`);
}
process.exitCode = exit;
