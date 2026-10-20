import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartStateService, CART_STORAGE_KEY } from './cart-state.service';

describe('CartStateService', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  beforeEach(() => {
    storage.clear(); vi.stubGlobal('localStorage', storage);
    TestBed.configureTestingModule({ providers: [CartStateService] });
  });
  afterEach(() => { TestBed.resetTestingModule(); storage.clear(); vi.unstubAllGlobals(); });

  it('adds and combines only by presentation ID and persists only the versioned identifiers and quantities', () => {
    const cart = TestBed.inject(CartStateService);
    expect(cart.add('presentation-meter', 2)).toBe(true);
    expect(cart.add('presentation-meter', 1)).toBe(true);
    expect(cart.add('presentation-roll', 1)).toBe(true);
    expect(cart.lines()).toEqual([
      { presentationId: 'presentation-meter', quantity: 3 },
      { presentationId: 'presentation-roll', quantity: 1 },
    ]);
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? 'null')).toEqual({
      version: 1,
      items: [
        { presentationId: 'presentation-meter', quantity: 3 },
        { presentationId: 'presentation-roll', quantity: 1 },
      ],
    });
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toMatch(/price|name|slug|unit/i);
  });

  it('restores valid lines after service recreation and supports decrement, remove, and clear', () => {
    const first = TestBed.inject(CartStateService);
    first.add('meter', 2);
    first.add('roll', 1);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [CartStateService] });
    const restored = TestBed.inject(CartStateService);
    expect(restored.lines()).toEqual([{ presentationId: 'meter', quantity: 2 }, { presentationId: 'roll', quantity: 1 }]);
    expect(restored.decrement('meter')).toBe(true);
    expect(restored.lines()[0].quantity).toBe(1);
    expect(restored.remove('roll')).toBe(true);
    restored.clear();
    expect(restored.lines()).toEqual([]);
  });

  it('rejects invalid quantities, duplicates, oversize carts, and unknown storage versions without throwing', () => {
    const malformed = [
      '{', JSON.stringify({ version: 2, items: [] }),
      JSON.stringify({ version: 1, items: [{ presentationId: 'x', quantity: 1 }, { presentationId: 'x', quantity: 2 }] }),
      JSON.stringify({ version: 1, items: [{ presentationId: 'x', quantity: 0 }] }),
      JSON.stringify({ version: 1, items: [{ presentationId: 'x', quantity: 1.5 }] }),
      JSON.stringify({ version: 1, items: [{ presentationId: 'x', quantity: 1000001 }] }),
      JSON.stringify({ version: 1, items: [{ presentationId: 'x', quantity: 1, price: { amountMinor: '1' } }] }),
    ];
    for (const value of malformed) {
      localStorage.setItem(CART_STORAGE_KEY, value);
      expect(() => TestBed.inject(CartStateService)).not.toThrow();
      expect(TestBed.inject(CartStateService).lines()).toEqual([]);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [CartStateService] });
    }
  });

  it('enforces aggregate quantity and line limits', () => {
    const cart = TestBed.inject(CartStateService);
    expect(cart.add('x', 1000000)).toBe(true);
    expect(cart.add('x')).toBe(false);
    for (let index = 0; index < 99; index++) expect(cart.add(`p-${index}`)).toBe(true);
    expect(cart.lines()).toHaveLength(100);
    expect(cart.add('one-too-many')).toBe(false);
  });
});
