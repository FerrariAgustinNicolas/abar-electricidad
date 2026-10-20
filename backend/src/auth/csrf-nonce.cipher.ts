import { createCipheriv, createDecipheriv, createSecretKey, randomBytes, KeyObject } from 'node:crypto';

export type CsrfContextKind = 'session' | 'preauth';
export type CsrfEnvelope = Readonly<{ ciphertext: Buffer; iv: Buffer; tag: Buffer }>;

const KEY_SETTING = 'AUTH_CSRF_ENCRYPTION_KEY';
const encodedKey = /^[A-Za-z0-9_-]{43}$/;

/** AES-GCM nonce envelope. The raw key is held only in a true private field. */
export class CsrfNonceCipher {
  readonly #key: KeyObject | undefined;

  constructor(keySetting: unknown) {
    try {
      if (typeof keySetting !== 'string' || !encodedKey.test(keySetting)) return;
      const bytes = Buffer.from(keySetting, 'base64url');
      if (bytes.length !== 32 || bytes.toString('base64url') !== keySetting) return;
      this.#key = createSecretKey(bytes);
      bytes.fill(0);
    } catch {
      // Invalid/unusable deployment key is represented as unavailable, not startup failure.
    }
  }

  get available(): boolean { return this.#key !== undefined; }

  encrypt(kind: CsrfContextKind, hashedId: string, version: number, nonce: Buffer): CsrfEnvelope {
    const key = this.requireKey();
    this.validateContext(kind, hashedId, version);
    if (!Buffer.isBuffer(nonce) || nonce.length !== 32) throw new Error('CSRF protection unavailable');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(this.aad(kind, hashedId, version));
    const ciphertext = Buffer.concat([cipher.update(nonce), cipher.final()]);
    return Object.freeze({ ciphertext, iv, tag: cipher.getAuthTag() });
  }

  decrypt(kind: CsrfContextKind, hashedId: string, version: number, envelope: CsrfEnvelope): Buffer {
    const key = this.requireKey();
    this.validateContext(kind, hashedId, version);
    if (!envelope || !Buffer.isBuffer(envelope.iv) || envelope.iv.length !== 12 ||
        !Buffer.isBuffer(envelope.tag) || envelope.tag.length !== 16 ||
        !Buffer.isBuffer(envelope.ciphertext) || envelope.ciphertext.length !== 32) {
      throw new Error('CSRF protection unavailable');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, envelope.iv, { authTagLength: 16 });
      decipher.setAAD(this.aad(kind, hashedId, version));
      decipher.setAuthTag(envelope.tag);
      const nonce = Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
      if (nonce.length !== 32) throw new Error('invalid nonce length');
      return nonce;
    } catch {
      throw new Error('CSRF protection unavailable');
    }
  }

  private requireKey(): KeyObject {
    if (!this.#key) throw new Error('CSRF protection unavailable');
    return this.#key;
  }

  private validateContext(kind: CsrfContextKind, hashedId: string, version: number): void {
    if ((kind !== 'session' && kind !== 'preauth') || !/^[a-f0-9]{64}$/.test(hashedId) ||
        !Number.isSafeInteger(version) || version < 1) {
      throw new Error('CSRF protection unavailable');
    }
  }

  private aad(kind: CsrfContextKind, hashedId: string, version: number): Buffer {
    return Buffer.from(`abar-csrf-v1\0${kind}\0${hashedId}\0${version}`, 'utf8');
  }
}

export function createCsrfNonceCipher(input: Record<string, unknown>): CsrfNonceCipher {
  // Do not retain the input object or expose the deployment secret in a DTO.
  return new CsrfNonceCipher(input[KEY_SETTING]);
}
