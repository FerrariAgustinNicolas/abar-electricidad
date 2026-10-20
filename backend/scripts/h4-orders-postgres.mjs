import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const required = ['H4_ORDERS_CLEAN_DATABASE_URL', 'H4_ORDERS_UPGRADE_DATABASE_URL', 'H4_ORDERS_CONTAINER_ID', 'H4_ORDERS_OWNER'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  process.stderr.write(`H4 owned PostgreSQL fixture required; missing private environment settings: ${missing.join(', ')}\n`);
  process.exit(2);
}

const backendPath = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = resolve(backendPath, '..');
const result = spawnSync('npm', ['--prefix', backendPath, 'run', 'test:e2e', '--', '--runInBand', '--testPathPatterns=h4-orders.e2e-spec.ts'], {
  cwd: repoPath, env: process.env, stdio: 'inherit',
});
if (result.error) {
  process.stderr.write('Unable to launch the H4 PostgreSQL verification runner.\n');
  process.exit(2);
}
process.exit(result.status ?? 2);
