import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';

const require = createRequire(new URL('../package.json', import.meta.url));
const YAML = require('yaml');
const input = await readFile(new URL('../../contracts/openapi.yaml', import.meta.url), 'utf8');
const document = YAML.parse(input);
if (document.info?.['x-abar-h2-freeze'] !== 'catalog-stock-v1') {
  throw new Error('H2 frozen contract is required');
}
const directory = new URL('../dist/resources/catalog/', import.meta.url);
await mkdir(directory, { recursive: true });

// Parallel focused test runners may prepare the same immutable resource. Publish
// each complete file atomically so no reader can observe a truncated JSON file.
async function publish(name, content) {
  const temporary = new URL(`${name}.${randomUUID()}.tmp`, directory);
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, new URL(name, directory));
  } finally {
    await rm(temporary, { force: true });
  }
}
await publish('openapi.json', JSON.stringify(document));
await publish('openapi.sha256', createHash('sha256').update(input).digest('hex') + '\n');
