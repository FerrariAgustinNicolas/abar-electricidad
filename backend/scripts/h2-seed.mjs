import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { FileCatalogImageStorage } from '../dist/catalog/image-storage.js';
import { lockCatalogImages } from '../dist/catalog/image-coordination.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

function fixtureConnection() {
  if (process.env.H2_SEED_OWNED !== '1' || !process.env.H2_SEED_DATABASE_URL) {
    throw new Error('Refusing seed: set H2_SEED_OWNED=1 and H2_SEED_DATABASE_URL for an owned local fixture.');
  }
  if (!process.env.CATALOG_IMAGE_DIRECTORY || !isAbsolute(process.env.CATALOG_IMAGE_DIRECTORY)) {
    throw new Error('Refusing seed: an explicit absolute fixture image directory is required.');
  }
  const url = new URL(process.env.H2_SEED_DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !['/h2_seed', '/h2_catalog'].includes(url.pathname)) {
    throw new Error('Refusing seed: only the explicit loopback h2_seed or h2_catalog database is accepted.');
  }
  return url.toString();
}

const categories = [
  ['10000000-0000-4000-8000-000000000001', 'Cables', 'cables', true, 10],
  ['10000000-0000-4000-8000-000000000002', 'Iluminación', 'iluminacion', true, 20],
  ['10000000-0000-4000-8000-000000000003', 'Térmicas', 'termicas', true, 30],
  ['10000000-0000-4000-8000-000000000004', 'Tomas', 'tomas', true, 40],
  ['10000000-0000-4000-8000-000000000005', 'Tableros', 'tableros', true, 50],
  ['10000000-0000-4000-8000-000000000006', 'Herramientas', 'herramientas', true, 60],
  ['10000000-0000-4000-8000-000000000007', 'Archivo de demostración', 'archivo-demo', false, 70],
  ['10000000-0000-4000-8000-000000000008', 'Categoría vacía', 'categoria-vacia', true, 80],
];
const products = [
  { id: '20000000-0000-4000-8000-000000000001', categoryId: categories[0][0], name: 'Cable demostración 2.5 mm', slug: 'cable-demo-25', brand: 'ABAR Demo', sku: 'DEMO-CAB-25', featured: true,
    presentations: [{ unit: 'METER', amountMinor: 125000n, quantity: 35, threshold: 8, isDefault: true }, { unit: 'ROLL', rollLengthMeters: 80, amountMinor: 8200000n, quantity: 2, threshold: 1, isDefault: false }] },
  { id: '20000000-0000-4000-8000-000000000002', categoryId: categories[1][0], name: 'Lámpara ficticia LED', slug: 'lampara-ficticia-led', brand: 'ABAR Demo', sku: null, featured: true,
    presentations: [{ unit: 'UNIT', amountMinor: 740000n, quantity: 0, threshold: 2, isDefault: true }] },
  { id: '20000000-0000-4000-8000-000000000003', categoryId: categories[0][0], name: 'Cable de prueba 1.5 mm', slug: 'cable-prueba-15', brand: null, sku: 'DEMO-CAB-15', featured: false,
    presentations: [{ unit: 'METER', amountMinor: 81000n, quantity: 8, threshold: 8, isDefault: true }, { unit: 'ROLL', rollLengthMeters: 50, amountMinor: 3600000n, quantity: 1, threshold: 0, isDefault: false }] },
  { id: '20000000-0000-4000-8000-000000000004', categoryId: categories[3][0], name: 'Toma ficticia con stock', slug: 'toma-ficticia-stock', brand: 'ABAR Demo', sku: 'DEMO-TOM-01', featured: false,
    presentations: [{ unit: 'UNIT', amountMinor: 950000n, quantity: 12, threshold: 3, isDefault: true }] },
  { id: '20000000-0000-4000-8000-000000000005', categoryId: categories[3][0], name: 'Toma ficticia en mínimo', slug: 'toma-ficticia-minimo', brand: 'ABAR Demo', sku: 'DEMO-TOM-02', featured: false,
    presentations: [{ unit: 'UNIT', amountMinor: 510000n, quantity: 2, threshold: 2, isDefault: true }] },
  { id: '20000000-0000-4000-8000-000000000006', categoryId: categories[5][0], name: 'Artículo oculto ficticio', slug: 'articulo-oculto-demo', brand: null, sku: null, featured: false, active: false,
    presentations: [{ unit: 'UNIT', amountMinor: 100000n, quantity: 0, threshold: 1, isDefault: true }] },
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: fixtureConnection() }) });
try {
  for (const [id, name, slug, active, order] of categories) {
    await prisma.category.upsert({ where: { slug }, update: {}, create: { id, name, slug, active, order, description: 'Dato ficticio de demostración.' } });
  }
  const storage = new FileCatalogImageStorage(process.env.CATALOG_IMAGE_DIRECTORY);
  for (const item of products) {
    const published = [];
    let committed = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Serialize fixture gallery publication with uploads and orphan cleanup.
        await lockCatalogImages(tx);
        if (await tx.product.findUnique({ where: { slug: item.slug }, select: { id: true } })) return;
        if (item.id === products[0].id) {
          published.push(await storage.put(await readFile(new URL('../resources/catalog/demo-cable-red.png', import.meta.url))));
          published.push(await storage.put(await readFile(new URL('../resources/catalog/demo-cable-blue.png', import.meta.url))));
        }
        const longDescription = item.id === products[0].id
          ? Array.from({ length: 12 }, (_, index) => `Sección ficticia ${index + 1}: cable de demostración para comprobar la lectura de contenido extenso, sus características descriptivas y la selección independiente de metros y rollos cerrados.`).join('\n\n')
          : 'Contenido de demostración; no representa un producto confirmado.';
        await tx.product.create({ data: {
          id: item.id, categoryId: item.categoryId, name: item.name, slug: item.slug, brand: item.brand, sku: item.sku,
          shortDescription: 'Artículo ficticio para pruebas locales.', description: longDescription,
          active: item.active ?? true, featured: item.featured, attributes: [{ key: 'Origen', value: 'Ficticio' }],
          presentations: { create: item.presentations.map(({ quantity, threshold, ...presentation }) => ({
            ...presentation, lowStockThreshold: threshold, active: true,
            balance: { create: { availableQuantity: quantity } },
          })) },
          images: { create: published.map((image, order) => ({
            storageKey: image.key, contentType: image.contentType, bytes: image.bytes,
            width: image.width, height: image.height, alt: `Imagen ficticia de demostración ${order + 1}`,
            order, isPrimary: order === 0,
          })) },
        } });
      });
      committed = true;
    } finally {
      if (!committed) for (const image of published) await storage.remove(image.key).catch(() => undefined);
    }
  }
  process.stdout.write(`Seeded ${categories.length} categories and ${products.length} fictional products; existing records were left untouched.\n`);
} finally {
  await prisma.$disconnect();
}
