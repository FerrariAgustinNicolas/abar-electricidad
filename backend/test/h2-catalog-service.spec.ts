import { CatalogService } from '../src/catalog/catalog.service';
import { AdminUsersRouteException, getAdminUsersErrorMetadata } from '../src/auth/admin-users.service';

const presentation = (id: string, unit: string, amount: bigint, quantity: number, threshold = 2, isDefault = false) => ({
  id, unit, amountMinor: amount, rollLengthMeters: unit === 'ROLL' ? 100 : null, lowStockThreshold: threshold,
  active: true, isDefault, version: 1, balance: { availableQuantity: quantity, version: 1 },
});
const product = (id: string, presentations: ReturnType<typeof presentation>[]) => ({
  id, name: id, slug: id, brand: null, categoryId: 'category-id', sku: null, shortDescription: '', description: '',
  attributes: [], active: true, featured: false, version: 1, createdAt: new Date(0), updatedAt: new Date(0),
  category: { id: 'category-id', name: 'Cables', slug: 'cables' }, images: [], presentations,
});

describe('H2 catalog presentation matching', () => {
  it('matches price and availability on one presentation, selects a stable display price, and hides quantities', async () => {
    const rows = [
      product('default-is-out', [presentation('unit', 'UNIT', 500n, 0, 0, true), presentation('meter', 'METER', 100n, 4)]),
      product('roll-is-low', [presentation('meter2', 'METER', 200n, 10, 2, true), presentation('roll2', 'ROLL', 900n, 1, 2)]),
      product('unit-wins-tie', [presentation('meter3', 'METER', 700n, 1), presentation('unit3', 'UNIT', 700n, 1)]),
    ];
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(2) },
    } as any;
    const service = new CatalogService(prisma, {} as any, {} as any);
    const result = await service.publicProducts({ availability: 'LOW_STOCK', minPriceMinor: '800', page: '1' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('roll-is-low');
    expect(result.items[0]!.displayPresentationId).toBe('roll2');
    expect(result.items[0]!.presentations[1]!.availability).toBe('LOW_STOCK');
    expect(Object.keys(result.items[0]!)).toEqual(['id', 'slug', 'name', 'brand', 'category', 'primaryImage', 'defaultPresentationId', 'displayPresentationId', 'presentations']);
    expect(Object.keys(result.items[0]!.category)).toEqual(['id', 'name', 'slug', 'description', 'order']);
    expect(Object.keys(result.items[0]!.presentations[0]!)).toEqual(['id', 'unit', 'rollLengthMeters', 'price', 'availability', 'sellable']);
    expect(JSON.stringify(result)).not.toContain('availableQuantity');
    expect(JSON.stringify(result)).not.toContain('stockVersion');
    const tie = await service.publicProducts({ availability: 'LOW_STOCK', minPriceMinor: '700', maxPriceMinor: '700' });
    expect(tie.items[0]!.id).toBe('unit-wins-tie');
    expect(tie.items[0]!.displayPresentationId).toBe('unit3');
  });

  it('rechecks H1 authorization before taking the category row lock in a mutation transaction', async () => {
    const order: string[] = [];
    const category = { id: 'category-id', version: 3, active: true, name: 'Cables', slug: 'cables', description: '', order: 1 };
    const tx = {
      $queryRaw: jest.fn(async () => { order.push('lock'); return [{ id: category.id }]; }),
      product: { count: jest.fn(async () => 0) },
      category: { findUnique: jest.fn(async () => category), update: jest.fn(async () => category) },
    };
    const prisma = { $transaction: jest.fn(async (work: (tx: any) => unknown) => work(tx)) } as any;
    const service = new CatalogService(prisma, {} as any, {} as any);
    const auth = { recheck: jest.fn(async () => { order.push('auth'); }) } as any;
    await service.patchCategory(auth, category.id, { name: 'Cableado', slug: 'cables', description: '', active: true, order: 1, expectedVersion: 3 });
    expect(order).toEqual(['auth', 'lock']);
  });

  it('filters low-stock candidates before applying the home section limit', async () => {
    const rows = Array.from({ length: 13 }, (_, index) => product(`home-${index}`, [
      presentation(`p-${index}`, 'UNIT', 100n, index === 12 ? 1 : 50, 1, true),
    ]));
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValueOnce([]).mockImplementationOnce(async (query: { take?: number }) =>
        rows.slice(0, query.take ?? rows.length)) },
    } as any;
    const service = new CatalogService(prisma, {} as any, {} as any);
    const result = await service.home();
    expect(result.lowStockProducts.map((item) => item?.id)).toEqual(['home-12']);
  });

  it('derives category order from the frozen request array position', async () => {
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    const updates: { id: string; order: number }[] = [];
    const tx = {
      $executeRaw: jest.fn(async () => 0),
      $queryRaw: jest.fn(async () => ids.map((id) => ({ id, version: 1 }))),
      category: {
        update: jest.fn(async ({ where, data }: any) => { updates.push({ id: where.id, order: data.order }); return { ...where, ...data }; }),
        findMany: jest.fn(async () => []),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (tx: any) => unknown) => work(tx)) } as any;
    const service = new CatalogService(prisma, {} as any, {} as any);
    await service.reorderCategories({ recheck: jest.fn() } as any, {
      items: [{ id: ids[1], expectedVersion: 1 }, { id: ids[0], expectedVersion: 1 }],
    });
    expect(updates).toEqual([{ id: ids[1], order: 0 }, { id: ids[0], order: 1 }]);
  });

  it('rechecks H1 authorization after every administrative catalog read', async () => {
    const revoked = new AdminUsersRouteException('PASSWORD_CHANGE_REQUIRED');
    const auth = { recheck: jest.fn(async () => { throw revoked; }) } as any;
    const tx = {
      category: { findMany: jest.fn(async () => []) },
      product: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), findUnique: jest.fn(async () => null) },
      productImage: { findFirst: jest.fn(async () => ({ storageKey: '00000000-0000-4000-8000-000000000001.png' })) },
    };
    const prisma = { ...tx, $transaction: jest.fn(async (work: (tx: any) => unknown) => work(tx)) } as any;
    const storage = { read: jest.fn(async () => Buffer.from('image')) } as any;
    const service = new CatalogService(prisma, {} as any, storage);
    await expect(service.adminCategories(auth, {})).rejects.toBe(revoked);
    await expect(service.adminProducts(auth, {})).rejects.toBe(revoked);
    await expect(service.adminProduct(auth, '00000000-0000-4000-8000-000000000001')).rejects.toBe(revoked);
    await expect((service.readImage as any)('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', true, auth)).rejects.toBe(revoked);
    expect(auth.recheck).toHaveBeenCalledTimes(4);
    expect(getAdminUsersErrorMetadata(revoked)).toEqual({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('does not compensate away a committed image when response readback fails', async () => {
    const product = { id: '00000000-0000-4000-8000-000000000001', version: 1, images: [], presentations: [], category: {}, createdAt: new Date(0), updatedAt: new Date(0) };
    const tx = {
      $queryRaw: jest.fn(async () => [{ locked: 1 }]),
      product: { findUnique: jest.fn(async () => product), update: jest.fn(async () => product) },
      productImage: { updateMany: jest.fn(async () => ({ count: 0 })), create: jest.fn(async () => ({})) },
    };
    const readbackError = new Error('readback failed after commit');
    const prisma = {
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work(tx)),
      product: { findUnique: jest.fn(async () => { throw readbackError; }) },
    } as any;
    const storage = {
      put: jest.fn(async () => ({ key: '00000000-0000-4000-8000-000000000002.png', bytes: 5, width: 1, height: 1, contentType: 'image/png' })),
      remove: jest.fn(async () => undefined),
    } as any;
    const service = new CatalogService(prisma, {} as any, storage);
    const auth = { recheck: jest.fn(async () => undefined) } as any;
    await expect(service.uploadImage(auth, product.id, { alt: 'Test', order: 0, isPrimary: true, expectedVersion: 1 }, Buffer.alloc(5))).rejects.toBe(readbackError);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it.each([true, false])('preserves published bytes after an ambiguous commit (metadata persisted: %s)', async (persisted) => {
    const productId = '00000000-0000-4000-8000-000000000001';
    const key = '00000000-0000-4000-8000-000000000002.png';
    const bytes = Buffer.from('published PNG fixture');
    const files = new Map<string, Buffer>();
    let image: { storageKey: string } | undefined;
    const tx = {
      $queryRaw: jest.fn(async () => [{ locked: 1 }]),
      product: { findUnique: jest.fn(async () => ({ id: productId, version: 1, images: [] })), update: jest.fn() },
      productImage: {
        updateMany: jest.fn(),
        create: jest.fn(async () => { image = { storageKey: key }; return image; }),
      },
    };
    const commitError = new Error('Commit acknowledgement was lost');
    const prisma = {
      $transaction: jest.fn(async (work: (client: any) => unknown) => {
        await work(tx);
        if (!persisted) image = undefined;
        throw commitError;
      }),
      productImage: { findFirst: jest.fn(async () => image) },
    } as any;
    const storage = {
      put: jest.fn(async () => { files.set(key, bytes); return { key, bytes: bytes.length, width: 1, height: 1, contentType: 'image/png' }; }),
      remove: jest.fn(async (name: string) => { files.delete(name); }),
      read: jest.fn(async (name: string) => {
        const value = files.get(name);
        if (!value) throw new Error('Missing image');
        return value;
      }),
    } as any;
    const service = new CatalogService(prisma, {} as any, storage);
    await expect(service.uploadImage({ recheck: jest.fn() } as any, productId,
      { alt: 'Ambiguous commit', order: 0, isPrimary: true, expectedVersion: 1 }, bytes)).rejects.toBe(commitError);
    expect(tx.productImage.create).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(files.get(key)).toEqual(bytes);
    if (persisted) {
      await expect(service.readImage('visible-product', 'image-id', false)).resolves.toEqual({ bytes, contentType: 'image/png' });
    } else {
      expect(image).toBeUndefined(); // Unreferenced bytes remain for coordinated orphan cleanup.
    }
  });

});
