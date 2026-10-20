import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PublicCatalogApiService } from './public-catalog-api.service';

describe('PublicCatalogApiService', () => {
  let api: PublicCatalogApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PublicCatalogApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the public home without requiring credentials', () => {
    api.home().subscribe();
    const request = http.expectOne('/api/v1/public/home');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).not.toBe(true);
    request.flush({ categories: [], featuredProducts: [], lowStockProducts: [] });
  });

  it('serializes only populated catalog filters and preserves minor-unit strings', () => {
    api.products({
      q: 'cable rojo', categoryId: 'category-id', availability: 'LOW_STOCK', unit: 'METER',
      minPriceMinor: '9007199254740993', maxPriceMinor: '9223372036854775807',
      sort: 'price-asc', page: 2, pageSize: 12,
    }).subscribe();
    const request = http.expectOne((candidate) => candidate.url === '/api/v1/public/products');
    expect(request.request.params.keys()).toEqual([
      'q', 'categoryId', 'availability', 'unit', 'minPriceMinor', 'maxPriceMinor', 'sort', 'page', 'pageSize',
    ]);
    expect(request.request.params.get('minPriceMinor')).toBe('9007199254740993');
    expect(request.request.params.get('maxPriceMinor')).toBe('9223372036854775807');
    expect(request.request.withCredentials).not.toBe(true);
    request.flush({ items: [], pageInfo: { page: 2, pageSize: 12, totalItems: 0, totalPages: 0 } });
  });

  it('encodes a product slug when requesting its public detail', () => {
    api.product('cable/rojo').subscribe();
    const request = http.expectOne('/api/v1/public/products/cable%2Frojo');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).not.toBe(true);
    request.flush({});
  });
});
