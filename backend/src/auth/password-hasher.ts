import * as argon2 from 'argon2';
import type { AuthConfig } from './auth.config';
import { normalizeCredentialPassword, PasswordPolicyError } from './password-policy';

type Capacity = Pick<AuthConfig, 'argon2Concurrency' | 'argon2QueueLimit'>;
const options = Object.freeze({
  type: argon2.argon2id, version: 19, memoryCost: 19456,
  timeCost: 2, parallelism: 1, hashLength: 32,
});

function canonicalBase64(value: string, bytes: number): boolean {
  if (!/^[A-Za-z0-9+/]+$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === bytes && decoded.toString('base64').replace(/=+$/, '') === value;
}

/** Reject corrupt metadata before queue admission or native memory allocation. */
export function validatePasswordPhc(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256 || [...value].some((character) => character.charCodeAt(0) > 127)) {
    throw new PasswordPolicyError('unavailable');
  }
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== '' || parts[1] !== 'argon2id' || parts[2] !== 'v=19') {
    throw new PasswordPolicyError('unavailable');
  }
  const factors = parts[3].split(',');
  const expected = new Set(['m=19456', 't=2', 'p=1']);
  if (factors.length !== 3 || !factors.every((factor) => expected.delete(factor)) || expected.size !== 0 ||
      !canonicalBase64(parts[4], 16) || !canonicalBase64(parts[5], 32)) {
    throw new PasswordPolicyError('unavailable');
  }
  return value;
}

/** Unregistered primitive: callers supply validated capacity; no environment access. */
export class PasswordHasher {
  readonly #capacity: Readonly<Capacity>;
  #active = 0;
  readonly #waiting: Array<() => void> = [];

  constructor(config: Capacity) {
    try {
      const concurrency = config.argon2Concurrency;
      const queueLimit = config.argon2QueueLimit;
      if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4 ||
          !Number.isSafeInteger(queueLimit) || Object.is(queueLimit, -0) || queueLimit < 0 || queueLimit > 64) {
        throw new PasswordPolicyError('unavailable');
      }
      this.#capacity = Object.freeze({ argon2Concurrency: concurrency, argon2QueueLimit: queueLimit });
    } catch {
      // Do not retain caller getter failures, configuration, or native error causes.
      throw new PasswordPolicyError('unavailable');
    }
  }

  async hash(input: unknown): Promise<string> {
    const password = normalizeCredentialPassword(input);
    return this.#schedule(async () => validatePasswordPhc(await argon2.hash(password, options)));
  }

  async verify(phc: unknown, input: unknown): Promise<boolean> {
    const password = normalizeCredentialPassword(input);
    const encoded = validatePasswordPhc(phc);
    return this.#schedule(async () => {
      const result: unknown = await argon2.verify(encoded, password);
      if (typeof result !== 'boolean') throw new PasswordPolicyError('unavailable');
      return result;
    });
  }

  #schedule<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        // Reserve synchronously before awakening a waiter: arrivals cannot steal its slot.
        this.#active++;
        void this.#execute(work, resolve, reject);
      };
      if (this.#active < this.#capacity.argon2Concurrency) {
        start();
      } else if (this.#waiting.length < this.#capacity.argon2QueueLimit) {
        this.#waiting.push(start);
      } else {
        reject(new PasswordPolicyError('unavailable'));
      }
    });
  }

  async #execute<T>(work: () => Promise<T>, resolve: (value: T) => void, reject: (error: Error) => void): Promise<void> {
    try {
      resolve(await work());
    } catch {
      // Only successful native mismatch may resolve false; every failure is unavailable.
      reject(new PasswordPolicyError('unavailable'));
    } finally {
      this.#active--;
      this.#waiting.shift()?.();
    }
  }
}
