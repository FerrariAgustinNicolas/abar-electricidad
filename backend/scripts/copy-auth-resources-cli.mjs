import { copyAuthResources } from './copy-auth-resources.mjs';

// Deliberate executable entry; import the core module for the callable API.
try {
  if (process.argv.length !== 2) throw new Error();
  copyAuthResources();
} catch {
  process.stderr.write('Auth resource packaging failed.\n');
  process.exitCode = 1;
}
