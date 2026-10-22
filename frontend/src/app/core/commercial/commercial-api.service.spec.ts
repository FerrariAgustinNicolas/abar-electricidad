import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from '../auth/auth-session.service';
import { CommercialApiService } from './commercial-api.service';

describe('CommercialApiService', () => {
  let api: CommercialApiService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthSessionService, useValue: { getTokenOrThrow: () => 'session-csrf' } }] }); api = TestBed.inject(CommercialApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => http.verify());
  it('loads admin settings with the session cookie and keeps fee minor units as an exact string', () => {
    api.getSettings().subscribe((value) => expect(value.feeMinor).toBe('9223372036854775807'));
    const req = http.expectOne('/api/v1/admin/settings'); expect(req.request.withCredentials).toBe(true); req.flush({ feeMinor: '9223372036854775807' });
  });
  it('sends optimistic updates with CSRF and does not convert amount strings to numbers', () => {
    const body = { expectedVersion: 4, feeMinor: '9007199254740993', enabledDeliveryModes: ['PICKUP'], contact: {} };
    api.updateSettings(body as never).subscribe(); const req = http.expectOne('/api/v1/admin/settings');
    expect(req.request.method).toBe('PATCH'); expect(req.request.withCredentials).toBe(true); expect(req.request.headers.get('X-CSRF-Token')).toBe('session-csrf'); expect(req.request.body.feeMinor).toBe('9007199254740993'); req.flush({});
  });
  it('loads payment methods by code and retries only with the expected version', () => {
    api.getPaymentMethod('DEMO_TRANSFER').subscribe(); const get = http.expectOne('/api/v1/admin/payment-methods/DEMO_TRANSFER'); expect(get.request.withCredentials).toBe(true); get.flush({});
    api.retryNotification('job-1', 9).subscribe(); const post = http.expectOne('/api/v1/admin/notifications/job-1/retry'); expect(post.request.method).toBe('POST'); expect(post.request.body).toEqual({ expectedVersion: 9 }); expect(post.request.headers.get('X-CSRF-Token')).toBe('session-csrf'); post.flush({});
  });
  it('passes notification filters and uses the public contact endpoint without credentials', () => {
    api.listNotifications({ page: 2, pageSize: 20, state: 'FAILED', orderId: 'ord-1', from: '2026-01-01T00:00:00.000Z' }).subscribe();
    const list = http.expectOne((req) => req.url === '/api/v1/admin/notifications'); expect(list.request.params.get('state')).toBe('FAILED'); expect(list.request.params.get('orderId')).toBe('ord-1'); expect(list.request.withCredentials).toBe(true); list.flush({ items: [], pageInfo: {} });
    api.getPublicContact().subscribe(); const contact = http.expectOne('/api/v1/public/contact'); expect(contact.request.withCredentials).toBe(false); contact.flush({ demo: true });
  });
});
