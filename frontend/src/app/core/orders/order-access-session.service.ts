import { Injectable } from '@angular/core';
import { OrderAccessSession } from './orders.models';

const STORAGE_KEY = 'abar.order-access.v1';

@Injectable({ providedIn: 'root' })
export class OrderAccessSessionService {
  private currentSession: OrderAccessSession | null = null;

  save(session: OrderAccessSession): void {
    this.currentSession = session;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* Keep the credential in memory for this page only. */ }
  }

  get(orderId: string): OrderAccessSession | null {
    let session = this.currentSession;
    if (!session) {
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
        if (isAccessSession(stored)) session = stored;
      } catch { session = null; }
    }
    if (!session || session.orderId !== orderId || Date.parse(session.accessExpiresAt) <= Date.now()) return null;
    this.currentSession = session;
    return session;
  }

  clear(): void {
    this.currentSession = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable in privacy mode. */ }
  }
}

function isAccessSession(value: unknown): value is OrderAccessSession {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join(',') === 'accessExpiresAt,accessToken,orderId' &&
    typeof item['orderId'] === 'string' && typeof item['accessToken'] === 'string' && typeof item['accessExpiresAt'] === 'string';
}
