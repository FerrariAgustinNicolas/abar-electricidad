import { HttpException } from '@nestjs/common';

type Bucket = { startedAt: number; count: number };
type Options = { limit?: number; windowMs?: number; maxKeys?: number; now?: () => number };

/** Process-local abuse guard; the key comes only from the direct socket peer. */
export class PublicCheckoutRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: Options = {}) {
    this.limit = options.limit ?? 30;
    this.windowMs = options.windowMs ?? 60_000;
    this.maxKeys = options.maxKeys ?? 4096;
    this.now = options.now ?? Date.now;
  }

  get size(): number { return this.buckets.size; }

  consume(remoteAddress: string | undefined): void {
    const key = typeof remoteAddress === 'string' && remoteAddress.length <= 80 ? remoteAddress : 'unknown-peer';
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (bucket && now - bucket.startedAt < this.windowMs) {
      if (bucket.count >= this.limit) throw new HttpException('RATE_LIMITED', 429);
      bucket.count++;
      return;
    }
    if (this.buckets.size >= this.maxKeys) {
      for (const [candidate, value] of this.buckets) {
        if (now - value.startedAt >= this.windowMs) this.buckets.delete(candidate);
      }
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
    }
    this.buckets.set(key, { startedAt: now, count: 1 });
  }
}
