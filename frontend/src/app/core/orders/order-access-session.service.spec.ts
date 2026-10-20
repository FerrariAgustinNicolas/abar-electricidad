import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { OrderAccessSessionService } from './order-access-session.service';

describe('OrderAccessSessionService', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };

  beforeEach(() => { values.clear(); vi.stubGlobal('sessionStorage', storage); TestBed.configureTestingModule({}); });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('persists only the minimum order access credential in session storage and rejects it after expiry', () => {
    const service = TestBed.inject(OrderAccessSessionService);
    const session = { orderId: 'order-1', accessToken: 'opaque-token', accessExpiresAt: new Date(Date.now() + 60_000).toISOString() };
    service.save(session);
    const saved = JSON.parse(values.get('abar.order-access.v1') ?? 'null') as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(['accessExpiresAt', 'accessToken', 'orderId']);
    expect(service.get('order-1')).toEqual(session);
    expect(service.get('another-order')).toBeNull();
    service.save({ ...session, accessExpiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(service.get('order-1')).toBeNull();
  });
});
