import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Availability, CatalogHome, Page, PresentationUnit, ProductDetail, ProductSummary, PublicCategoryList } from './catalog.models';

export interface PublicProductFilters {
  q?: string;
  categoryId?: string;
  availability?: Availability;
  unit?: PresentationUnit;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  sort?: 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';
  page?: number;
  pageSize?: number;
}

const API = '/api/v1/public';

@Injectable({ providedIn: 'root' })
export class PublicCatalogApiService {
  private readonly http = inject(HttpClient);

  home(): Observable<CatalogHome> {
    return this.http.get<CatalogHome>(`${API}/home`);
  }

  categories(): Observable<PublicCategoryList> {
    return this.http.get<PublicCategoryList>(`${API}/categories`);
  }

  products(filters: PublicProductFilters = {}): Observable<Page<ProductSummary>> {
    let params = new HttpParams();
    for (const key of ['q', 'categoryId', 'availability', 'unit', 'minPriceMinor', 'maxPriceMinor', 'sort', 'page', 'pageSize'] as const) {
      const value = filters[key];
      if (value !== undefined && value !== '') params = params.set(key, value);
    }
    return this.http.get<Page<ProductSummary>>(`${API}/products`, { params });
  }

  product(slug: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${API}/products/${encodeURIComponent(slug)}`);
  }
}
