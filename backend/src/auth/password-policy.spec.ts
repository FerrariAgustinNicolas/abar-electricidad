import { createHash } from 'node:crypto';
import {
  deriveBlocklistDigest,
  normalizeCredentialPassword,
  PasswordBlocklistLookup,
  PasswordPolicyError,
  PasswordPolicyErrorKind,
  validateNewPassword,
} from './password-policy';

const synthetic = 'Ab'.repeat(8);
const allow = Object.freeze({ hasDigest: (_digest: string) => false });

function expectKind(action: () => unknown, kind: PasswordPolicyErrorKind): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught instanceof PasswordPolicyError).toBe(true);
  if (!(caught instanceof PasswordPolicyError)) return;
  expect(caught.kind).toBe(kind);
  const messages = {
    invalid: 'Invalid password input or length',
    blocked: 'Password is not permitted',
    unavailable: 'Password policy is unavailable',
  };
  expect(caught.message === messages[kind]).toBe(true);
  expect(Object.hasOwn(caught, 'cause')).toBe(false);
  expect(Object.keys(caught).every((key) => ['name', 'kind'].includes(key))).toBe(true);
}

function unsafeLookup(value: unknown): PasswordBlocklistLookup {
  return value as PasswordBlocklistLookup;
}

describe('standalone password policy', () => {
  it.each([1, 128])('accepts existing credential boundary %i', (length) => {
    const input = 'Q'.repeat(length);
    expect(normalizeCredentialPassword(input) === input).toBe(true);
  });
  it.each([0, 129])('rejects existing credential boundary %i', (length) => {
    expectKind(() => normalizeCredentialPassword('Q'.repeat(length)), 'invalid');
  });
  it.each([15, 128])('accepts new credential boundary %i with one lookup', (length) => {
    const input = 'Q'.repeat(length);
    const hasDigest = jest.fn(() => false);
    expect(validateNewPassword(input, { hasDigest }) === input).toBe(true);
    expect(hasDigest.mock.calls.length).toBe(1);
  });
  it.each([14, 129])('rejects new credential boundary %i without lookup', (length) => {
    const hasDigest = jest.fn(() => false);
    expectKind(() => validateNewPassword('Q'.repeat(length), { hasDigest }), 'invalid');
    expect(hasDigest.mock.calls.length).toBe(0);
  });
  it('counts non-BMP scalars rather than UTF16 units', () => {
    const input = '\u{1f600}'.repeat(128);
    expect(normalizeCredentialPassword(input) === input).toBe(true);
    expect(validateNewPassword(input, allow) === input).toBe(true);
    expectKind(() => normalizeCredentialPassword(input + '\u{1f600}'), 'invalid');
    expectKind(() => validateNewPassword('\u{1f600}'.repeat(14), allow), 'invalid');
  });
  it('composes NFC before both bounds', () => {
    const raw = 'e\u0301'.repeat(128);
    const normalized = '\u00e9'.repeat(128);
    expect(normalizeCredentialPassword(raw) === normalized).toBe(true);
    expect(validateNewPassword(raw, allow) === normalized).toBe(true);
    expectKind(() => validateNewPassword('e\u0301'.repeat(14), allow), 'invalid');
    expect(validateNewPassword('e\u0301'.repeat(15), allow) === '\u00e9'.repeat(15)).toBe(true);
  });
  it('preserves case, whitespace and controls in private credentials', () => {
    const input = ` \t\n\r\u0000${synthetic} `;
    expect(normalizeCredentialPassword(input) === input).toBe(true);
    expect(validateNewPassword(input, allow) === input).toBe(true);
    expect(normalizeCredentialPassword(synthetic) === synthetic.toLowerCase()).toBe(false);
    expect(validateNewPassword(synthetic, allow) === deriveBlocklistDigest(synthetic)).toBe(false);
  });
  it.each(['\u0000', '\u0001', '\uffff', '\u{10ffff}', '\u200d', '\u0301']) (
    'allows Unicode scalar case %# without character bans', (scalar) => {
      const input = scalar.repeat(15);
      expect(normalizeCredentialPassword(input) === input.normalize('NFC')).toBe(true);
      expect(validateNewPassword(input, allow) === input.normalize('NFC')).toBe(true);
    },
  );
  it.each([undefined, null, 123, true, {}, [], new String(synthetic), Symbol('fixture')])(
    'rejects non-string case %# without coercion', (input) => {
      expectKind(() => normalizeCredentialPassword(input), 'invalid');
      expectKind(() => deriveBlocklistDigest(input), 'invalid');
      const hasDigest = jest.fn(() => false);
      expectKind(() => validateNewPassword(input, { hasDigest }), 'invalid');
      expect(hasDigest.mock.calls.length).toBe(0);
    },
  );
  it('never inspects or coerces input properties', () => {
    const input = new Proxy({}, { get: () => { throw new Error('Private marker'); } });
    expectKind(() => normalizeCredentialPassword(input), 'invalid');
    expectKind(() => deriveBlocklistDigest(input), 'invalid');
    expectKind(() => validateNewPassword(input, allow), 'invalid');
  });
  it.each(['\ud800', '\udfff', '\ud800Q', 'Q\udfff', '\ud800\ud800', '\udfff\ud800'])(
    'rejects ill-formed UTF16 case %# instead of replacing it', (fragment) => {
      const input = synthetic + fragment;
      expectKind(() => normalizeCredentialPassword(input), 'invalid');
      expectKind(() => deriveBlocklistDigest(input), 'invalid');
      const hasDigest = jest.fn(() => false);
      expectKind(() => validateNewPassword(input, { hasDigest }), 'invalid');
      expect(hasDigest.mock.calls.length).toBe(0);
    },
  );
  it('derives only public NFC default-lower UTF8 SHA256 keys', () => {
    const input = ' E\u0301xAMPLE\u0000 ';
    const expected = createHash('sha256').update(' éxample\u0000 ', 'utf8').digest('hex');
    expect(deriveBlocklistDigest(input) === expected).toBe(true);
    expect(/^[a-f0-9]{64}$/.test(deriveBlocklistDigest(input))).toBe(true);
    expect(deriveBlocklistDigest(input) === deriveBlocklistDigest(input.toLowerCase())).toBe(true);
    expect(deriveBlocklistDigest(input) === deriveBlocklistDigest(input.trim())).toBe(false);
  });
  it.each([0, 1, 14, 129, 256])('does not impose password bounds on key source length %i', (length) => {
    expect(/^[a-f0-9]{64}$/.test(deriveBlocklistDigest('Q'.repeat(length)))).toBe(true);
  });
  it('retains the source14 / accepted lower alias15 key', () => {
    const source = String.fromCodePoint(0x130) + 'Q'.repeat(13);
    const alias = source.toLowerCase();
    expect([...source.normalize('NFC')].length).toBe(14);
    expect([...alias.normalize('NFC')].length).toBe(15);
    expect(deriveBlocklistDigest(source) === deriveBlocklistDigest(alias)).toBe(true);
    const lookup = { hasDigest: (digest: string) => digest === deriveBlocklistDigest(source) };
    expectKind(() => validateNewPassword(alias, lookup), 'blocked');
    expectKind(() => validateNewPassword(source, lookup), 'invalid');
  });
  it('accepts input128 even when the lower key has129 code points', () => {
    const input = String.fromCodePoint(0x130) + 'Q'.repeat(127);
    expect([...input.normalize('NFC')].length).toBe(128);
    expect([...input.normalize('NFC').toLowerCase()].length).toBe(129);
    expect(validateNewPassword(input, allow) === input).toBe(true);
  });
  it('uses whole-password equality, never substring matching', () => {
    const blocked = deriveBlocklistDigest(synthetic);
    const hasDigest = jest.fn((digest: string) => digest === blocked);
    expectKind(() => validateNewPassword(synthetic.toLowerCase(), { hasDigest }), 'blocked');
    expect(hasDigest.mock.calls.length).toBe(1);
    const extended = synthetic + 'Q';
    expect(validateNewPassword(extended, { hasDigest }) === extended).toBe(true);
    expect(hasDigest.mock.calls.length).toBe(2);
    expect(normalizeCredentialPassword(synthetic) === synthetic).toBe(true);
    expect(hasDigest.mock.calls.length).toBe(2);
  });
  it.each([undefined, null, {}, { hasDigest: false }])('fails closed for missing lookup case %#', (lookup) => {
    expectKind(() => validateNewPassword(synthetic, unsafeLookup(lookup)), 'unavailable');
  });
  it.each([undefined, null, 0, 1, 'false', {}, [], Promise.resolve(false)])(
    'fails closed for nonboolean lookup result case %#', (result) => {
      const hasDigest = jest.fn(() => result);
      expectKind(() => validateNewPassword(synthetic, unsafeLookup({ hasDigest })), 'unavailable');
      expect(hasDigest.mock.calls.length).toBe(1);
    },
  );
  it('redacts throwing resources and getter failures', () => {
    const hasDigest = jest.fn(() => { throw new Error(synthetic); });
    expectKind(() => validateNewPassword(synthetic, { hasDigest }), 'unavailable');
    expect(hasDigest.mock.calls.length).toBe(1);
    const lookup = Object.defineProperty({}, 'hasDigest', {
      get: () => { throw new Error(synthetic); },
    });
    expectKind(() => validateNewPassword(synthetic, unsafeLookup(lookup)), 'unavailable');
  });
  it('preserves method receiver and reads the dependency method only once', () => {
    class FixtureLookup implements PasswordBlocklistLookup {
      readonly keys = new Set([deriveBlocklistDigest(synthetic)]);
      hasDigest(digest: string): boolean { return this.keys.has(digest); }
    }
    const lookup = Object.freeze(new FixtureLookup());
    expectKind(() => validateNewPassword(synthetic, lookup), 'blocked');
    expect(lookup.keys.size).toBe(1);
    let reads = 0;
    const getterLookup = Object.defineProperty({}, 'hasDigest', {
      get: () => { reads += 1; return () => false; },
    });
    expect(validateNewPassword(synthetic, unsafeLookup(getterLookup)) === synthetic).toBe(true);
    expect(reads).toBe(1);
  });
  it('rejects invalid input before accessing even an unavailable dependency', () => {
    let reads = 0;
    const lookup = Object.defineProperty({}, 'hasDigest', {
      get: () => { reads += 1; throw new Error('Resource unavailable'); },
    });
    expectKind(() => validateNewPassword('', unsafeLookup(lookup)), 'invalid');
    expect(reads).toBe(0);
  });
});
