import { TestBed } from '@angular/core/testing';
import { QuoteResponse } from '../cart/cart.models';
import { CartLine } from '../cart/cart-state.service';
import { CheckoutHandoffService } from './checkout-handoff.service';

describe('CheckoutHandoffService', () => {
  const lines: CartLine[] = [{ presentationId: 'p-1', quantity: 1 }];
  const quote: QuoteResponse = {
    quoteId: 'quote-1', expiresAt: new Date(Date.now() + 60_000).toISOString(), items: [], subtotal: { amountMinor: '0', currency: 'ARS' },
    deliveryFee: { amountMinor: '0', currency: 'ARS' }, total: { amountMinor: '0', currency: 'ARS' }, deliveryMode: 'PICKUP',
    paymentMethod: { code: 'DEMO_PAY_ON_PICKUP', label: 'Retiro', instructions: '', demo: true, deliveryModes: ['PICKUP'] },
    policyVersion: 1, stateFingerprint: 'state', warnings: [],
  };

  beforeEach(() => TestBed.configureTestingModule({}));
  afterEach(() => TestBed.resetTestingModule());

  it('passes the exact accepted server snapshot only while the cart and TTL still match', () => {
    const service = TestBed.inject(CheckoutHandoffService);
    service.accept(quote, lines);
    expect(service.current(lines)).toBe(quote);
    expect(service.current([{ ...lines[0], quantity: 2 }])).toBeNull();
    expect(service.current(lines)).toBeNull();
  });

  it('does not recover an accepted quote after a fresh application service instance', () => {
    const first = TestBed.inject(CheckoutHandoffService);
    first.accept(quote, lines);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(CheckoutHandoffService).current(lines)).toBeNull();
  });
});
