import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { lockCatalogImages } from '../dist/catalog/image-coordination.js';

if (process.env.H2_IMAGE_CLEANUP_OWNED !== '1' || !process.env.H2_IMAGE_CLEANUP_DATABASE_URL || !process.env.CATALOG_IMAGE_DIRECTORY) {
  throw new Error('Refusing cleanup: explicit owned database, image directory, and H2_IMAGE_CLEANUP_OWNED=1 are required.');
}
const url = new URL(process.env.H2_IMAGE_CLEANUP_DATABASE_URL);
if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !['/h2_seed', '/h2_catalog'].includes(url.pathname)) {
  throw new Error('Refusing cleanup: only the explicit loopback h2_seed or h2_catalog database is accepted.');
}
const directory = resolve(process.env.CATALOG_IMAGE_DIRECTORY);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
try {
  const removed = await prisma.$transaction(async (tx) => {
    await lockCatalogImages(tx);
    const [rows, files] = await Promise.all([
      tx.productImage.findMany({ select: { storageKey: true } }),
      readdir(directory).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error)),
    ]);
    const live = new Set(rows.map((row) => row.storageKey));
    const orphaned = files.filter((name) => /^[0-9a-f-]{36}\.png$/i.test(name) && !live.has(name)).slice(0, 100);
    for (const name of orphaned) await rm(resolve(directory, name), { force: true });
    return orphaned.length;
  });
  process.stdout.write(`Removed ${removed} inaccessible orphan image(s); cleanup is capped at 100 files per run.\n`);
} finally { await prisma.$disconnect(); }
