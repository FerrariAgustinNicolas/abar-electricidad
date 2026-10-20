import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createPasswordBlocklist, loadPasswordBlocklist } from './password-blocklist';
import { deriveBlocklistDigest, PasswordPolicyError, validateNewPassword } from './password-policy';

const directory = path.resolve(__dirname, '../../resources/auth');
const resource = fs.readFileSync(path.join(directory, 'password-blocklist.bin'));
const manifest = fs.readFileSync(path.join(directory, 'password-blocklist.manifest.json'));
const filenames = ['password-blocklist.bin', 'password-blocklist.manifest.json', 'LICENSE.pwdb.txt', 'LICENSE.seclists.txt'];
const assets = filenames.map((name) => fs.readFileSync(path.join(directory, name)));
const digestAt = (index: number) => resource.subarray(index * 32, (index + 1) * 32).toString('hex');
const nonmember = createHash('sha256').update('C04 public nonmember fixture').digest('hex');

function unavailable(action: () => unknown): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught instanceof PasswordPolicyError).toBe(true);
  if (!(caught instanceof PasswordPolicyError)) return;
  expect(caught.kind === 'unavailable').toBe(true);
  expect(caught.message === 'Password policy is unavailable').toBe(true);
  expect(Object.hasOwn(caught, 'cause')).toBe(false);
  expect(Object.keys(caught).every((key) => ['name', 'kind'].includes(key))).toBe(true);
}

// All assertions avoid printing asset records or entered password digests.
describe('anchored standalone password blocklist', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loads real anchored bytes and searches first, middle, last and absent records', () => {
    const lookup = createPasswordBlocklist(resource, manifest);
    for (const index of [0, 2664, 5328]) expect(lookup.hasDigest(digestAt(index))).toBe(true);
    let absent = true;
    for (let index = 0; index < 5329; index++) absent &&= digestAt(index) !== nonmember;
    expect(absent).toBe(true);
    expect(lookup.hasDigest(nonmember)).toBe(false);
  });

  it('preserves private copies and leaves caller buffers unchanged', () => {
    const bytes = Buffer.from(resource);
    const metadata = Buffer.from(manifest);
    const beforeBytes = Buffer.from(bytes);
    const beforeMetadata = Buffer.from(metadata);
    const lookup = createPasswordBlocklist(bytes, metadata);
    expect(bytes.equals(beforeBytes)).toBe(true);
    expect(metadata.equals(beforeMetadata)).toBe(true);
    bytes.fill(0);
    metadata.fill(0);
    expect(lookup.hasDigest(digestAt(0))).toBe(true);
    expect(lookup.hasDigest(nonmember)).toBe(false);
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.keys(lookup).join(',') === 'hasDigest').toBe(true);
  });

  it('integrates with receiver-bound policy using an established public weak member', () => {
    const lookup = createPasswordBlocklist(resource, manifest);
    const publicWeak = '123456789012345';
    expect(lookup.hasDigest(deriveBlocklistDigest(publicWeak))).toBe(true);
    let blocked: unknown;
    try { validateNewPassword(publicWeak, lookup); } catch (error) { blocked = error; }
    expect(blocked instanceof PasswordPolicyError && blocked.kind === 'blocked').toBe(true);
    const synthetic = 'C04 synthetic policy context';
    expect(lookup.hasDigest(deriveBlocklistDigest(synthetic))).toBe(false);
    expect(validateNewPassword(synthetic, lookup) === synthetic).toBe(true);
    expect(lookup.hasDigest.call(lookup, digestAt(5328))).toBe(true);
  });

  it.each([undefined, null, 1, {}, 'bytes', new Uint8Array(32)])('rejects resource runtime type %#', (value) => {
    unavailable(() => createPasswordBlocklist(value as Buffer, manifest));
  });
  it.each([undefined, null, 1, {}, 'metadata', new Uint8Array(32)])('rejects manifest runtime type %#', (value) => {
    unavailable(() => createPasswordBlocklist(resource, value as Buffer));
  });
  it.each([0, 32, 170527, 170529])('rejects resource length %i', (length) => {
    unavailable(() => createPasswordBlocklist(Buffer.alloc(length), manifest));
  });
  it.each(['bit', 'order', 'duplicate'])('rejects corrupted resource %s at the hash guard', (mode) => {
    const copy = Buffer.from(resource);
    if (mode === 'bit') copy[0] ^= 1;
    if (mode === 'order') {
      const first = Buffer.from(copy.subarray(0, 32));
      copy.copy(copy, 0, 32, 64);
      first.copy(copy, 32);
    }
    if (mode === 'duplicate') copy.copy(copy, 32, 0, 32);
    unavailable(() => createPasswordBlocklist(copy, manifest));
  });
  it.each(['whitespace', 'schema', 'pin', 'count', 'utf8', 'self-consistent'])('rejects changed raw manifest %s', (mode) => {
    let copy = Buffer.from(manifest);
    let bytes = resource;
    const parsed = JSON.parse(manifest.toString('utf8')) as Record<string, unknown>;
    if (mode === 'whitespace') copy = Buffer.concat([copy, Buffer.from(' ')]);
    if (mode === 'schema') { parsed.extra = true; copy = Buffer.from(JSON.stringify(parsed)); }
    if (mode === 'pin') { parsed.unicode = '16.0'; copy = Buffer.from(JSON.stringify(parsed)); }
    if (mode === 'count') { parsed.digestCount = 0; copy = Buffer.from(JSON.stringify(parsed)); }
    if (mode === 'utf8') copy[0] = 0xff;
    if (mode === 'self-consistent') {
      bytes = Buffer.from(resource);
      bytes[0] ^= 1;
      parsed.outputSha256 = createHash('sha256').update(bytes).digest('hex');
      copy = Buffer.from(JSON.stringify(parsed));
    }
    unavailable(() => createPasswordBlocklist(bytes, copy));
  });
  it.each([Buffer.alloc(0), Buffer.alloc(32769)])('rejects empty or over-cap metadata %#', (copy) => {
    unavailable(() => createPasswordBlocklist(resource, copy));
  });
  it.each([undefined, null, 1, {}, new String('0'.repeat(64)), '', '0'.repeat(63), '0'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), '0'.repeat(63) + '\n'])('rejects malformed digest %# without coercion', (value) => {
    const lookup = createPasswordBlocklist(resource, manifest);
    unavailable(() => lookup.hasDigest(value as string));
  });

  it('imports without reading assets and does no filesystem IO during lookup', () => {
    const lookup = createPasswordBlocklist(resource, manifest);
    const spies = [jest.spyOn(fs, 'openSync'), jest.spyOn(fs, 'fstatSync'), jest.spyOn(fs, 'readSync'), jest.spyOn(fs, 'closeSync'), jest.spyOn(fs, 'readFileSync')];
    jest.isolateModules(() => { require('./password-blocklist'); });
    for (let index = 0; index < 50; index++) {
      expect(lookup.hasDigest(digestAt(index))).toBe(true);
      expect(lookup.hasDigest(nonmember)).toBe(false);
    }
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it('loads all four real assets through an explicit source-layout directory', () => {
    expect(loadPasswordBlocklist(directory).hasDigest(digestAt(0))).toBe(true);
    const compiledDirectory = path.resolve(__dirname, '../../dist/auth', '../../resources/auth');
    expect(compiledDirectory === directory).toBe(true);
    expect(loadPasswordBlocklist(compiledDirectory).hasDigest(nonmember)).toBe(false);
  });
  it.each([undefined, null, 1, {}, '', new String(directory)])('rejects invalid directory %# before filesystem access', (value) => {
    const open = jest.spyOn(fs, 'openSync');
    unavailable(() => loadPasswordBlocklist(value as string));
    expect(open.mock.calls.length).toBe(0);
  });
});

