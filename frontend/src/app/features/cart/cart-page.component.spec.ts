import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CartStateService } from '../../core/cart/cart-state.service';
import { PublicCheckoutApiService } from '../../core/cart/public-checkout-api.service';
import { PublicPaymentMethods, QuoteResponse } from '../../core/cart/cart.models';
import { ProductSummary } from '../../core/catalog/catalog.models';
import { PublicCatalogApiService } from '../../core/catalog/public-catalog-api.service';
import { CartPageComponent } from './cart-page.component';

describe('CartPageComponent', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  afterEach(() => { TestBed.resetTestingModule(); storage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('requires explicit acceptance of a fresh authoritative quote and acceptance again after price or fee changes', async () => {
    vi.stubGlobal('localStorage', storage);
    const firstResponse = new Subject<QuoteResponse>();
    const secondResponse = new Subject<QuoteResponse>();
    const quote = vi.fn().mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse);
    const fixture = createFixture(quote);
    const cart = TestBed.inject(CartStateService);
    cart.add('presentation-meter');
    fixture.detectChanges();
    await settle();
    const component = fixture.componentInstance;

    const first = component.requestQuote();
    firstResponse.next(authoritativeQuote());
    await first;
    expect(component.quote()?.total.amountMinor).toBe('1600');
    expect(component.acceptanceRequired()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('no se guarda al recargar');
    component.acceptQuote();
    expect(component.acceptanceRequired()).toBe(false);

    const second = component.requestQuote();
    const updated = { ...authoritativeQuote(), quoteId: 'quote-two', deliveryFee: { amountMinor: '250', currency: 'ARS' as const }, total: { amountMinor: '1850', currency: 'ARS' as const } };
    secondResponse.next(updated);
    await second;
    expect(component.quoteChanges()).toContain('tarifa de entrega');
    expect(component.acceptanceRequired()).toBe(true);
    expect(component.quote()?.total.amountMinor).toBe('1850');
  });

  it('ignores a quote response after the delivery selection changes', async () => {
    vi.stubGlobal('localStorage', storage);
    const pending = new Subject<QuoteResponse>();
    const quote = vi.fn(() => pending);
    const fixture = createFixture(quote);
    TestBed.inject(CartStateService).add('presentation-meter');
    fixture.detectChanges();
    await settle();
    const request = fixture.componentInstance.requestQuote();
    fixture.componentInstance.changeMode({ target: { value: 'COORDINATED' } } as unknown as Event);
    pending.next(authoritativeQuote());
    await request;
    expect(fixture.componentInstance.quote()).toBeNull();
  });

  it('does not accept an expired authoritative quote', () => {
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const quote = vi.fn().mockImplementation(() => of(authoritativeQuote()));
    const fixture = createFixture(quote);
    const component = fixture.componentInstance;
    // A response can arrive after construction but before the next clock tick.
    vi.setSystemTime(new Date('2026-10-20T12:00:00.010Z'));
    component.quote.set({ ...authoritativeQuote(), expiresAt: new Date(Date.now() - 1).toISOString() });
    component.acceptQuote();
    expect(component.expired()).toBe(true);
    expect(component.acceptedQuoteId()).toBe('');
    fixture.destroy();
  });

  it('reactively marks an expiring quote and hides its final total and acceptance action', async () => {
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();
    const fixture = createFixture(vi.fn());
    TestBed.inject(CartStateService).add('presentation-meter');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    const component = fixture.componentInstance;
    component.quote.set({ ...authoritativeQuote(), expiresAt: new Date(Date.now() + 1500).toISOString() });
    component.acceptQuote();
    fixture.detectChanges();
    expect(component.expired()).toBe(false);
    expect(fixture.nativeElement.querySelector('.quote-card .total')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.quote-card button')).toBeNull();

    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    expect(component.expired()).toBe(true);
    expect(fixture.nativeElement.querySelector('.expired')?.textContent).toContain('Vencido');
    expect(fixture.nativeElement.querySelector('.quote-card .total')).toBeNull();
    expect(fixture.nativeElement.querySelector('.quote-card button')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('El presupuesto venció');
    fixture.destroy();
  });

  it('completes an in-flight methods load after cart edits without weakening mode staleness guards', async () => {
    vi.stubGlobal('localStorage', storage);
    const pendingMethods = new Subject<PublicPaymentMethods>();
    const fixture = createFixture(vi.fn(), pendingMethods);
    const cart = TestBed.inject(CartStateService);
    cart.add('presentation-meter');
    fixture.detectChanges();
    await settle();
    const component = fixture.componentInstance;
    expect(component.methodsLoading()).toBe(true);
    component.increment('presentation-meter');
    pendingMethods.next({ items: [{ code: 'DEMO_PAY_ON_PICKUP', label: 'Pago al retirar (demo)', instructions: 'Instrucción ficticia.', demo: true, deliveryModes: ['PICKUP'] }] });
    await settle();
    expect(component.methodsLoading()).toBe(false);
    expect(component.methods()).toHaveLength(1);
    expect(component.quoteReady()).toBe(true);
    fixture.destroy();
  });

  it('ignores a stale payment-method response after the delivery mode changes', async () => {
    vi.stubGlobal('localStorage', storage);
    const staleMethods = new Subject<PublicPaymentMethods>();
    const currentMethods = new Subject<PublicPaymentMethods>();
    const requests = [staleMethods, currentMethods];
    const paymentMethods = vi.fn(() => requests.shift()!);
    const fixture = createFixture(vi.fn(), paymentMethods);
    const component = fixture.componentInstance;
    await settle();
    expect(component.methodsLoading()).toBe(true);
    component.changeMode({ target: { value: 'COORDINATED' } } as unknown as Event);
    staleMethods.next({ items: [paymentMethod()] });
    await settle();
    expect(component.methods()).toEqual([]);
    expect(component.methodsLoading()).toBe(true);
    const coordinated = { code: 'DEMO_TRANSFER' as const, label: 'Transferencia (demo)', instructions: 'Instrucción ficticia.', demo: true as const, deliveryModes: ['COORDINATED' as const] };
    currentMethods.next({ items: [coordinated] });
    await settle();
    expect(component.methods()).toEqual([coordinated]);
    expect(component.methodsLoading()).toBe(false);
    fixture.destroy();
  });

  it.each([
    [409, 'conflict'], [429, 'rate-limit'], [503, 'unavailable'],
  ] as const)('distinguishes HTTP %i without clearing the cart', async (status, expected) => {
    vi.stubGlobal('localStorage', storage);
    const quote = vi.fn().mockImplementation(() => throwError(() => ({ status })));
    const fixture = createFixture(quote);
    const cart = TestBed.inject(CartStateService);
    cart.add('presentation-meter');
    fixture.detectChanges();
    await settle();
    await fixture.componentInstance.requestQuote();
    expect(fixture.componentInstance.quoteError()).toBe(expected);
    expect(cart.lines()).toEqual([{ presentationId: 'presentation-meter', quantity: 1 }]);
  });
});

function createFixture(quote: ReturnType<typeof vi.fn>, methodsRequest: Observable<PublicPaymentMethods> | (() => Observable<PublicPaymentMethods>) = of({ items: [paymentMethod()] })) {
  TestBed.configureTestingModule({ imports: [CartPageComponent], providers: [provideRouter([]),
    { provide: PublicCatalogApiService, useValue: { products: vi.fn(() => of({ items: [product()], pageInfo: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } })) } },
    { provide: PublicCheckoutApiService, useValue: {
      settings: vi.fn(() => of({ mode: 'DEMO', policyVersion: 1, deliveryModes: ['PICKUP', 'COORDINATED'], deliveryFee: { amountMinor: '0', currency: 'ARS' }, quoteTtlSeconds: 600, maxLines: 100, maxQuantity: 1000000 })),
      paymentMethods: vi.fn(typeof methodsRequest === 'function' ? methodsRequest : () => methodsRequest), quote,
    } },
  ] });
  return TestBed.createComponent(CartPageComponent);
}

function paymentMethod() { return { code: 'DEMO_PAY_ON_PICKUP' as const, label: 'Pago al retirar (demo)', instructions: 'Instrucción ficticia.', demo: true as const, deliveryModes: ['PICKUP' as const] }; }

function product(): ProductSummary {
  return { id: 'product', slug: 'cable', name: 'Cable', brand: null, category: { id: 'category', name: 'Cables', slug: 'cables', description: '', order: 1 },
    primaryImage: null, defaultPresentationId: 'presentation-meter', displayPresentationId: 'presentation-meter', presentations: [
      { id: 'presentation-meter', unit: 'METER', rollLengthMeters: null, price: { amountMinor: '1600', currency: 'ARS' }, availability: 'AVAILABLE', sellable: true },
    ] };
}

function authoritativeQuote(): QuoteResponse {
  return { quoteId: 'quote-one', expiresAt: new Date(Date.now() + 60_000).toISOString(), items: [
    { presentationId: 'presentation-meter', productId: 'product', productSlug: 'cable', productName: 'Cable', unit: 'METER', rollLengthMeters: null, quantity: 1, unitPrice: { amountMinor: '1600', currency: 'ARS' }, lineTotal: { amountMinor: '1600', currency: 'ARS' } },
  ], subtotal: { amountMinor: '1600', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' }, total: { amountMinor: '1600', currency: 'ARS' },
  deliveryMode: 'PICKUP', paymentMethod: { code: 'DEMO_PAY_ON_PICKUP', label: 'Pago al retirar (demo)', instructions: 'Instrucción ficticia.', demo: true, deliveryModes: ['PICKUP'] },
  policyVersion: 1, stateFingerprint: 'a'.repeat(64), warnings: ['QUOTE_DOES_NOT_RESERVE_STOCK', 'DEMO_PAYMENT_METHODS_ONLY'] };
}

async function settle(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, 0)); }
