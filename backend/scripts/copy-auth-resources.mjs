import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const failure = 'Auth resource packaging failed.';
const files = [
  'password-blocklist.bin',
  'password-blocklist.manifest.json',
  'LICENSE.pwdb.txt',
  'LICENSE.seclists.txt',
];

// Paths belong to this script, not the caller's working directory or environment.
export function copyAuthResources() {
  try {
    const source = fileURLToPath(new URL('../resources/auth/', import.meta.url));
    const destination = fileURLToPath(new URL('../dist/resources/auth/', import.meta.url));
    const require = createRequire(import.meta.url);
    const { loadPasswordBlocklist } = require('../dist/auth/password-blocklist.js');
    // C04 remains the sole authority for resource, manifest and complete notice pins.
    loadPasswordBlocklist(source);
    mkdirSync(destination, { recursive: true });
    for (const name of files) copyFileSync(join(source, name), join(destination, name));
    loadPasswordBlocklist(destination);
  } catch {
    throw new Error(failure);
  }
}
