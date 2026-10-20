import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const urlText = process.env.H2_SEED_DATABASE_URL;
const id = process.env.H2_STOCK_CONTAINER_ID;
const owner = process.env.H2_STOCK_OWNER;
const root = fileURLToPath(new URL('../', import.meta.url));

test('fictional seed includes a gallery and long content without overwriting existing records', {
  skip: !urlText || !id || !owner ? 'Requires an independently identified new owned PostgreSQL fixture' : false,
}, async () => {
  const url = new URL(urlText);
  assert(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/h2_seed');
  assert.match(id, /^[0-9a-f]{64}$/);
  const container = JSON.parse(execFileSync('docker', ['--host', 'unix:///Users/agustin/.docker/run/docker.sock', 'inspect', id], { encoding: 'utf8' }))[0];
  assert.equal(container.Id, id);
  assert.equal(container.State.Running, true);
  assert.equal(container.Config.Image, 'postgres:17.11-bookworm');
  assert.equal(container.Config.Labels['com.abar.h2-stock-owner'], owner);
  assert.equal(container.Config.Labels['com.abar.h2-stock-purpose'], 'integration');
  assert.deepEqual(container.Mounts, []);
  assert.deepEqual(container.HostConfig.Binds ?? [], []);
  assert.deepEqual(Object.keys(container.HostConfig.Tmpfs), ['/var/lib/postgresql/data']);
  assert.deepEqual(container.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: url.port }]);
  const client = new pg.Client({ connectionString: urlText });
  const directory = await mkdtemp(join(tmpdir(), 'abar-h2-seed-images-'));
  await client.connect();
  try {
    const initial = await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
    assert.equal(initial.rows[0].count, 0, 'Never seed a pre-existing database in this destructive-fixture test');
    const migrationRoot = resolve(root, 'prisma/migrations');
    for (const migration of (await readdir(migrationRoot)).filter((name) => /^\d+_/.test(name)).sort()) {
      await client.query(await readFile(resolve(migrationRoot, migration, 'migration.sql'), 'utf8'));
    }
    await client.query(`INSERT INTO "AdminUser" (id,name,email,"passwordHash",active,"mustChangePassword","updatedAt") VALUES ('90000000-0000-4000-8000-000000000001','Seed preservation fixture','seed-test@example.invalid','unusable-fixture-hash',true,true,now())`);
    const adminBefore = (await client.query('SELECT row_to_json(a) AS data FROM "AdminUser" a ORDER BY id')).rows;
    const seed = () => {
      const result = spawnSync(process.execPath, ['scripts/h2-seed.mjs'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, H2_SEED_OWNED: '1', H2_SEED_DATABASE_URL: urlText, CATALOG_IMAGE_DIRECTORY: directory },
      });
      assert.equal(result.status, 0, result.stderr);
    };
    seed();
    const products = (await client.query('SELECT id,description FROM "Product" ORDER BY id')).rows;
    assert.equal(products.length, 6);
    assert(products.some((row) => row.description.length > 500));
    const images = (await client.query('SELECT * FROM "ProductImage" ORDER BY "productId", "order"')).rows;
    assert(images.length >= 2);
    assert.equal(images.filter((row) => row.isPrimary).length, 1);
    assert.equal(images[0].productId, images[1].productId);
    assert((await client.query('SELECT count(*)::int AS count FROM "Product" p WHERE NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId"=p.id)')).rows[0].count > 0);
    for (const image of images) assert.equal((await readFile(join(directory, image.storageKey))).length, image.bytes);
    await client.query('UPDATE "ProductPresentation" SET "amountMinor"=123456789 WHERE id=(SELECT id FROM "ProductPresentation" ORDER BY id LIMIT 1)');
    await client.query('UPDATE "StockBalance" SET "availableQuantity"=57 WHERE "presentationId"=(SELECT "presentationId" FROM "StockBalance" ORDER BY "presentationId" LIMIT 1)');
    const snapshot = async () => JSON.stringify(await Promise.all(['Category', 'Product', 'ProductPresentation', 'ProductImage', 'StockBalance', 'AdminUser', 'AuthSession'].map(async (table) => {
      const rows = await client.query(`SELECT row_to_json(r) AS data FROM "${table}" r ORDER BY row_to_json(r)::text`);
      return rows.rows;
    })));
    const before = await snapshot();
    const filesBefore = (await readdir(directory)).sort();
    seed();
    assert.equal(await snapshot(), before);
    assert.deepEqual((await readdir(directory)).sort(), filesBefore);
    assert.deepEqual((await client.query('SELECT row_to_json(a) AS data FROM "AdminUser" a ORDER BY id')).rows, adminBefore);
  } finally {
    await client.end();
    await rm(directory, { recursive: true, force: true });
  }
});
