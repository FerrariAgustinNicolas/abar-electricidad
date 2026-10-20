import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSessionService } from '../auth/auth-session.service';
import {
  AdminProduct, AdminProductList, Category, CategoryList, CategoryPatch,
  CategoryWrite, ProductPatch, ProductWrite, RollOpeningRequest, StockList, StockOperationList,
  StockOperationView, StockAdjustmentRequest,
} from './catalog.models';

const API = '/api/v1';
type CategoryOrderRequest = { items: Array<{ id: string; expectedVersion: number }> };

@Injectable({ providedIn: 'root' })
export class AdminCatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSessionService);

  listCategories(filters: { q?: string; active?: boolean } = {}): Observable<CategoryList> {
    return this.http.get<CategoryList>(`${API}/admin/categories`, {
      params: queryParams(filters), withCredentials: true,
    });
  }

  createCategory(input: CategoryWrite): Observable<Category> {
    return this.http.post<Category>(`${API}/admin/categories`, input, this.writeOptions());
  }

  updateCategory(id: string, input: CategoryPatch): Observable<Category> {
    return this.http.patch<Category>(`${API}/admin/categories/${encodeURIComponent(id)}`, input, this.writeOptions());
  }

  reorderCategories(input: CategoryOrderRequest): Observable<CategoryList> {
    return this.http.patch<CategoryList>(`${API}/admin/categories/order`, input, this.writeOptions());
  }

  listProducts(filters: Record<string, string | number | boolean | undefined> = {}): Observable<AdminProductList> {
    return this.http.get<AdminProductList>(`${API}/admin/products`, {
      params: queryParams(filters), withCredentials: true,
    });
  }

  getProduct(id: string): Observable<AdminProduct> {
    return this.http.get<AdminProduct>(`${API}/admin/products/${encodeURIComponent(id)}`, { withCredentials: true });
  }

  createProduct(input: ProductWrite): Observable<AdminProduct> {
    return this.http.post<AdminProduct>(`${API}/admin/products`, input, this.writeOptions());
  }

  updateProduct(id: string, input: ProductPatch): Observable<AdminProduct> {
    return this.http.patch<AdminProduct>(`${API}/admin/products/${encodeURIComponent(id)}`, input, this.writeOptions());
  }

  uploadProductImage(productId: string, file: File, alt: string, order: number, isPrimary: boolean, expectedVersion: number): Observable<AdminProduct> {
    const form = new FormData();
    form.set('file', file, file.name);
    form.set('alt', alt);
    form.set('order', String(order));
    form.set('isPrimary', String(isPrimary));
    form.set('expectedVersion', String(expectedVersion));
    return this.http.post<AdminProduct>(`${API}/admin/products/${encodeURIComponent(productId)}/images`, form, this.writeOptions());
  }

  updateProductImage(productId: string, imageId: string, input: { alt?: string; order?: number; isPrimary?: boolean; expectedVersion: number }): Observable<AdminProduct> {
    return this.http.patch<AdminProduct>(`${API}/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, input, this.writeOptions());
  }

  deleteProductImage(productId: string, imageId: string, expectedVersion: number): Observable<AdminProduct> {
    return this.http.delete<AdminProduct>(`${API}/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, {
      ...this.writeOptions(), params: new HttpParams().set('expectedVersion', expectedVersion),
    });
  }

  loadAdminImage(productId: string, imageId: string): Observable<Blob> {
    return this.http.get(`${API}/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, {
      withCredentials: true, responseType: 'blob',
    });
  }

  listStock(filters: Record<string, string | number | undefined> = {}): Observable<StockList> {
    return this.http.get<StockList>(`${API}/admin/stock`, {
      params: queryParams(filters), withCredentials: true,
    });
  }

  listMovements(filters: Record<string, string | number | undefined> = {}): Observable<StockOperationList> {
    return this.http.get<StockOperationList>(`${API}/admin/stock/movements`, {
      params: queryParams(filters), withCredentials: true,
    });
  }

  adjustStock(input: StockAdjustmentRequest, idempotencyKey: string): Observable<StockOperationView> {
    return this.http.post<StockOperationView>(`${API}/admin/stock/adjustments`, input, this.writeOptions(idempotencyKey));
  }

  openRolls(input: RollOpeningRequest, idempotencyKey: string): Observable<StockOperationView> {
    return this.http.post<StockOperationView>(`${API}/admin/stock/roll-openings`, input, this.writeOptions(idempotencyKey));
  }

  private writeOptions(idempotencyKey?: string): { headers: HttpHeaders; withCredentials: true } {
    const token = this.auth.tokenForWrite();
    if (!token) throw new Error('La sesión venció. Inicie sesión nuevamente.');
    let headers = new HttpHeaders().set('X-CSRF-Token', token);
    if (idempotencyKey) headers = headers.set('Idempotency-Key', idempotencyKey);
    return { headers, withCredentials: true };
  }
}

function queryParams(filters: Record<string, string | number | boolean | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params = params.set(key, String(value));
  }
  return params;
}
