import * as argon2 from 'argon2';
import { validateAuthConfig } from './auth.config';
import { PasswordHasher } from './password-hasher';
import { PasswordPolicyError } from './password-policy';

jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof argon2>('argon2');
  return { ...actual, hash: jest.fn(), verify: jest.fn() };
});
const actual = jest.requireActual<typeof argon2>('argon2');
const hash = jest.mocked(argon2.hash);
const verify = jest.mocked(argon2.verify);
const config = (argon2Concurrency = 1, argon2QueueLimit = 16) =>
  ({ argon2Concurrency, argon2QueueLimit });
const salt = Buffer.alloc(16, 7).toString('base64').replace(/=+$/, '');
const digest = Buffer.alloc(32, 9).toString('base64').replace(/=+$/, '');
const phc = (params = 'm=19456,t=2,p=1', s = salt, d = digest) =>
  `$argon2id$v=19$${params}$${s}$${d}`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function policyError(promise: Promise<unknown>, kind: 'invalid' | 'unavailable') {
  const error: unknown = await promise.catch((failure: unknown) => failure);
  expect(error instanceof PasswordPolicyError).toBe(true);
  const safe = error as PasswordPolicyError;
  expect(safe.kind).toBe(kind);
  expect(safe.message).toBe(kind === 'invalid' ? 'Invalid password input or length' : 'Password policy is unavailable');
  expect(Object.hasOwn(safe, 'cause')).toBe(false);
}
const unavailable = (promise: Promise<unknown>) => policyError(promise, 'unavailable');
beforeEach(() => {
  hash.mockReset();
  verify.mockReset();
  hash.mockResolvedValue(phc());
  verify.mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('PasswordHasher dependency boundary', () => {
  test.each([
    undefined, null, {}, config(0), config(5), config(1.5), config(NaN),
    config(Infinity), config(1, -1), config(1, 65), config(1, 0.5),
    config(1, NaN), config(1, -0), { ...config(), argon2Concurrency: '1' },
    { get argon2Concurrency() { throw new Error('dependency failed'); } },
  ])('rejects invalid configuration without native work %#', (value) => {
    let error: unknown;
    try { new PasswordHasher(value as ReturnType<typeof config>); } catch (failure) { error = failure; }
    expect(error instanceof PasswordPolicyError).toBe(true);
    expect((error as PasswordPolicyError | undefined)?.kind).toBe('unavailable');
    expect((error as Error | undefined)?.message).toBe('Password policy is unavailable');
    expect(hash.mock.calls.length).toBe(0);
    expect(verify.mock.calls.length).toBe(0);
  });
  test('uses validated C1 defaults and fixed native options without a salt override', async () => {
    const settings = validateAuthConfig({ NODE_ENV: 'test' });
    expect(settings.argon2Concurrency).toBe(1);
    expect(settings.argon2QueueLimit).toBe(16);
    await new PasswordHasher(settings).hash('e\u0301');
    expect(hash.mock.calls.length).toBe(1);
    expect(hash.mock.calls[0][0] === 'é').toBe(true);
    expect(hash.mock.calls[0][1]).toEqual({
      type: argon2.argon2id, version: 19, memoryCost: 19456,
      timeCost: 2, parallelism: 1, hashLength: 32,
    });
  });
  test.each([undefined, null, 1, '', '\ud800', 'x'.repeat(129)])(
    'rejects invalid credentials before either native method %#', async (input) => {
      const h = new PasswordHasher(config());
      await policyError(h.hash(input), 'invalid');
      await policyError(h.verify(phc(), input), 'invalid');
      expect(hash.mock.calls.length).toBe(0);
      expect(verify.mock.calls.length).toBe(0);
    });
});

describe('stored PHC safety before native allocation', () => {
  const invalid: unknown[] = [undefined, null, 12, '', 'x'.repeat(257),
    phc().replace('argon2id', 'argon2i'), phc().replace('v=19', 'v=16'),
    phc() + '$extra', phc().slice(1), phc().replace('argon2id', 'argon2idé'),
    ...['m=19455,t=2,p=1', 'm=19457,t=2,p=1', 'm=999999999,t=2,p=1',
      'm=19456,t=1,p=1', 'm=19456,t=3,p=1', 'm=19456,t=2,p=2',
      'm=019456,t=2,p=1', 'm=+19456,t=2,p=1', 'm=19456.0,t=2,p=1',
      'm=19456,t=2,p=1 ', 'm=19456,t=2', 'm=19456,t=2,p=1,p=1',
      'm=19456,t=2,p=1,x=1', 'm=19456;t=2;p=1'].map((p) => phc(p)),
    phc(undefined, ''), phc(undefined, salt + '=='),
    phc(undefined, salt.slice(0, -1) + 'x'),
    phc(undefined, Buffer.alloc(15).toString('base64')),
    phc(undefined, '_'.repeat(22)), phc(undefined, salt, ''),
    phc(undefined, salt, digest + '='), phc(undefined, salt, digest.slice(0, -1) + 'l'),
    phc(undefined, salt, Buffer.alloc(31).toString('base64').replace(/=+$/, ''))];
  test.each(invalid.map((value, index) => ({ value, index })))('fails closed variant $index', async ({ value }) => {
    await unavailable(new PasswordHasher(config()).verify(value, 'x'));
    expect(verify.mock.calls.length).toBe(0);
  });
  test.each(['m=19456,p=1,t=2', 'p=1,t=2,m=19456', 't=2,m=19456,p=1'])('accepts unique order-independent factors %s', async (params) => {
      expect(await new PasswordHasher(config()).verify(phc(params), 'x')).toBe(true);
      expect(verify).toHaveBeenCalledTimes(1);
    });
  test.each([undefined, null, false, '', phc('m=999999999,t=2,p=1')])('rejects unsafe native hash output %#', async (value) => {
      hash.mockResolvedValueOnce(value as string);
      await unavailable(new PasswordHasher(config()).hash('x'));
    });
  test.each([undefined, null, 0, 1, 'false', {}])('rejects nonboolean native verification %#', async (value) => {
    verify.mockResolvedValueOnce(value as boolean);
    await unavailable(new PasswordHasher(config()).verify(phc(), 'x'));
  });
  test('false means only an actual native mismatch', async () => {
    verify.mockResolvedValueOnce(false);
    expect(await new PasswordHasher(config()).verify(phc(), 'x')).toBe(false);
  });
});

describe('shared bounded FIFO', () => {
  test.each([1, 2, 3, 4])('reserves %i active slots and two waiting slots fairly', async (limit) => {
    const starts: string[] = [];
    const jobs: ReturnType<typeof deferred<string | boolean>>[] = [];
    let active = 0;
    let peak = 0;
    const work = (kind: string) => {
      starts.push(kind);
      active++;
      peak = Math.max(peak, active);
      const job = deferred<string | boolean>();
      jobs.push(job);
      return job.promise.finally(() => { active--; });
    };
    hash.mockImplementation(() => work('hash') as Promise<string>);
    verify.mockImplementation(() => work('verify') as Promise<boolean>);
    const settings = config(limit, 2);
    const h = new PasswordHasher(settings);
    const initial = Array.from({ length: limit }, () => h.hash('x'));
    const first = h.verify(phc(), 'x');
    const second = h.hash('x');
    settings.argon2Concurrency = 4;
    settings.argon2QueueLimit = 64;
    await unavailable(h.hash('x'));
    await policyError(h.hash(''), 'invalid');
    await unavailable(h.verify('unsafe', 'x'));
    expect(starts).toEqual(Array(limit).fill('hash'));
    jobs[0].resolve(phc());
    await initial[0];
    expect(starts).toEqual([...Array(limit).fill('hash'), 'verify']);
    const arrival = h.hash('x');
    jobs[limit].resolve(true);
    expect(await first).toBe(true);
    expect(starts).toEqual([...Array(limit).fill('hash'), 'verify', 'hash']);
    jobs[limit + 1].resolve(phc());
    await second;
    expect(starts.length).toBe(limit + 3);
    jobs[limit + 2].resolve(phc());
    for (let i = 1; i < limit; i++) jobs[i].resolve(phc());
    await Promise.all([...initial, arrival]);
    expect(peak).toBe(limit);
    expect(active).toBe(0);
  });
  test.each([0, 16, 64])('enforces waiting capacity %i exactly', async (capacity) => {
    const job = deferred<string>();
    hash.mockReturnValueOnce(job.promise);
    const h = new PasswordHasher(config(1, capacity));
    const running = h.hash('x');
    const waiting = Array.from({ length: capacity }, () => h.verify(phc(), 'x'));
    await unavailable(h.hash('x'));
    expect(verify.mock.calls.length).toBe(0);
    job.resolve(phc());
    await Promise.all([running, ...waiting]);
    expect(verify).toHaveBeenCalledTimes(capacity);
    await h.hash('x');
  });
  test.each(['reject', 'throw', 'bad-hash', 'bad-verify', 'verify-reject', 'verify-throw'])('cleans up after %s', async (failure) => {
    const gate = deferred<string>();
    hash.mockReturnValueOnce(gate.promise);
    const h = new PasswordHasher(config(1, 2));
    const running = h.hash('x');
    let failed: Promise<unknown>;
    if (failure.startsWith('verify-') || failure === 'bad-verify') {
      if (failure === 'bad-verify') verify.mockResolvedValueOnce(undefined as unknown as boolean);
      if (failure === 'verify-reject') verify.mockRejectedValueOnce(new Error('native failure'));
      if (failure === 'verify-throw') verify.mockImplementationOnce(() => { throw new Error('native failure'); });
      failed = h.verify(phc(), 'x');
    } else {
      if (failure === 'reject') hash.mockRejectedValueOnce(new Error('native failure'));
      if (failure === 'throw') hash.mockImplementationOnce(() => { throw new Error('native failure'); });
      if (failure === 'bad-hash') hash.mockResolvedValueOnce('unsafe');
      failed = h.hash('x');
    }
    const observed = unavailable(failed);
    const next = h.hash('x');
    gate.resolve(phc());
    await Promise.all([running, observed, next]);
    expect(await h.verify(phc(), 'x')).toBe(true);
  });
});

describe('actual native functional integration (not load certification)', () => {
  beforeEach(() => {
    hash.mockImplementation(actual.hash);
    verify.mockImplementation(actual.verify);
  });
  test('independent random salts, exact factors and match/mismatch', async () => {
    const h = new PasswordHasher(validateAuthConfig({ NODE_ENV: 'test' }));
    const first = await h.hash('native functional fixture');
    const second = await new PasswordHasher(config()).hash('native functional fixture');
    expect(first !== second).toBe(true);
    const parts = first.split('$');
    expect(parts.length).toBe(6);
    expect(parts[1] === 'argon2id' && parts[2] === 'v=19').toBe(true);
    expect(parts[3].split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
    expect(Buffer.from(parts[4], 'base64').length).toBe(16);
    expect(Buffer.from(parts[5], 'base64').length).toBe(32);
    expect(parts[4] !== second.split('$')[4]).toBe(true);
    expect(await h.verify(first, 'native functional fixture')).toBe(true);
    expect(await h.verify(first, 'native functional fixturex')).toBe(false);
  });
  test('NFC equivalence without case or whitespace folding', async () => {
    const h = new PasswordHasher(config());
    const encoded = await h.hash(' É ');
    expect(await h.verify(encoded, ' E\u0301 ')).toBe(true);
    expect(await h.verify(encoded, ' é ')).toBe(false);
    expect(await h.verify(encoded, 'É')).toBe(false);
  });
  test('supports one through 128 Unicode codepoints without UTF16 truncation', async () => {
    const h = new PasswordHasher(config());
    const short = await h.hash('x');
    expect(await h.verify(short, 'x')).toBe(true);
    const value = '😀'.repeat(128);
    const encoded = await h.hash(value);
    expect(await h.verify(encoded, value)).toBe(true);
    expect(await h.verify(encoded, '😀'.repeat(127) + '😁')).toBe(false);
    await policyError(h.hash(value + 'x'), 'invalid');
  });
});
