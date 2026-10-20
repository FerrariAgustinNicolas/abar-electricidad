import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminProduct, ProductPatch, ProductWrite } from '../../core/catalog/catalog.models';
import { AdminProductFormPageComponent } from './admin-product-form-page.component';

const productId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';

function setup(reject = false) {
  const createProduct = vi.fn((input: ProductWrite) => reject
    ? throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'VERSION_CONFLICT' } }))
    : of({
      ...input, id: productId, version: 1, images: [],
      createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z',
      presentations: input.presentations.map((presentation) => ({
        ...presentation, id: '33333333-3333-4333-8333-333333333333',
        rollLengthMeters: presentation.rollLengthMeters ?? null,
        version: 1, stockVersion: 1, availableQuantity: 0,
        availability: 'OUT_OF_STOCK' as const, sellable: false,
      })),
    } satisfies AdminProduct));
  TestBed.configureTestingModule({
    imports: [AdminProductFormPageComponent],
    providers: [
      provideRouter([]),
      { provide: AuthSessionService, useValue: { expire: vi.fn(), refreshSession: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      { provide: AdminCatalogApiService, useValue: { listCategories: () => of({ items: [] }), createProduct } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AdminProductFormPageComponent);
  const component = fixture.componentInstance;
  component.form.patchValue({ name: 'Cable ficticio', slug: 'cable-ficticio', categoryId, active: false, featured: true });
  component.presentations.at(0).controls.priceAmountMinor.setValue('9007199254740993');
  return { fixture, component, createProduct, navigate };
}

describe('AdminProductFormPageComponent', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('uses boolean reactive controls and sends exact minor units without a direct stock field', async () => {
    const { component, createProduct, navigate } = setup();
    await component.save();
    expect(component.form.controls.active.value).toBe(false);
    expect(component.form.controls.featured.value).toBe(true);
    expect(createProduct).toHaveBeenCalledOnce();
    const [input] = createProduct.mock.calls[0];
    expect(input.presentations[0].price.amountMinor).toBe('9007199254740993');
    expect(input).not.toHaveProperty('availableQuantity');
    expect(input.presentations[0]).not.toHaveProperty('availableQuantity');
    expect(navigate).toHaveBeenCalledWith(['/admin/productos', productId, 'editar']);
  });

  it('preserves the reactive draft and does not navigate or replay after a version conflict', async () => {
    const { component, createProduct, navigate } = setup(true);
    component.form.markAsDirty();
    await component.save();
    expect(component.versionConflict()).toBe(true);
    expect(component.form.controls.name.value).toBe('Cable ficticio');
    expect(component.presentations.at(0).controls.priceAmountMinor.value).toBe('9007199254740993');
    expect(component.form.dirty).toBe(true);
    expect(createProduct).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rehydrates server-assigned presentation IDs into the existing edit form before the next full patch', async () => {
    const existing: AdminProduct = {
      id: productId, slug: 'cable-ficticio', name: 'Cable ficticio', brand: null, sku: null, categoryId,
      shortDescription: '', description: '', attributes: [], active: true, featured: false, version: 1,
      createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', images: [],
      presentations: [{ id: 'existing-meter', unit: 'METER', rollLengthMeters: null,
        price: { amountMinor: '9000', currency: 'ARS' }, lowStockThreshold: 0, active: true, isDefault: true,
        version: 1, stockVersion: 1, availableQuantity: 5, availability: 'AVAILABLE', sellable: true }],
    };
    const updateProduct = vi.fn((_id: string, input: ProductPatch) => of({
      ...existing, ...input, version: 2,
      presentations: input.presentations.map((row) => ({ ...row, id: row.id ?? 'server-roll-id', rollLengthMeters: row.rollLengthMeters ?? null,
        version: 1, stockVersion: 1, availableQuantity: 0, availability: 'OUT_OF_STOCK' as const, sellable: false })),
    } satisfies AdminProduct));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AuthSessionService, useValue: { expire: vi.fn(), refreshSession: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: productId }) } } },
      { provide: AdminCatalogApiService, useValue: { listCategories: () => of({ items: [] }), getProduct: () => of(existing), updateProduct } },
    ] });
    const fixture = TestBed.createComponent(AdminProductFormPageComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.addPresentation();
    component.presentations.at(1).patchValue({ unit: 'ROLL', rollLengthMeters: 75, priceAmountMinor: '12000' });
    await component.save();
    expect(component.presentations.at(1).controls.id.value).toBe('server-roll-id');
    component.form.controls.name.setValue('Cable actualizado');
    await component.save();
    expect(updateProduct).toHaveBeenCalledTimes(2);
    expect(updateProduct.mock.calls[1][1].presentations[1].id).toBe('server-roll-id');
    expect(updateProduct.mock.calls[1][1].expectedVersion).toBe(2);
  });
});

