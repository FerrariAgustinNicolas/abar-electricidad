import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export interface CartLine { presentationId: string; quantity: number }
interface StoredCart { version: 1; items: CartLine[] }

export const CART_STORAGE_KEY = 'abar.cart.v1';
export const CART_MAX_LINES = 100;
export const CART_MAX_QUANTITY = 1_000_000;

@Injectable({ providedIn: 'root' })
export class CartStateService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mutableLines = signal<CartLine[]>([]);
  readonly lines = this.mutableLines.asReadonly();
  readonly itemCount = computed(() => this.mutableLines().reduce((sum, line) => sum + line.quantity, 0));
  readonly localIssue = signal('');

  constructor() { this.restore(); }

  add(presentationId: string, quantity = 1): boolean {
    if (!validId(presentationId) || !validQuantity(quantity)) return false;
    const current = this.mutableLines();
    const index = current.findIndex((line) => line.presentationId === presentationId);
    if (index < 0 && current.length >= CART_MAX_LINES) return false;
    if (index >= 0 && current[index].quantity + quantity > CART_MAX_QUANTITY) return false;
    const next = index >= 0
      ? current.map((line, at) => at === index ? { ...line, quantity: line.quantity + quantity } : line)
      : [...current, { presentationId, quantity }];
    this.commit(next);
    return true;
  }

  increment(presentationId: string): boolean { return this.add(presentationId); }

  decrement(presentationId: string): boolean {
    const current = this.mutableLines();
    const line = current.find((item) => item.presentationId === presentationId);
    if (!line) return false;
    this.commit(line.quantity === 1
      ? current.filter((item) => item.presentationId !== presentationId)
      : current.map((item) => item.presentationId === presentationId ? { ...item, quantity: item.quantity - 1 } : item));
    return true;
  }

  remove(presentationId: string): boolean {
    const current = this.mutableLines();
    if (!current.some((line) => line.presentationId === presentationId)) return false;
    this.commit(current.filter((line) => line.presentationId !== presentationId));
    return true;
  }

  clear(): void { this.commit([]); }

  private restore(): void {
    if (!this.browser) return;
    try {
      const value = localStorage.getItem(CART_STORAGE_KEY);
      if (!value) return;
      const parsed: unknown = JSON.parse(value);
      const lines = parseStoredCart(parsed);
      if (!lines) {
        this.mutableLines.set([]);
        this.localIssue.set('No se pudo recuperar el carrito guardado. Revisá los productos y volvé a intentarlo.');
        localStorage.removeItem(CART_STORAGE_KEY);
        return;
      }
      this.mutableLines.set(lines);
    } catch {
      this.mutableLines.set([]);
      this.localIssue.set('No se pudo leer el carrito guardado en este navegador.');
    }
  }

  private commit(lines: CartLine[]): void {
    this.mutableLines.set(lines);
    this.localIssue.set('');
    if (!this.browser) return;
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, items: lines } satisfies StoredCart)); }
    catch { this.localIssue.set('El navegador no pudo guardar el carrito. La selección actual sigue disponible hasta cerrar esta página.'); }
  }
}

function validId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function validQuantity(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= CART_MAX_QUANTITY; }

export function parseStoredCart(value: unknown): CartLine[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'items']) || value['version'] !== 1 || !Array.isArray(value['items']) || value['items'].length > CART_MAX_LINES) return null;
  const seen = new Set<string>();
  const lines: CartLine[] = [];
  for (const item of value['items']) {
    if (!isRecord(item) || !hasExactKeys(item, ['presentationId', 'quantity']) || !validId(item['presentationId']) || !validQuantity(item['quantity']) || seen.has(item['presentationId'])) return null;
    seen.add(item['presentationId']);
    lines.push({ presentationId: item['presentationId'], quantity: item['quantity'] });
  }
  return lines;
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
