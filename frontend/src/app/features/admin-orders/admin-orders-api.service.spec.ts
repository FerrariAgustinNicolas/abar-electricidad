import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminOrdersApiService } from './admin-orders-api.service';

describe('AdminOrdersApiService', () => {
  let api: AdminOrdersApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: { tokenForWrite: () => 'csrf-token' } }],
    });
    api = TestBed.inject(AdminOrdersApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads filtered admin orders with bounded pagination parameters', () => {
    api.list({ page: 2, pageSize: 20, orderStatus: 'RECEIVED', paymentStatus: 'PENDING', deliveryMode: 'PICKUP', search: 'AB-1' }).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/admin/orders');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('orderStatus')).toBe('RECEIVED');
    expect(request.request.params.get('paymentStatus')).toBe('PENDING');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ items: [], pageInfo: { page: 2, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('posts payment confirmation with CSRF and the caller-owned stable idempotency key', () => {
    const input = { expectedVersion: 4, attemptId: 'attempt-1', confirmedAmount: { amountMinor: '9007199254740993', currency: 'ARS' as const } };
    api.confirmPayment('order-1', input, 'stable-intent-key-1234').subscribe();
    const request = http.expectOne('/api/v1/admin/orders/order-1/payment-confirmation');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-intent-key-1234');
    expect(request.request.body).toEqual(input);
    request.flush({});
  });
});
