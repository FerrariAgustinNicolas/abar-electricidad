import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { H7Filters, H7SalesReport } from './h7-reports.models';
import { H7ReportsApiService } from './h7-reports-api.service';

describe('H7ReportsApiService', () => {
  let api: H7ReportsApiService;
  let http: HttpTestingController;
  const filters: H7Filters = {
    from: '2026-10-01', to: '2026-11-01', methodCode: 'DEMO_TRANSFER',
    orderStatus: 'DELIVERED', paymentStatus: 'PAID',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(H7ReportsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the frozen JSON endpoint and preserves every exact filter', () => {
    api.report(filters).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/admin/reports/sales');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.keys().sort()).toEqual(['from', 'methodCode', 'orderStatus', 'paymentStatus', 'to']);
    for (const [key, value] of Object.entries(filters)) expect(request.request.params.get(key)).toBe(value);
    request.flush({} as H7SalesReport);
  });

  it('loads dashboard metrics from the dedicated protected endpoint', () => {
    api.dashboard(filters).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/admin/dashboard');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('from')).toBe(filters.from);
    expect(request.request.params.get('to')).toBe(filters.to);
    request.flush({} as H7SalesReport);
  });

  it('downloads backend CSV with the same normalized filters as the JSON report', () => {
    api.export(filters).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/admin/reports/sales/export');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.keys().sort()).toEqual(['from', 'methodCode', 'orderStatus', 'paymentStatus', 'to']);
    for (const [key, value] of Object.entries(filters)) expect(request.request.params.get(key)).toBe(value);
    request.flush(new Blob(['section,from\r\ntotals,2026-10-01']));
  });
});
