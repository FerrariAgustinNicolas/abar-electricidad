import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PublicCheckoutApiService } from './public-checkout-api.service';

describe('PublicCheckoutApiService', () => {
  let api: PublicCheckoutApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PublicCheckoutApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('reads the frozen public settings and delivery-specific demo methods', () => {
    api.settings().subscribe();
    expect(http.expectOne('/api/v1/public/settings').request.method).toBe('GET');
    api.paymentMethods('COORDINATED').subscribe();
    const request = http.expectOne('/api/v1/public/payment-methods?deliveryMode=COORDINATED');
    expect(request.request.method).toBe('GET');
  });

  it('sends only presentation IDs, integer quantities, delivery mode, and payment code to the quote endpoint', () => {
    const body = { items: [{ presentationId: 'presentation-id', quantity: 2 }], deliveryMode: 'PICKUP' as const, paymentMethodCode: 'DEMO_PAY_ON_PICKUP' as const };
    api.quote(body).subscribe();
    const request = http.expectOne('/api/v1/public/checkout/quotes');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(request.request.body).not.toHaveProperty('price');
    expect(request.request.body).not.toHaveProperty('deliveryFee');
  });
});
