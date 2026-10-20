import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PresentationUnit } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from '../auth/admin-users.service';
import { CatalogException } from '../catalog-shared/catalog-error';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { CATALOG_IMAGE_STORAGE, CatalogImageStorage } from './image-storage';
import { lockCatalogImages } from './image-coordination';

const includeProduct = {
  category: true, images: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
  presentations: { include: { balance: true }, orderBy: [{ unit: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;
type Query = Readonly<Record<string, unknown>>;
type Authorization = Awaited<ReturnType<AdminUsersService['authorizeCatalog']>>;
type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof includeProduct }>;
const availability = (quantity: number, threshold: number): 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' =>
  quantity <= 0 ? 'OUT_OF_STOCK' : quantity <= threshold ? 'LOW_STOCK' : 'AVAILABLE';
const unitOrder: Record<string, number> = { UNIT: 0, METER: 1, ROLL: 2 };
const money = (amountMinor: bigint) => ({ amountMinor: amountMinor.toString(), currency: 'ARS' as const });
const page = (query: Query) => {
  const number = (key: string, fallback: number, max: number) => {
    const value = query[key] === undefined ? fallback : Number(query[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new CatalogException(400, 'VALIDATION_ERROR');
    return value;
  };
  const current = number('page', 1, 2147483647); const pageSize = number('pageSize', 20, 100);
  if ((current - 1) * pageSize > 2147483647) throw new CatalogException(400, 'VALIDATION_ERROR');
  return { page: current, pageSize, skip: (current - 1) * pageSize };
};
const search = (query: Query) => {
  if (query.q === undefined || query.q === '') return undefined;
  if (typeof query.q !== 'string' || [...query.q].length > 120) throw new CatalogException(400, 'VALIDATION_ERROR');
  const contains = { contains: query.q, mode: 'insensitive' as const };
  return { OR: [
    { name: contains }, { brand: contains }, { sku: contains }, { shortDescription: contains }, { description: contains },
  ] };
};
function matchesSearch(product: { name: string; brand: string | null; sku: string | null; shortDescription: string; description: string; attributes: unknown }, query: Query) {
  if (!query.q) return true;
  if (typeof query.q !== 'string' || [...query.q].length > 120) throw new CatalogException(400, 'VALIDATION_ERROR');
  const needle = (query.q as string).normalize('NFC').toLocaleLowerCase('es-AR');
  const values = [product.name, product.brand ?? '', product.sku ?? '', product.shortDescription, product.description];
  if (values.some((value) => value.normalize('NFC').toLocaleLowerCase('es-AR').includes(needle))) return true;
  return Array.isArray(product.attributes) && product.attributes.some((item) => item !== null && typeof item === 'object' &&
    Object.values(item).some((value) => typeof value === 'string' && value.normalize('NFC').toLocaleLowerCase('es-AR').includes(needle)));
}
const images = (rows: ProductWithRelations['images'], slug: string) => rows.map((image) => ({
  id: image.id, url: `/api/v1/public/products/${encodeURIComponent(slug)}/images/${image.id}`,
  alt: image.alt, order: image.order, isPrimary: image.isPrimary,
}));
function selectedPresentations(product: ProductWithRelations, query: Query, publicOnly: boolean) {
  let values = product.presentations.filter((item) => item.active || !publicOnly);
  const unit = query.unit;
  if (unit !== undefined) {
    if (typeof unit !== 'string' || !Object.values(PresentationUnit).includes(unit as PresentationUnit)) throw new CatalogException(400, 'VALIDATION_ERROR');
    values = values.filter((item) => item.unit === unit);
  }
  const availabilityFilter = query.availability;
  if (availabilityFilter !== undefined) {
    if (typeof availabilityFilter !== 'string' || !['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(availabilityFilter)) throw new CatalogException(400, 'VALIDATION_ERROR');
    values = values.filter((item) => availability(item.balance?.availableQuantity ?? 0, item.lowStockThreshold) === availabilityFilter);
  }
  for (const key of ['minPriceMinor', 'maxPriceMinor']) if (query[key] !== undefined &&
    (typeof query[key] !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(query[key] as string) || BigInt(query[key] as string) > 9223372036854775807n)) {
    throw new CatalogException(400, 'VALIDATION_ERROR');
  }
  if (query.minPriceMinor !== undefined) values = values.filter((item) => item.amountMinor >= BigInt(query.minPriceMinor as string));
  if (query.maxPriceMinor !== undefined) values = values.filter((item) => item.amountMinor <= BigInt(query.maxPriceMinor as string));
  const display = values.find((item) => item.active && item.isDefault) ?? [...values].sort((a, b) =>
    a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : unitOrder[a.unit] - unitOrder[b.unit] || a.id.localeCompare(b.id))[0];
  return { values, display };
}
function validatePresentationFilters(query: Query) {
  if (query.unit !== undefined && (typeof query.unit !== 'string' || !Object.values(PresentationUnit).includes(query.unit as PresentationUnit))) {
    throw new CatalogException(400, 'VALIDATION_ERROR');
  }
  if (query.availability !== undefined && (typeof query.availability !== 'string' || !['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(query.availability))) {
    throw new CatalogException(400, 'VALIDATION_ERROR');
  }
  const parsed: bigint[] = [];
  for (const key of ['minPriceMinor', 'maxPriceMinor']) if (query[key] !== undefined) {
    if (typeof query[key] !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(query[key] as string) || BigInt(query[key] as string) > 9223372036854775807n) {
      throw new CatalogException(400, 'VALIDATION_ERROR');
    }
    parsed.push(BigInt(query[key] as string));
  }
  if (parsed.length === 2 && parsed[0] > parsed[1]) throw new CatalogException(400, 'VALIDATION_ERROR');
}
function presentView(item: ProductWithRelations['presentations'][number], exposeQuantity: boolean) {
  const quantity = item.balance?.availableQuantity ?? 0;
  return {
    id: item.id, unit: item.unit, rollLengthMeters: item.rollLengthMeters,
    price: money(item.amountMinor), availability: availability(quantity, item.lowStockThreshold), sellable: item.active && quantity > 0,
    ...(exposeQuantity ? { lowStockThreshold: item.lowStockThreshold, active: item.active, isDefault: item.isDefault, version: item.version,
      availableQuantity: quantity, stockVersion: item.balance?.version ?? 1 } : {}),
  };
}
function publicSummary(product: ProductWithRelations, query: Query = {}) {
  const { display } = selectedPresentations(product, query, true);
  if (!display) return undefined;
  const visible = product.presentations.filter((item) => item.active).map((item) => presentView(item, false));
  return {
    id: product.id, slug: product.slug, name: product.name, brand: product.brand,
    category: { id: product.category.id, name: product.category.name, slug: product.category.slug, description: product.category.description, order: product.category.order },
    primaryImage: product.images.find((image) => image.isPrimary) ? images(product.images.filter((image) => image.isPrimary), product.slug)[0] : null,
    defaultPresentationId: product.presentations.find((item) => item.active && item.isDefault)?.id ?? display.id,
    displayPresentationId: display.id,
    presentations: visible,
  };
}
function adminProduct(product: ProductWithRelations) {
  return {
    id: product.id, name: product.name, slug: product.slug, categoryId: product.categoryId, brand: product.brand, sku: product.sku,
    shortDescription: product.shortDescription, description: product.description, attributes: product.attributes,
    active: product.active, featured: product.featured, presentations: product.presentations.map((item) => presentView(item, true)),
    version: product.version, images: product.images.map((image) => ({ id: image.id,
      url: `/api/v1/admin/products/${product.id}/images/${image.id}`, alt: image.alt, order: image.order, isPrimary: image.isPrimary })),
    createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(),
  };
}
const conflict = (code: string) => { throw new CatalogException(409, code); };
const notFound = () => { throw new CatalogException(404, 'RESOURCE_NOT_FOUND'); };

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admins: AdminUsersService,
    @Inject(CATALOG_IMAGE_STORAGE) private readonly storage: CatalogImageStorage,
  ) {}

  async publicCategories() {
    const rows = await this.prisma.category.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 1000 });
    return { items: rows.map(({ id, name, slug, description, order }) => ({ id, name, slug, description, order })) };
  }

  async home() {
    const [categories, featured, lowStock] = await Promise.all([
      this.prisma.category.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 12 }),
      this.prisma.product.findMany({ where: { active: true, featured: true, category: { active: true }, presentations: { some: { active: true, balance: { availableQuantity: { gt: 0 } } } } }, include: includeProduct, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 12 }),
      this.prisma.product.findMany({ where: { active: true, category: { active: true }, presentations: { some: { active: true, balance: { availableQuantity: { gt: 0 }, presentation: { lowStockThreshold: { gt: 0 } } } } } }, include: includeProduct, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }),
    ]);
    const lowStockProducts = lowStock.filter((product) => Boolean(publicSummary(product, { availability: 'LOW_STOCK' })))
      .slice(0, 12).map((product) => publicSummary(product, { availability: 'LOW_STOCK' })).filter(Boolean);
    return {
      categories: categories.map(({ id, name, slug, description, order }) => ({ id, name, slug, description, order })),
      featuredProducts: featured.map((product) => publicSummary(product)).filter(Boolean),
      lowStockProducts,
    };
  }

  async publicProducts(query: Query) {
    validatePresentationFilters(query);
    const paging = page(query);
    const where: Prisma.ProductWhereInput = { active: true, category: { active: true }, ...(query.q ? {} : search(query)) };
    if (query.categoryId !== undefined) {
      if (typeof query.categoryId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.categoryId)) throw new CatalogException(400, 'VALIDATION_ERROR');
      where.categoryId = query.categoryId;
    }
    const sort = query.sort ?? 'name-asc';
    if (typeof sort !== 'string' || !['name-asc', 'name-desc', 'price-asc', 'price-desc'].includes(sort)) throw new CatalogException(400, 'VALIDATION_ERROR');
    const rows = await this.prisma.product.findMany({ where, include: includeProduct, orderBy: [{ name: sort === 'name-desc' ? 'desc' : 'asc' }, { id: 'asc' }] });
    const matched = rows.filter((row) => matchesSearch(row, query)).map((row) => ({ row, summary: publicSummary(row, query), selected: selectedPresentations(row, query, true) }))
      .filter((item) => item.summary && item.selected.values.length > 0);
    if (sort.startsWith('price-')) matched.sort((a, b) => {
      const left = a.selected.display?.amountMinor ?? 0n; const right = b.selected.display?.amountMinor ?? 0n;
      if (left !== right) return (left < right ? -1 : 1) * (sort === 'price-desc' ? -1 : 1);
      return a.row.id.localeCompare(b.row.id);
    });
    const items = matched.slice(paging.skip, paging.skip + paging.pageSize).map((item) => item.summary);
    return { items, pageInfo: { page: paging.page, pageSize: paging.pageSize, totalItems: matched.length, totalPages: Math.ceil(matched.length / paging.pageSize) } };
  }

  async publicProduct(slug: string) {
    const product = await this.prisma.product.findFirst({ where: { slug, active: true, category: { active: true } }, include: includeProduct });
    if (!product) return notFound();
    const summary = publicSummary(product);
    if (!summary) notFound();
    return { ...summary, shortDescription: product.shortDescription, description: product.description, attributes: product.attributes,
      images: images(product.images, product.slug), presentations: product.presentations.filter((item) => item.active).map((item) => presentView(item, false)) };
  }

  async adminCategories(auth: Authorization, query: Query) {
    const where: Prisma.CategoryWhereInput = {};
    if (query.active !== undefined) {
      if (query.active !== 'true' && query.active !== 'false') throw new CatalogException(400, 'VALIDATION_ERROR');
      where.active = query.active === 'true';
    }
    if (query.q !== undefined && (typeof query.q !== 'string' || [...query.q].length > 120)) throw new CatalogException(400, 'VALIDATION_ERROR');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.category.findMany({ where, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 1000 });
      const needle = typeof query.q === 'string' ? query.q.normalize('NFC').toLocaleLowerCase('es-AR') : '';
      const matched = query.q ? rows.filter((row) => [row.name, row.slug, row.description].some((value) =>
        value.normalize('NFC').toLocaleLowerCase('es-AR').includes(needle))) : rows;
      await auth.recheck(tx);
      return { items: matched };
    });
  }

  async createCategory(auth: Authorization, input: unknown) {
    const body = validateCatalogBody<{ name: string; slug: string; description: string; active: boolean; order: number }>('CategoryWrite', input);
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      try { return await tx.category.create({ data: body }); }
      catch (error) { if (this.unique(error, ['slug'])) conflict('SLUG_IN_USE'); throw error; }
    });
  }

  async patchCategory(auth: Authorization, id: string, input: unknown) {
    const body = validateCatalogBody<Record<string, unknown>>('CategoryPatch', input);
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.category.findUnique({ where: { id } }); if (!current) return notFound();
      if (current.version !== body.expectedVersion) conflict('VERSION_CONFLICT');
      if (body.active === false && current.active && await tx.product.count({ where: { categoryId: id, active: true } })) conflict('CATEGORY_HAS_ACTIVE_PRODUCTS');
      const { expectedVersion, ...data } = body;
      void expectedVersion;
      try { return await tx.category.update({ where: { id }, data: { ...data, version: { increment: 1 } } }); }
      catch (error) { if (this.unique(error, ['slug'])) conflict('SLUG_IN_USE'); throw error; }
    });
  }

  async reorderCategories(auth: Authorization, input: unknown) {
    const body = validateCatalogBody<{ items: { id: string; expectedVersion: number }[] }>('CategoryOrderRequest', input);
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      await tx.$executeRaw`LOCK TABLE "Category" IN SHARE ROW EXCLUSIVE MODE`;
      const rows = await tx.$queryRaw<{ id: string; version: number }[]>`SELECT id, version FROM "Category" ORDER BY id FOR UPDATE`;
      const expected = [...body.items].sort((a, b) => a.id.localeCompare(b.id));
      const actual = [...rows].sort((a, b) => a.id.localeCompare(b.id));
      if (expected.length !== actual.length || expected.some((row, i) => row.id !== actual[i].id || row.expectedVersion !== actual[i].version)) conflict('CATEGORY_SET_CHANGED');
      for (const [order, item] of body.items.entries()) await tx.category.update({ where: { id: item.id }, data: { order, version: { increment: 1 } } });
      return { items: await tx.category.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }) };
    });
  }

  async adminProducts(auth: Authorization, query: Query) {
    validatePresentationFilters(query);
    const paging = page(query);
    const where: Prisma.ProductWhereInput = { ...(query.q ? {} : search(query)) };
    if (query.categoryId !== undefined) {
      if (typeof query.categoryId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.categoryId)) throw new CatalogException(400, 'VALIDATION_ERROR');
      where.categoryId = query.categoryId;
    }
    if (query.active !== undefined) { if (query.active !== 'true' && query.active !== 'false') throw new CatalogException(400, 'VALIDATION_ERROR'); where.active = query.active === 'true'; }
    return this.prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.product.findMany({ where, include: includeProduct, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      tx.product.count({ where }),
    ]);
    const hasPresentationFilter = ['unit', 'availability', 'minPriceMinor', 'maxPriceMinor'].some((key) => query[key] !== undefined);
    const matched = rows.filter((row) => matchesSearch(row, query) && (!hasPresentationFilter || Boolean(selectedPresentations(row, query, false).display)));
    const sort = query.sort ?? 'name-asc';
    if (typeof sort !== 'string' || !['name-asc', 'name-desc', 'price-asc', 'price-desc'].includes(sort)) throw new CatalogException(400, 'VALIDATION_ERROR');
    matched.sort((left, right) => {
      if (sort.startsWith('price-')) {
        const a = selectedPresentations(left, query, false).display?.amountMinor ?? 0n;
        const b = selectedPresentations(right, query, false).display?.amountMinor ?? 0n;
        if (a !== b) return (a < b ? -1 : 1) * (sort === 'price-desc' ? -1 : 1);
      } else {
        const name = left.name.localeCompare(right.name, 'es-AR');
        if (name !== 0) return name * (sort === 'name-desc' ? -1 : 1);
      }
      return left.id.localeCompare(right.id);
    });
    const pageRows = matched.slice(paging.skip, paging.skip + paging.pageSize);
    const totalItems = query.q || hasPresentationFilter ? matched.length : total;
    const result = { items: pageRows.map(adminProduct), pageInfo: { page: paging.page, pageSize: paging.pageSize, totalItems, totalPages: Math.ceil(totalItems / paging.pageSize) } };
    await auth.recheck(tx);
    return result;
    });
  }

  async adminProduct(auth: Authorization, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id }, include: includeProduct });
      const result = product ? adminProduct(product) : undefined;
      await auth.recheck(tx);
      if (!result) return notFound();
      return result;
    });
  }

  async createProduct(auth: Authorization, input: unknown) {
    const body = validateCatalogBody<Record<string, any>>('ProductWrite', input);
    this.validatePresentations(body.presentations);
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${body.categoryId}::uuid FOR SHARE`;
      const category = await tx.category.findUnique({ where: { id: body.categoryId } });
      if (!category || !category.active) throw new CatalogException(400, 'INVALID_PRESENTATION');
      try {
        const product = await tx.product.create({ data: {
          name: body.name, slug: body.slug, categoryId: body.categoryId, brand: body.brand, sku: body.sku,
          shortDescription: body.shortDescription, description: body.description, attributes: body.attributes, active: body.active, featured: body.featured,
          presentations: { create: body.presentations.map((item: any) => ({ unit: item.unit, rollLengthMeters: item.rollLengthMeters ?? null,
            amountMinor: BigInt(item.price.amountMinor), lowStockThreshold: item.lowStockThreshold, active: item.active, isDefault: item.isDefault,
            balance: { create: { availableQuantity: 0 } } })) },
        }, include: includeProduct });
        return adminProduct(product);
      } catch (error) { this.mapProductUnique(error); throw error; }
    });
  }

  async patchProduct(auth: Authorization, id: string, input: unknown) {
    const body = validateCatalogBody<Record<string, any>>('ProductPatch', input);
    this.validatePresentations(body.presentations);
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ProductPresentation" WHERE "productId" = ${id}::uuid ORDER BY id FOR UPDATE`;
      const current = await tx.product.findUnique({ where: { id }, include: { presentations: { include: { balance: true, entries: { take: 1 } } } } });
      if (!current) return notFound();
      if (current.version !== body.expectedVersion) conflict('VERSION_CONFLICT');
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${body.categoryId}::uuid FOR SHARE`;
      const category = await tx.category.findUnique({ where: { id: body.categoryId } });
      if (!category || !category.active) throw new CatalogException(400, 'INVALID_PRESENTATION');
      const sent = new Set<string>();
      for (const next of body.presentations) {
        if (!next.id) continue;
        if (sent.has(next.id)) throw new CatalogException(400, 'INVALID_PRESENTATION'); sent.add(next.id);
        const previous = current.presentations.find((item) => item.id === next.id);
        if (!previous) throw new CatalogException(400, 'INVALID_PRESENTATION');
        if (previous.entries.length && (previous.unit !== next.unit || previous.rollLengthMeters !== (next.rollLengthMeters ?? null))) conflict('PRESENTATION_IMMUTABLE');
      }
      const removed = current.presentations.filter((item) => !sent.has(item.id));
      if (removed.length) throw new CatalogException(400, 'INVALID_PRESENTATION');
      try {
        await tx.productPresentation.updateMany({ where: { productId: id, isDefault: true }, data: { isDefault: false } });
        for (const next of body.presentations) {
          const data = { unit: next.unit, rollLengthMeters: next.rollLengthMeters ?? null, amountMinor: BigInt(next.price.amountMinor),
            lowStockThreshold: next.lowStockThreshold, active: next.active, isDefault: next.isDefault };
          if (next.id) await tx.productPresentation.update({ where: { id: next.id }, data: { ...data, version: { increment: 1 } } });
          else await tx.productPresentation.create({ data: { ...data, productId: id, version: 1, balance: { create: { availableQuantity: 0 } } } });
        }
        const { expectedVersion, presentations, ...productData } = body;
        void expectedVersion; void presentations;
        const updated = await tx.product.update({ where: { id }, data: { ...productData, version: { increment: 1 } }, include: includeProduct });
        return adminProduct(updated);
      } catch (error) { this.mapProductUnique(error); throw error; }
    });
  }

  async uploadImage(auth: Authorization, id: string, fields: { alt: string; order: number; isPrimary: boolean; expectedVersion: number }, bytes: Buffer) {
    let stored: Awaited<ReturnType<CatalogImageStorage['put']>> | undefined;
    let metadataCommitted = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await auth.recheck(tx);
        await lockCatalogImages(tx);
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id}::uuid FOR UPDATE`;
        const product = await tx.product.findUnique({ where: { id }, include: { images: true } }); if (!product) return notFound();
        if (product.version !== fields.expectedVersion) conflict('VERSION_CONFLICT');
        if (product.images.length >= 8) conflict('IMAGE_LIMIT_REACHED');
        if (fields.order >= 8 || product.images.some((item) => item.order === fields.order)) conflict('VERSION_CONFLICT');
        const isPrimary = fields.isPrimary || product.images.length === 0 || !product.images.some((item) => item.isPrimary);
        try { stored = await this.storage.put(bytes); }
        catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (code === 'IMAGE_TOO_LARGE') throw new CatalogException(413, 'IMAGE_TOO_LARGE');
          if (code === 'UNSUPPORTED_IMAGE_TYPE') throw new CatalogException(415, 'UNSUPPORTED_IMAGE_TYPE');
          if (code === 'INVALID_IMAGE') throw new CatalogException(400, 'INVALID_IMAGE');
          throw new CatalogException(503, 'SERVICE_UNAVAILABLE');
        }
        if (isPrimary) await tx.productImage.updateMany({ where: { productId: id }, data: { isPrimary: false } });
        await tx.productImage.create({ data: { productId: id, storageKey: stored.key, contentType: stored.contentType,
          bytes: stored.bytes, width: stored.width, height: stored.height, alt: fields.alt, order: fields.order, isPrimary } });
        await tx.product.update({ where: { id }, data: { version: { increment: 1 } } });
      });
      metadataCommitted = true;
      return adminProduct(await this.adminViewAfterMutation(id));
    } catch (error) {
      if (stored && !metadataCommitted) await this.storage.remove(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async patchImage(auth: Authorization, id: string, imageId: string, input: unknown) {
    const body = validateCatalogBody<Record<string, any>>('ImagePatch', input);
    await this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx); await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include: { images: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } } });
      if (!product) return notFound(); if (product.version !== body.expectedVersion) conflict('VERSION_CONFLICT');
      const image = product.images.find((item) => item.id === imageId); if (!image) return notFound();
      if (body.order !== undefined) {
        const displaced = product.images.find((item) => item.id !== imageId && item.order === body.order);
        if (displaced) await tx.productImage.update({ where: { id: displaced.id }, data: { order: image.order } });
      }
      if (body.isPrimary === true) await tx.productImage.updateMany({ where: { productId: id }, data: { isPrimary: false } });
      const { expectedVersion, ...imageData } = body;
      void expectedVersion;
      await tx.productImage.update({ where: { id: imageId }, data: imageData });
      if (body.isPrimary === false && image.isPrimary) {
        const replacement = product.images.find((item) => item.id !== imageId);
        if (replacement) await tx.productImage.update({ where: { id: replacement.id }, data: { isPrimary: true } });
        else await tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
      }
      await tx.product.update({ where: { id }, data: { version: { increment: 1 } } });
      return;
    });
    return adminProduct(await this.adminViewAfterMutation(id));
  }

  async deleteImage(auth: Authorization, id: string, imageId: string, expectedVersion: number) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx); await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include: { images: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } } });
      if (!product) return notFound(); if (product.version !== expectedVersion) conflict('VERSION_CONFLICT');
      const image = product.images.find((item) => item.id === imageId); if (!image) return notFound();
      const remaining = product.images.filter((item) => item.id !== imageId);
      await tx.productImage.delete({ where: { id: imageId } });
      if (remaining.length) {
        const primary = remaining.find((item) => item.isPrimary) ?? remaining[0];
        await tx.productImage.updateMany({ where: { productId: id }, data: { isPrimary: false } });
        await tx.productImage.update({ where: { id: primary.id }, data: { isPrimary: true } });
      }
      await tx.product.update({ where: { id }, data: { version: { increment: 1 } } });
      return { key: image.storageKey, product };
    });
    await this.storage.remove(deleted.key).catch(() => undefined);
    return adminProduct(await this.adminViewAfterMutation(id));
  }

  async readImage(productRef: string, imageId: string, admin: boolean, auth?: Authorization) {
    const where = { id: imageId, product: {
      ...(admin ? { id: productRef } : { slug: productRef, active: true, category: { active: true } }),
    } };
    if (admin) {
      if (!auth) throw new CatalogException(503, 'SERVICE_UNAVAILABLE');
      return this.prisma.$transaction(async (tx) => {
        const image = await tx.productImage.findFirst({ where });
        let bytes: Buffer | undefined; let storageFailed = false;
        if (image) try { bytes = await this.storage.read(image.storageKey); } catch { storageFailed = true; }
        await auth.recheck(tx);
        if (!image) return notFound();
        if (storageFailed || !bytes) throw new CatalogException(503, 'SERVICE_UNAVAILABLE');
        return { bytes, contentType: 'image/png' as const };
      });
    }
    const image = await this.prisma.productImage.findFirst({ where });
    if (!image) return notFound();
    try { return { bytes: await this.storage.read(image.storageKey), contentType: 'image/png' as const }; }
    catch { throw new CatalogException(503, 'SERVICE_UNAVAILABLE'); }
  }

  private async adminViewAfterMutation(id: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: includeProduct });
    if (!product) return notFound(); return product;
  }
  private validatePresentations(items: any[]) {
    const units = new Set<string>(); let defaults = 0;
    for (const item of items) {
      if (units.has(item.unit)) throw new CatalogException(400, 'INVALID_PRESENTATION'); units.add(item.unit);
      if (item.isDefault && item.active) defaults++;
      if ((item.unit === 'ROLL') !== (Number.isInteger(item.rollLengthMeters) && item.rollLengthMeters > 0)) throw new CatalogException(400, 'INVALID_PRESENTATION');
      if (BigInt(item.price.amountMinor) > 9223372036854775807n) throw new CatalogException(400, 'INVALID_PRESENTATION');
    }
    if (defaults !== 1) throw new CatalogException(400, 'INVALID_PRESENTATION');
  }
  private unique(error: unknown, fields: string[]) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002' &&
      fields.some((field) => JSON.stringify('meta' in error ? error.meta : '').includes(field));
  }
  private mapProductUnique(error: unknown): void {
    if (this.unique(error, ['slug'])) conflict('SLUG_IN_USE');
    if (this.unique(error, ['sku'])) conflict('SKU_IN_USE');
  }
}
