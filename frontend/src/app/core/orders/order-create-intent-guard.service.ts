import { Injectable, signal } from '@angular/core';

export interface UnresolvedOrderIntent { quoteId: string; idempotencyKey: string }
const STORAGE_KEY = 'abar.order-create-intent.v1';

@Injectable({ providedIn: 'root' })
export class OrderCreateIntentGuardService {
  private readonly pending = signal<UnresolvedOrderIntent | null>(readStoredIntent());

  current(): UnresolvedOrderIntent | null { return this.pending(); }

  mark(intent: UnresolvedOrderIntent): void {
    this.pending.set(intent);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent)); } catch { /* Keep the marker in memory for this page only. */ }
  }

  clear(): void {
    this.pending.set(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable in privacy mode. */ }
  }
}

function readStoredIntent(): UnresolvedOrderIntent | null {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return null;
    const value = stored as Record<string, unknown>;
    if (Object.keys(value).sort().join(',') !== 'idempotencyKey,quoteId' || typeof value['quoteId'] !== 'string' || typeof value['idempotencyKey'] !== 'string') return null;
    return { quoteId: value['quoteId'], idempotencyKey: value['idempotencyKey'] };
  } catch { return null; }
}