// A bounded fake filesystem changes only in-memory copies, never candidate files.
describe('bounded explicit filesystem loading', () => {
  afterEach(() => jest.restoreAllMocks());
  function mockFiles(mode: string, target: number) {
    const opened: number[] = [];
    const closed: number[] = [];
    const positions = new Map<number, number>();
    const buffers = assets.map((asset) => Buffer.from(asset));
    jest.spyOn(fs, 'openSync').mockImplementation((filename) => {
      const index = filenames.indexOf(path.basename(String(filename)));
      if (mode === 'missing' && index === target) throw new Error('Private path marker');
      opened.push(index);
      positions.set(index, 0);
      return index;
    });
    jest.spyOn(fs, 'fstatSync').mockImplementation((fd) => ({
      size: buffers[fd].length + (fd === target && mode === 'oversized' ? 32769 : 0),
      isFile: () => !(fd === target && mode === 'nonfile'),
    }) as fs.Stats);
    jest.spyOn(fs, 'readSync').mockImplementation((fd, output, options) => {
      const offset = options?.offset ?? 0;
      const length = options?.length ?? output.byteLength;
      if (fd === target && mode === 'read-error') throw new Error('Private filesystem marker');
      const position = positions.get(fd)!;
      let bytes = buffers[fd];
      if (fd === target && mode === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
      if (fd === target && mode === 'grown') bytes = Buffer.concat([bytes, Buffer.from([1])]);
      if (fd === target && mode === 'changed') { bytes = Buffer.from(bytes); bytes[0] ^= 1; }
      const count = Math.min(length, 97, Math.max(0, bytes.length - position));
      bytes.copy(output as Buffer, offset, position, position + count);
      positions.set(fd, position + count);
      return count;
    });
    jest.spyOn(fs, 'closeSync').mockImplementation((fd) => { closed.push(fd); });
    return { opened, closed };
  }

  it('handles partial reads and closes every descriptor on success', () => {
    const state = mockFiles('valid', -1);
    expect(loadPasswordBlocklist(directory).hasDigest(digestAt(2664))).toBe(true);
    expect(state.opened.length).toBe(4);
    expect(state.closed.join(',') === state.opened.join(',')).toBe(true);
  });
  it.each(filenames.flatMap((_, index) => ['missing', 'oversized', 'nonfile', 'truncated', 'grown', 'changed', 'read-error'].map((mode) => [mode, index] as const)))('fails closed for %s file %i and closes acquired descriptors', (mode, index) => {
    const state = mockFiles(mode, index);
    unavailable(() => loadPasswordBlocklist(directory));
    expect(state.closed.join(',') === state.opened.join(',')).toBe(true);
  });
  it('closes an opened descriptor even when stat fails', () => {
    const state = mockFiles('valid', -1);
    jest.spyOn(fs, 'fstatSync').mockImplementation(() => { throw new Error('Private stat marker'); });
    unavailable(() => loadPasswordBlocklist(directory));
    expect(state.closed.length).toBe(1);
    expect(state.closed.join(',') === state.opened.join(',')).toBe(true);
  });
  it('redacts close errors instead of returning an allow-all lookup', () => {
    mockFiles('valid', -1);
    jest.spyOn(fs, 'closeSync').mockImplementation(() => { throw new Error('Private close marker'); });
    unavailable(() => loadPasswordBlocklist(directory));
  });
});
