import { CsrfNonceCipher } from './csrf-nonce.cipher';

const syntheticKey = Buffer.alloc(32, 7).toString('base64url');
const id = 'a'.repeat(64);

describe('CSRF nonce envelope', () => {
  it('recovers a 32-byte nonce and emits a fresh 12-byte IV and 16-byte tag', () => {
    const cipher = new CsrfNonceCipher(syntheticKey);
    const nonce = Buffer.alloc(32, 9);
    const first = cipher.encrypt('preauth', id, 1, nonce);
    const second = cipher.encrypt('preauth', id, 1, nonce);
    expect(first.iv).toHaveLength(12);
    expect(first.tag).toHaveLength(16);
    expect(first.iv).not.toEqual(second.iv);
    expect(cipher.decrypt('preauth', id, 1, first)).toEqual(nonce);
  });

  it.each([
    ['kind', 'session', id, 1], ['identifier', 'preauth', 'b'.repeat(64), 1],
    ['version', 'preauth', id, 2],
  ])('rejects AAD substitution by %s', (_name, kind, swappedId, version) => {
    const cipher = new CsrfNonceCipher(syntheticKey);
    const envelope = cipher.encrypt('preauth', id, 1, Buffer.alloc(32, 3));
    expect(() => cipher.decrypt(kind as 'session' | 'preauth', swappedId, version, envelope)).toThrow('CSRF protection unavailable');
  });

  it('rejects ciphertext, IV, and tag corruption', () => {
    const cipher = new CsrfNonceCipher(syntheticKey);
    const envelope = cipher.encrypt('session', id, 1, Buffer.alloc(32, 2));
    for (const field of ['ciphertext', 'iv', 'tag'] as const) {
      const damaged = { ...envelope, [field]: Buffer.from(envelope[field]) };
      damaged[field][0] ^= 1;
      expect(() => cipher.decrypt('session', id, 1, damaged)).toThrow('CSRF protection unavailable');
    }
  });

  it.each([undefined, '', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '*', 'A'.repeat(42) + 'B'])(
    'fails safely for absent, malformed or noncanonical keys: %s', (key) => {
      const cipher = new CsrfNonceCipher(key);
      expect(cipher.available).toBe(false);
      expect(() => cipher.encrypt('preauth', id, 1, Buffer.alloc(32))).toThrow('CSRF protection unavailable');
      if (typeof key === 'string' && key.length > 0) expect(JSON.stringify(cipher)).not.toContain(key);
    });
});
