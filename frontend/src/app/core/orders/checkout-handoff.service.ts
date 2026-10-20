import { Injectable, signal } from '@angular/core';
import { CartLine } from '../cart/cart-state.service';
import { QuoteResponse } from '../cart/cart.models';

interface AcceptedQuote { quote: QuoteResponse; cartSignature: string }

@Injectable({ providedIn: 'root' })
export class CheckoutHandoffService {
  private readonly accepted = signal<AcceptedQuote | null>(null);

  accept(quote: QuoteResponse, lines: CartLine[]): void {
    this.accepted.set({ quote, cartSignature: signature(lines) });
  }

  current(lines: CartLine[]): QuoteResponse | null {
    const handoff = this.accepted();
    if (!handoff || handoff.cartSignature !== signature(lines) || Date.parse(handoff.quote.expiresAt) <= Date.now()) {
      this.clear();
      return null;
    }
    return handoff.quote;
  }

  clear(): void { this.accepted.set(null); }
}

function signature(lines: CartLine[]): string {
  return JSON.stringify(lines.map(({ presentationId, quantity }) => ({ presentationId, quantity })));
}
