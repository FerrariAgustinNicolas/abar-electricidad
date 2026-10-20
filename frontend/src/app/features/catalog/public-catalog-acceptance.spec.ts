import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from '../../app.component';
import { appRoutes } from '../../app.routes';

const category = { id: '22222222-2222-4222-8222-222222222222', name: 'Cables', slug: 'cables', description: '', order: 0 };
const pageInfo = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };
const product = (slug: string) => ({
  id: slug,
  slug,
  name: slug,
  brand: null,
  category,
  primaryImage: null,
  defaultPresentationId: 'meter',
  displayPresentationId: 'meter',
  presentations: [{ id: 'meter', unit: 'METER', rollLengthMeters: null, price: { amountMinor: '12345', currency: 'ARS' }, availability: 'AVAILABLE', sellable: true }],
  images: [],
  attributes: [],
  description: '',
  shortDescription: '',
});

function setup() {
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter(appRoutes), provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    fixture: TestBed.createComponent(AppComponent),
  };
}

describe('Public catalog acceptance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('keeps a category selected after options load and preserves it when unchanged filters are submitted', async () => {
    const { http, router, fixture } = setup();
    const navigate = vi.spyOn(router, 'navigate');
    await router.navigateByUrl(`/productos?categoryId=${category.id}&unit=ROLL&availability=LOW_STOCK&sort=price-desc&pageSize=40`);
    fixture.detectChanges();
    http.expectOne('/api/v1/public/categories').flush({ items: [category] });
    http.expectOne((request) => request.url === '/api/v1/public/products').flush({ items: [], pageInfo });
    await fixture.whenStable();
    fixture.detectChanges();

    const categorySelect = fixture.nativeElement.querySelector('select[name="categoryId"]') as HTMLSelectElement;
    expect(categorySelect.value).toBe(category.id);
    expect((fixture.nativeElement.querySelector('select[name="unit"]') as HTMLSelectElement).value).toBe('ROLL');
    expect((fixture.nativeElement.querySelector('select[name="availability"]') as HTMLSelectElement).value).toBe('LOW_STOCK');
    expect((fixture.nativeElement.querySelector('select[name="sort"]') as HTMLSelectElement).value).toBe('price-desc');

    (fixture.nativeElement.querySelector('form.filters') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ categoryId: category.id }) }));
    http.verify();
  });

  it('loads the new product when Angular reuses the detail route for another slug', async () => {
    const { http, router, fixture } = setup();
    await router.navigateByUrl('/productos/cable-rojo');
    fixture.detectChanges();
    http.expectOne('/api/v1/public/products/cable-rojo').flush(product('cable-rojo'));
    await fixture.whenStable();
    fixture.detectChanges();

    await router.navigateByUrl('/productos/cable-azul');
    fixture.detectChanges();
    const next = http.match('/api/v1/public/products/cable-azul');
    expect(next).toHaveLength(1);
    next[0].flush(product('cable-azul'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('cable-azul');
    http.verify();
  });

  it.each(['1.5', '2.25', '0', '-1'])('restores the displayed quantity when invalid value %s is rejected', async (value) => {
    const { http, router, fixture } = setup();
    await router.navigateByUrl('/productos/cable-rojo');
    fixture.detectChanges();
    http.expectOne('/api/v1/public/products/cable-rojo').flush(product('cable-rojo'));
    await fixture.whenStable();
    fixture.detectChanges();

    const quantity = fixture.nativeElement.querySelector('#quantity') as HTMLInputElement;
    quantity.value = value;
    quantity.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(quantity.value).toBe('1');
    http.verify();
  });
});
