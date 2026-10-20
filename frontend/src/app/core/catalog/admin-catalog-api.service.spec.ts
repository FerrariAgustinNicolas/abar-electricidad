import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from '../auth/auth-session.service';
import { AdminCatalogApiService } from './admin-catalog-api.service';

describe('AdminCatalogApiService', () => {
  let api: AdminCatalogApiService;
  let http: HttpTestingController;
  let csrfToken: string | null;

  beforeEach(() => {
    csrfToken = 'csrf-token';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: { tokenForWrite: () => csrfToken } },
      ],
    });
    api = TestBed.inject(AdminCatalogApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the H1 session cookie and CSRF token for category mutations', () => {
    api.createCategory({ name: 'Cables', slug: 'cables', description: '', order: 0, active: true }).subscribe();
    const request = http.expectOne('/api/v1/admin/categories');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-token');
    request.flush({ id: 'c1', name: 'Cables', slug: 'cables', description: '', order: 0, active: true, version: 1 });
  });

  it('passes a caller-owned stable idempotency key for stock operations', () => {
    api.adjustStock({ presentationId: 'p1', delta: 2, reason: 'Recuento', expectedVersion: 4 }, 'stable-key').subscribe();
    const request = http.expectOne('/api/v1/admin/stock/adjustments');
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-key');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ id: 'op1' });
  });

  it.each([401, 403, 409])('does not transparently replay a rejected mutation (%i)', (status) => {
    let errorStatus = 0;
    api.adjustStock({ presentationId: 'p1', delta: 2, reason: 'Recuento', expectedVersion: 4 }, 'stable-key')
      .subscribe({ error: (error: { status: number }) => errorStatus = error.status });
    http.expectOne('/api/v1/admin/stock/adjustments').flush({}, { status, statusText: 'Rejected' });
    expect(errorStatus).toBe(status);
    http.expectNone('/api/v1/admin/stock/adjustments');
  });

  it('sends PNG uploads as credentialed multipart with the current product version', () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });
    api.uploadProductImage('product-1', file, 'Cable rojo', 2, false, 9).subscribe();
    const request = http.expectOne('/api/v1/admin/products/product-1/images');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(request.request.headers.has('Content-Type')).toBe(false);
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('expectedVersion')).toBe('9');
    request.flush({ id: 'product-1' });
  });

  it('refuses to issue a mutation when the H1 session has no CSRF token', () => {
    csrfToken = null;
    expect(() => api.createCategory({ name: 'Cables', slug: 'cables', description: '', order: 0, active: true })).toThrow('La sesión venció');
    http.expectNone('/api/v1/admin/categories');
  });
});
