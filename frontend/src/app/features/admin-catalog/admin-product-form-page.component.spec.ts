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
