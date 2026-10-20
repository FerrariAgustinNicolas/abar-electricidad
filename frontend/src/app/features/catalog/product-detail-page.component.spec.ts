import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductDetail } from '../../core/catalog/catalog.models';
import { PublicCatalogApiService } from '../../core/catalog/public-catalog-api.service';
import { ProductDetailPageComponent } from './product-detail-page.component';

describe('ProductDetailPageComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts on the API display presentation and keeps the purchase action disabled', () => {
    const fixture = createFixture(detail());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.price')?.textContent).toContain('$');
    expect(fixture.nativeElement.querySelector('.price')?.textContent).toContain('metro');
    expect(fixture.nativeElement.querySelector('.coming-soon')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('existencias:');
  });

  it('shows the selected presentation availability and disables its quantity control when empty', () => {
    const fixture = createFixture(detail());
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('#presentation') as HTMLSelectElement;
    select.value = 'roll';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.price')?.textContent).toContain('rollo de 75 m');
    expect(fixture.nativeElement.querySelector('.availability')?.textContent).toContain('Sin stock');
    expect((fixture.nativeElement.querySelector('#quantity') as HTMLInputElement).disabled).toBe(true);
  });
});

function createFixture(value: ProductDetail) {
  const paramMap = new BehaviorSubject(convertToParamMap({ slug: value.slug }));
  TestBed.configureTestingModule({
    imports: [ProductDetailPageComponent],
    providers: [
      { provide: ActivatedRoute, useValue: { paramMap, snapshot: { paramMap: paramMap.value } } },
      { provide: PublicCatalogApiService, useValue: { product: vi.fn(() => of(value)) } },
    ],
  });
  return TestBed.createComponent(ProductDetailPageComponent);
}

function detail(): ProductDetail {
  const category = { id: 'category', name: 'Cables', slug: 'cables', description: '', order: 1 };
  return {
    id: 'product', slug: 'cable-flexible', name: 'Cable flexible', brand: 'Marca', category, primaryImage: null,
    defaultPresentationId: 'roll', displayPresentationId: 'meter',
    presentations: [
      { id: 'roll', unit: 'ROLL', rollLengthMeters: 75, price: { amountMinor: '125000', currency: 'ARS' }, availability: 'OUT_OF_STOCK', sellable: false },
      { id: 'meter', unit: 'METER', rollLengthMeters: null, price: { amountMinor: '12345', currency: 'ARS' }, availability: 'LOW_STOCK', sellable: true },
    ], shortDescription: 'Cable de prueba', description: 'Descripción', attributes: [{ key: 'Color', value: 'Azul' }], images: [],
  };
}