async function setupGallery() {
  const NativeURL = globalThis.URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static override createObjectURL(): string { return 'blob:gallery-test'; }
    static override revokeObjectURL(): void { /* No browser resource is allocated by this fixture. */ }
  });
  const product: AdminProduct = {
    id: productId, name: 'Gallery fixture', slug: 'gallery-fixture', categoryId, brand: null, sku: null,
    shortDescription: '', description: '', attributes: [], active: true, featured: false, version: 1,
    createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z',
    images: ['a', 'b', 'c'].map((id, order) => ({ id, url: '/fixture/' + id, alt: 'Original ' + id, order, isPrimary: order === 0 })),
    presentations: [{ id: 'unit-id', unit: 'UNIT', rollLengthMeters: null, price: { amountMinor: '100', currency: 'ARS' },
      lowStockThreshold: 0, active: true, isDefault: true, version: 1, stockVersion: 1, availableQuantity: 1, availability: 'AVAILABLE', sellable: true }],
  };
  const api = { listCategories: () => of({ items: [] }), getProduct: () => of(product), loadAdminImage: () => of(new Blob()),
    updateProductImage: vi.fn(), deleteProductImage: vi.fn(), uploadProductImage: vi.fn(), updateProduct: vi.fn() };
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: AuthSessionService, useValue: { expire: vi.fn(), refreshSession: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: productId }) } } },
    { provide: AdminCatalogApiService, useValue: api },
  ] });
  const fixture = TestBed.createComponent(AdminProductFormPageComponent);
  await fixture.whenStable();
  const header = new Uint8Array(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(header.buffer); view.setUint32(16, 1); view.setUint32(20, 1);
  const file = new File([header], 'pending.png', { type: 'image/png' });
  vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: async () => header.buffer } as Blob);
  return { fixture, component: fixture.componentInstance, api, product, file };
}

describe('Gallery draft preservation', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it.each(['primary', 'delete', 'metadata', 'upload', 'product'])('preserves unrelated drafts and pending upload after %s', async (action) => {
    const { fixture, component, api, product, file } = await setupGallery();
    component.updateImageDraft(product.images[0], 'alt', 'Pending alt');
    component.updateImageDraft(product.images[2], 'order', 5);
    component.selectImage({ target: { files: { item: () => file } } } as unknown as Event);
    component.imageAlt.set('Pending upload');
    const server = { ...product, version: 2, images: product.images.map((image) => ({ ...image })) };
    if (action === 'primary') {
      server.images.forEach((image) => { image.isPrimary = image.id === 'b'; });
      api.updateProductImage.mockReturnValue(of(server)); await component.makePrimary('b');
    } else if (action === 'delete') {
      server.images = server.images.filter((image) => image.id !== 'b');
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api.deleteProductImage.mockReturnValue(of(server)); await component.deleteImage('b');
    } else if (action === 'metadata') {
      server.images[0].alt = 'Pending alt';
      api.updateProductImage.mockReturnValue(of(server)); await component.saveImageMetadata('a');
    } else if (action === 'upload') {
      server.images.push({ id: 'd', url: '/fixture/d', alt: 'Pending upload', order: 3, isPrimary: false });
      api.uploadProductImage.mockReturnValue(of(server)); await component.uploadImage();
    } else {
      api.updateProduct.mockReturnValue(of(server)); await component.save();
    }
    await fixture.whenStable();
    expect(component.product()?.version).toBe(2);
    expect(component.imageDraft(product.images[0]).alt).toBe('Pending alt');
    expect(component.imageDraftChanged(server.images[0])).toBe(action !== 'metadata');
    expect(component.imageDraft(product.images[2]).order).toBe(5);
    expect(component.selectedImage()).toBe(action === 'upload' ? null : file);
    expect(component.imageAlt()).toBe(action === 'upload' ? '' : 'Pending upload');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });

  it('clears only saved metadata and keeps field-level drafts through a server order change', async () => {
    const { component, api, product } = await setupGallery();
    component.updateImageDraft(product.images[0], 'alt', 'Keep this alt');
    const server = { ...product, version: 2, images: product.images.map((image) => ({ ...image, order: 2 - image.order })) };
    api.updateProductImage.mockReturnValue(of(server)); await component.makePrimary('c');
    expect(component.imageDraft(product.images[0])).toEqual({ alt: 'Keep this alt', order: server.images[0].order });
    const saved = { ...server, version: 3, images: server.images.map((image) => ({ ...image, alt: image.id === 'a' ? 'Keep this alt' : image.alt })) };
    api.updateProductImage.mockReturnValue(of(saved)); await component.saveImageMetadata('a');
    expect(component.imageDraftChanged(saved.images[0])).toBe(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not clear metadata dirtiness when a selected upload is cancelled', async () => {
    const { component, product, file } = await setupGallery();
    component.updateImageDraft(product.images[0], 'alt', 'Unsaved alt');
    component.selectImage({ target: { files: { item: () => file } } } as unknown as Event);
    component.selectImage({ target: { files: { item: () => null } } } as unknown as Event);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(false);
  });
});
