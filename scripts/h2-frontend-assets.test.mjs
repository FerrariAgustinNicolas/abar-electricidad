import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Run after the production frontend build; do not substitute source existence
// for a deployable asset at the URL used by the catalog templates.
test('production catalog fallback is packaged byte-identically', async () => {
  const source = await readFile(new URL('../frontend/public/assets/product-fallback.svg', import.meta.url));
  const output = await readFile(new URL('../frontend/dist/abar-frontend/browser/assets/product-fallback.svg', import.meta.url));
  assert.deepEqual(output, source);
});
