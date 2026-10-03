import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  decodeRows, generateRows, generatePinned, canonicalManifest,
  validateResource, requireUnicode17,
} from './h1-password-blocklist.mjs';

// Synthetic public dictionary fixtures only; no accounts or credential logging.
const digest = (value) => createHash('sha256').update(value).digest();
const contains = (resource, expected) => {
  for (let offset = 0; offset < resource.length; offset += 32) {
    if (resource.subarray(offset, offset + 32).equals(expected)) return true;
  }
  return false;
};
const rejects = (action) => assert.throws(action, { name: 'Error' });

test('production entry point rejects unpinned raw bytes before decoding', () => {
  rejects(() => generatePinned(Buffer.from('synthetic fixture\n')));
});

test('fatal UTF8 and mandatory single terminal LF framing', () => {
  rejects(() => decodeRows(Buffer.from([0xff, 0x0a])));
  rejects(() => decodeRows(Buffer.from('fixture')));
  rejects(() => decodeRows(Buffer.alloc(0)));
  const rows = decodeRows(Buffer.from('fixture\n\n'));
  assert.equal(rows.length, 2); // An empty row is data, not extra framing to strip.
  assert.equal(rows[1].length, 0);
});

test('LF alone delimits rows; spaces, CR, BOM and controls remain scalars', () => {
  const rows = decodeRows(Buffer.from('\uFEFF spaced row \r\u0000\nnext\n'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].startsWith('\uFEFF '), true);
  assert.equal(rows[0].endsWith(' \r\u0000'), true);
  assert.equal(rows[1].length, 4);
});

test('NFC precedes default lower, with no second NFC pass', () => {
  const source = '\u0130' + 'A'.repeat(13);
  const alias = 'i\u0307' + 'a'.repeat(13);
  const result = generateRows([source, alias, 'E\u0301' + 'A'.repeat(14)]);
  assert.equal(result.eligibleRows, 3);
  assert.equal(result.digestCount, 2);
  assert.equal(contains(result.resource, digest(alias)), true);
  assert.equal(contains(result.resource, digest('\u00e9' + 'a'.repeat(14))), true);
  const postLower = '\u0130\u0316' + 'A'.repeat(13);
  const key = postLower.normalize('NFC').toLowerCase();
  const resource = generateRows([postLower]).resource;
  assert.equal(key === key.normalize('NFC'), false);
  assert.equal(contains(resource, digest(key)), true);
  assert.equal(contains(resource, digest(key.normalize('NFC'))), false);
});

test('minimum applies only to resulting key; no source or key upper cutoff', () => {
  const shortSource = '\u0130' + 'A'.repeat(13);
  const accepted128 = '\u0130' + 'A'.repeat(127);
  const veryLong = 'Z'.repeat(200);
  const result = generateRows(['x'.repeat(14), shortSource, accepted128, veryLong, '😀'.repeat(15)]);
  assert.equal(result.eligibleRows, 4);
  assert.equal(result.digestCount, 4);
  assert.equal(contains(result.resource, digest(accepted128.toLowerCase())), true);
  assert.equal(contains(result.resource, digest(veryLong.toLowerCase())), true);
});

test('ill-formed UTF16 and nonstring rows are rejected without coercion', () => {
  for (const value of ['\ud800', '\udc00', null, 17]) rejects(() => generateRows([value]));
});

test('whole-word full 32-byte digests are sorted, unique and deterministic', () => {
  const rows = ['A'.repeat(15), 'b'.repeat(16), 'a'.repeat(15)];
  const first = generateRows(rows);
  const second = generateRows([...rows].reverse());
  assert.equal(first.resource.length, 64);
  assert.equal(first.resource.equals(second.resource), true);
  assert.equal(first.digestCount, 2);
  assert.equal(first.eligibleRows, 3);
  assert.equal(contains(first.resource, digest('b'.repeat(16))), true);
  assert.equal(contains(first.resource, digest('b'.repeat(15))), false);
  assert.equal(Buffer.compare(first.resource.subarray(0, 32), first.resource.subarray(32)), -1);
  assert.equal(validateResource(first.resource, 2), true);
});

test('resource validation rejects empty, truncated, duplicate, unordered and inconsistent records', () => {
  const low = Buffer.alloc(32, 1);
  const high = Buffer.alloc(32, 2);
  for (const [bytes, count] of [
    [Buffer.alloc(0), 0], [Buffer.alloc(31), 1],
    [Buffer.concat([low, low]), 2], [Buffer.concat([high, low]), 2], [low, 2],
  ]) rejects(() => validateResource(bytes, count));
  rejects(() => generateRows(['tiny']));
});

test('canonical manifest has fixed order, newline and stats derived from resource', () => {
  const result = generateRows(['A'.repeat(15), 'a'.repeat(15)]);
  const first = canonicalManifest(result);
  assert.equal(first, canonicalManifest(generateRows(['a'.repeat(15), 'A'.repeat(15)])));
  assert.equal(first.endsWith('\n'), true);
  const parsed = JSON.parse(first);
  assert.equal(parsed.digestCount, 1);
  assert.equal(parsed.outputBytes, 32);
  assert.equal(parsed.outputSha256 === digest('a'.repeat(15)).toString('hex'), false);
  assert.equal(parsed.outputSha256 === createHash('sha256').update(result.resource).digest('hex'), true);
  assert.equal(parsed.keyMaximum, null);
  assert.equal(Object.keys(parsed)[0], 'format');
});

test('generator requires the reviewed Unicode 17 runtime', () => {
  assert.equal(requireUnicode17('17.0'), true);
  rejects(() => requireUnicode17('16.0'));
});
