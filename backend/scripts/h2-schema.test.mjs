import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const target = process.env.H2_TEST_DATABASE_URL;
const migrations = new URL('../prisma/migrations/', import.meta.url);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('H2 migrations preserve H1 and enforce catalog/stock integrity on owned PostgreSQL', {
  skip: !target ? 'H2_TEST_DATABASE_URL must explicitly select a new owned PostgreSQL fixture; no application DB fallback.' : false,
}, async () => {
  const url = new URL(target);
  assert.equal(process.env.H2_TEST_OWNED, '1');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/h2_schema');
  assert.equal(url.username, 'h2_runner');
  const client = new pg.Client({ connectionString: target });
  await client.connect();
  const suffix = randomUUID().replaceAll('-', '');
  const names = (await readdir(migrations)).filter((name) => /^\d+_/.test(name)).sort();
  const h1 = names.filter((name) => !name.includes('_h2_'));
  const h2 = names.filter((name) => name.includes('_h2_'));
  assert.equal(h2.length, 1);
  const executeMigrations = async (list) => {
    for (const name of list) await client.query(await readFile(new URL(`${name}/migration.sql`, migrations), 'utf8'));
  };
  const preserved = async () => {
    const rows = [];
    for (const table of ['AdminUser', 'AuthSession', 'AuthPreAuthContext', 'AdminUserAudit']) {
      rows.push((await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
    }
    return digest(rows);
  };
  try {
    // Both schemas are newly created in an explicitly owned disposable DB.
    await client.query(`CREATE SCHEMA "h2_clean_${suffix}"`);
    await client.query(`SET search_path TO "h2_clean_${suffix}"`);
    await executeMigrations([...h1, ...h2]);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM "StockBalance"')).rows[0].n, 0);
    await client.query(`CREATE SCHEMA "h2_upgrade_${suffix}"`);
    await client.query(`SET search_path TO "h2_upgrade_${suffix}"`);
    await executeMigrations(h1);
    const actor = randomUUID();
    await client.query('INSERT INTO "AdminUser" (id,name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now())', [actor, 'H1 fixture', `${actor}@example.invalid`, 'not-an-authentication-credential']);
    const before = await preserved();
    await executeMigrations(h2);
    assert.equal(await preserved(), before, 'migration must not alter H1 rows');
    const category = randomUUID(), product = randomUUID(), roll = randomUUID(), meter = randomUUID();
    await client.query('INSERT INTO "Category" (id,name,slug) VALUES ($1,$2,$3)', [category, 'Fictitious cables', 'fixture-cables']);
    await client.query('INSERT INTO "Product" (id,"categoryId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,now())', [product, category, 'Fictitious cable', 'fixture-cable']);
    await client.query('INSERT INTO "ProductPresentation" (id,"productId",unit,"rollLengthMeters","amountMinor","isDefault") VALUES ($1,$2,\'ROLL\',75,1234567890123456789,true),($3,$2,\'METER\',NULL,1500,false)', [roll, product, meter]);
    assert.equal((await client.query('SELECT "amountMinor" FROM "ProductPresentation" WHERE id=$1', [roll])).rows[0].amountMinor, '1234567890123456789');
    await client.query('INSERT INTO "StockBalance" ("presentationId","availableQuantity") VALUES ($1,3),($2,20)', [roll, meter]);
    const reject = async (sql, parameters, state) => {
      await client.query('BEGIN');
      try { await assert.rejects(client.query(sql, parameters), (error) => error.code === state); }
      finally { await client.query('ROLLBACK'); }
      assert.equal(await preserved(), before, 'rejection must not mutate H1 data');
    };
    await reject('UPDATE "StockBalance" SET "availableQuantity"=-1 WHERE "presentationId"=$1', [roll], '23514');
    await reject('UPDATE "ProductPresentation" SET "amountMinor"=-1 WHERE id=$1', [roll], '23514');
    await reject('UPDATE "ProductPresentation" SET "rollLengthMeters"=0 WHERE id=$1', [roll], '23514');
    await reject('UPDATE "ProductPresentation" SET "rollLengthMeters"=NULL WHERE id=$1', [roll], '23514');
    await reject('UPDATE "ProductPresentation" SET "rollLengthMeters"=75 WHERE id=$1', [meter], '23514');
    await reject('UPDATE "ProductPresentation" SET "isDefault"=true WHERE id=$1', [meter], '23505');
    await reject('UPDATE "ProductPresentation" SET "active"=false WHERE id=$1', [roll], '23514');
    await reject('INSERT INTO "ProductPresentation" ("productId",unit,"amountMinor") VALUES ($1,\'METER\',1)', [product], '23505');
    await reject('INSERT INTO "Category" (name,slug) VALUES (\'Duplicate\',\'fixture-cables\')', [], '23505');
    await reject('INSERT INTO "Product" ("categoryId",name,slug,"updatedAt") VALUES ($1,\'Orphan\',\'orphan\',now())', [randomUUID()], '23503');
    await reject('DELETE FROM "Product" WHERE id=$1', [product], '23503');
    const key = randomUUID();
    const insertImage = 'INSERT INTO "ProductImage" ("productId","storageKey","contentType",bytes,width,height,alt,"isPrimary") VALUES ($1,$2,\'image/png\',100,2,2,\'Fixture\',true)';
    await client.query(insertImage, [product, `${key}.png`]);
    await reject(insertImage, [product, `${randomUUID()}.png`], '23505');
    await reject('UPDATE "ProductImage" SET "storageKey"=\'../bad.png\'', [], '23514');
    await reject('UPDATE "ProductImage" SET bytes=5242881', [], '23514');
    await reject('UPDATE "ProductImage" SET width=4097', [], '23514');
    const operation = randomUUID();
    await client.query('INSERT INTO "StockOperation" (id,type,reason,"actorAdminUserId","idempotencyKey","requestHash") VALUES ($1,\'ADJUSTMENT\',\'Physical count\',$2,\'test-key\',$3)', [operation, actor, 'a'.repeat(64)]);
    await reject('INSERT INTO "StockOperation" (type,reason,"actorAdminUserId","idempotencyKey","requestHash") VALUES (\'ADJUSTMENT\',\'Retry\',$1,\'test-key\',$2)', [actor, 'a'.repeat(64)], '23505');
    await reject('INSERT INTO "StockEntry" ("operationId","presentationId",delta,"resultingQuantity",version) VALUES ($1,$2,0,3,1)', [operation, roll], '23514');
    assert.deepEqual((await client.query('SELECT "availableQuantity" FROM "StockBalance" ORDER BY "availableQuantity"')).rows.map((row) => row.availableQuantity), [3, 20]);
  } finally {
    await client.end();
    // No DROP/reset: fixture owner stops its own ephemeral tmpfs container.
  }
});
