import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CartStateService } from '../../core/cart/cart-state.service';
import { CartLine } from '../../core/cart/cart-state.service';
import { QuoteResponse } from '../../core/cart/cart.models';
import { CheckoutHandoffService } from '../../core/orders/checkout-handoff.service';
import { OrderAccessSessionService } from '../../core/orders/order-access-session.service';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { CreateOrderResponse, H4Terms } from '../../core/orders/orders.models';
import { CheckoutPageComponent } from './checkout-page.component';

describe('CheckoutPageComponent', () => {
  const sessionValues = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => sessionValues.get(key) ?? null,
    setItem: (key: string, value: string) => { sessionValues.set(key, value); },
    removeItem: (key: string) => { sessionValues.delete(key); },
  };
  const lines = [{ presentationId: 'presentation-meter', quantity: 2 }];
  const quote: QuoteResponse = {
    quoteId: 'quote-current', expiresAt: new Date(Date.now() + 60_000).toISOString(), items: [{
      presentationId: 'presentation-meter', productId: 'product-1', productSlug: 'cable', productName: 'Cable',
      unit: 'METER', rollLengthMeters: null, quantity: 2, unitPrice: { amountMinor: '500', currency: 'ARS' }, lineTotal: { amountMinor: '1000', currency: 'ARS' },
    }], subtotal: { amountMinor: '1000', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' },
    total: { amountMinor: '1000', currency: 'ARS' }, deliveryMode: 'PICKUP', paymentMethod: {
      code: 'DEMO_PAY_ON_PICKUP', label: 'Pago al retirar', instructions: 'Demostración', demo: true, deliveryModes: ['PICKUP'],
    }, policyVersion: 1, stateFingerprint: 'snapshot', warnings: ['QUOTE_DOES_NOT_RESERVE_STOCK', 'DEMO_PAYMENT_METHODS_ONLY'],
  };
  const terms: H4Terms = { version: 'demo-2026-10-20-v1', text: 'Provisional', demoMode: true, simulationEnabled: false };
  const created: CreateOrderResponse = {
    orderId: 'order-1', orderNumber: 'AB-100', orderStatus: 'RECEIVED', paymentStatus: 'PENDING',
    currentAttemptId: 'attempt-1', total: { amountMinor: '1000', currency: 'ARS' }, accessToken: 'opaque-access-token-value',
    accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(), nextActions: ['VIEW_ORDER'], demoMode: true,
  };
  let api: { terms: ReturnType<typeof vi.fn>; createOrder: ReturnType<typeof vi.fn> };
  let cart: { lines: ReturnType<typeof signal<CartLine[]>>; clear: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', sessionStorage);
    sessionValues.clear();
    api = { terms: vi.fn(() => of(terms)), createOrder: vi.fn(() => of(new HttpResponse({ status: 201, body: created }))) };
    cart = { lines: signal([...lines]), clear: vi.fn() };
    TestBed.configureTestingModule({ imports: [CheckoutPageComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: OrdersApiService, useValue: api }, { provide: CartStateService, useValue: cart },
    ] });
    TestBed.inject(CheckoutHandoffService).accept(quote, lines);
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); sessionValues.clear(); });

  function setupForm(component: CheckoutPageComponent): void {
    component.form.patchValue({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', phone: '+54 11 1234-5678' });
  }

  it('requires explicit backend terms acceptance before creating from the exact accepted quote snapshot', async () => {
    const fixture = TestBed.createComponent(CheckoutPageComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    setupForm(component);
    expect(component.canSubmit()).toBe(false);
    component.form.controls.accepted.setValue(true);
    expect(component.canSubmit()).toBe(true);
    await component.submit();

    expect(api.createOrder).toHaveBeenCalledOnce();
    const [body, key] = api.createOrder.mock.calls[0] as [{ quoteId: string; customer: { email: string }; acceptedTermsVersion: string }, string];
    expect(body.quoteId).toBe(quote.quoteId);
    expect(body.customer.email).toBe('ada@example.test');
    expect(body.acceptedTermsVersion).toBe(terms.version);
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(cart.clear).toHaveBeenCalledOnce();
    expect(TestBed.inject(OrderAccessSessionService).get('order-1')?.accessToken).toBe(created.accessToken);
    expect(sessionValues.has('abar.order-create-intent.v1')).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('retains the identical body and idempotency key after an unknown outcome', async () => {
    api.createOrder.mockReset().mockReturnValueOnce(throwError(() => ({ status: 0 })))
      .mockReturnValueOnce(of(new HttpResponse({ status: 201, body: created })));
    const fixture = TestBed.createComponent(CheckoutPageComponent);
    const component = fixture.componentInstance;
    await Promise.resolve(); await Promise.resolve();
    setupForm(component); component.form.controls.accepted.setValue(true);
    await component.submit();
    expect(component.unknownOutcome()).toBe(true);
    expect(cart.clear).not.toHaveBeenCalled();
    await component.submit();
    expect(api.createOrder).toHaveBeenCalledTimes(2);
    expect(api.createOrder.mock.calls[0]).toEqual(api.createOrder.mock.calls[1]);
    expect(cart.clear).toHaveBeenCalledOnce();
  });

  it('allows reconciliation of the identical intent after the original quote TTL passes', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-20T12:00:00Z');
    vi.setSystemTime(now);
    const shortQuote = { ...quote, expiresAt: new Date(now.getTime() + 1000).toISOString() };
    TestBed.inject(CheckoutHandoffService).accept(shortQuote, lines);
    api.createOrder.mockReset().mockReturnValueOnce(throwError(() => ({ status: 0 })))
      .mockReturnValueOnce(of(new HttpResponse({ status: 201, body: created })));
    const fixture = TestBed.createComponent(CheckoutPageComponent);
    const component = fixture.componentInstance;
    await Promise.resolve(); await Promise.resolve();
    setupForm(component); component.form.controls.accepted.setValue(true);
    await component.submit();
    expect(component.unknownOutcome()).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    fixture.detectChanges();

    expect(component.quote()).not.toBeNull();
    expect(component.canSubmit()).toBe(true);
    await component.submit();
    expect(api.createOrder).toHaveBeenCalledTimes(2);
    expect(api.createOrder.mock.calls[0]).toEqual(api.createOrder.mock.calls[1]);
    expect(cart.clear).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('fails closed on return after an unknown result without persisting the buyer form or creating a new intent', async () => {
    api.createOrder.mockReset().mockReturnValueOnce(throwError(() => ({ status: 0 })));
    const fixture = TestBed.createComponent(CheckoutPageComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    setupForm(component); component.form.controls.accepted.setValue(true);
    await component.submit();
    expect(component.unknownOutcome()).toBe(true);
    const marker = JSON.parse(sessionValues.get('abar.order-create-intent.v1') ?? 'null') as Record<string, unknown>;
    expect(Object.keys(marker).sort()).toEqual(['idempotencyKey', 'quoteId']);
    expect(JSON.stringify(marker)).not.toContain('ada@example.test');
    fixture.destroy();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CheckoutPageComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: OrdersApiService, useValue: api }, { provide: CartStateService, useValue: cart },
    ] });
    const resumed = TestBed.createComponent(CheckoutPageComponent);
    await Promise.resolve(); await Promise.resolve(); resumed.detectChanges();
    expect(resumed.componentInstance.unresolvedIntent()).toBe(true);
    expect(resumed.nativeElement.textContent).toContain('Ir a consulta mínima del pedido');
    await resumed.componentInstance.submit();
    expect(api.createOrder).toHaveBeenCalledOnce();
  });

  it('preserves reconciliation when the quote expires while the create response is pending', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-20T12:00:00Z'); vi.setSystemTime(now);
    TestBed.inject(CheckoutHandoffService).accept({ ...quote, expiresAt: new Date(now.getTime() + 1000).toISOString() }, lines);
    const response = new Subject<HttpResponse<CreateOrderResponse>>();
    api.createOrder.mockReset().mockReturnValueOnce(response).mockReturnValueOnce(of(new HttpResponse({ status: 201, body: created })));
    const fixture = TestBed.createComponent(CheckoutPageComponent); const component = fixture.componentInstance;
    await Promise.resolve(); await Promise.resolve(); setupForm(component); component.form.controls.accepted.setValue(true);
    const sending = component.submit();
    await vi.advanceTimersByTimeAsync(1500); fixture.detectChanges();
    response.error({ status: 0 }); await sending;

    expect(component.unknownOutcome()).toBe(true);
    expect(component.quote()).not.toBeNull();
    expect(component.canSubmit()).toBe(true);
    await component.submit();
    expect(api.createOrder).toHaveBeenCalledTimes(2);
    expect(api.createOrder.mock.calls[0]).toEqual(api.createOrder.mock.calls[1]);
    expect(cart.clear).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('requires coordinated address and locality while leaving pickup address optional', async () => {
    const coordinated = { ...quote, deliveryMode: 'COORDINATED' as const };
    TestBed.inject(CheckoutHandoffService).accept(coordinated, lines);
    const fixture = TestBed.createComponent(CheckoutPageComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    setupForm(component); component.form.controls.accepted.setValue(true);
    expect(component.form.controls.addressLine.hasError('required')).toBe(true);
    expect(component.form.controls.locality.hasError('required')).toBe(true);
    expect(component.canSubmit()).toBe(false);
  });
});
