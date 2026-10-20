import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OrdersApiService } from './orders-api.service';

describe('OrdersApiService', () => {
  let http: HttpTestingController;
  let api: OrdersApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(OrdersApiService);
  });

  afterEach(() => http.verify());

  it('reads backend-owned provisional terms without inventing a version', () => {
    api.terms().subscribe();
    const request = http.expectOne('/api/v1/public/checkout/terms');
    expect(request.request.method).toBe('GET');
    request.flush({ version: 'demo-2026-10-20-v1', text: 'Provisional', demoMode: true, simulationEnabled: false });
  });

  it('keeps a stable idempotency intent and sends only quote, customer, delivery and terms fields', () => {
    const body = {
      quoteId: 'quote-1',
      customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', phone: '+54 11 1234-5678' },
      deliveryDetails: { addressLine: 'Calle 1', locality: 'La Plata' },
      acceptedTermsVersion: 'demo-2026-10-20-v1' as const,
    };
    api.createOrder(body, 'f'.repeat(36)).subscribe();
    const request = http.expectOne('/api/v1/public/orders');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('f'.repeat(36));
    expect(request.request.body).toEqual(body);
    request.flush({ orderId: 'order-1' }, { status: 201, statusText: 'Created' });
  });

  it('sends the possession credential only in the protected endpoint header', () => {
    api.getOrder('order-1', 'secret-token').subscribe();
    const request = http.expectOne('/api/v1/public/orders/order-1');
    expect(request.request.urlWithParams).not.toContain('secret-token');
    expect(request.request.headers.get('X-Order-Access-Token')).toBe('secret-token');
    request.flush({ orderId: 'order-1' });
  });

  it('performs lookup with the minimal order number and contact request', () => {
    api.lookup({ orderNumber: 'AB-1', contact: 'ada@example.test' }).subscribe();
    const request = http.expectOne('/api/v1/public/orders/lookup');
    expect(request.request.body).toEqual({ orderNumber: 'AB-1', contact: 'ada@example.test' });
    request.flush({ orderNumber: 'AB-1' });
  });
});
