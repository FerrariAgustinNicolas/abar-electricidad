import { createHash as nodeCreateHash } from 'node:crypto';

const DENIAL = Object.freeze({ ok: false, error: 'Unable to verify supplied OCI identity.' });
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TOKEN = /^[A-Za-z0-9._-]+$/;
const REPOSITORY = /^[a-z0-9]+(?:[.-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/;
const LAYERS = new Set([
  'application/vnd.oci.image.layer.v1.tar',
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.oci.image.layer.v1.tar+zstd',
  'application/vnd.docker.image.rootfs.diff.tar.gzip',
]);
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const DOCKER_CONFIG = 'application/vnd.docker.container.image.v1+json';
const MAX_DOCUMENT = 262144;
const MAX_TOTAL = 786432;
const own = Object.prototype.hasOwnProperty;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const isArray = Array.isArray;
const parseJson = JSON.parse;
const TextDecoderIntrinsic = TextDecoder;
const TextEncoderIntrinsic = TextEncoder;
const Uint8ArrayIntrinsic = Uint8Array;
const uint8Prototype = Uint8ArrayIntrinsic.prototype;
const typedArrayPrototype = getPrototypeOf(uint8Prototype);
const typedArrayBuffer = getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const typedArrayByteOffset = getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const typedArrayByteLength = getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const typedArraySet = typedArrayPrototype.set;
const arrayBufferPrototype = ArrayBuffer.prototype;
const arrayBufferByteLength = getOwnPropertyDescriptor(arrayBufferPrototype, 'byteLength').get;
const arrayBufferResizable = getOwnPropertyDescriptor(arrayBufferPrototype, 'resizable')?.get;
const sharedArrayBufferByteLength = typeof SharedArrayBuffer === 'function'
  ? getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength').get : null;
const sharedArrayBufferGrowable = typeof SharedArrayBuffer === 'function'
  ? getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable')?.get : null;
const encodeText = new TextEncoderIntrinsic().encode;

function fail() { throw new TypeError('invalid'); }
function hasOwn(value, key) { return own.call(value, key); }
function record(value) {
  if (value === null || typeof value !== 'object' || isArray(value)) fail();
  const prototype = getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  return value;
}
function field(value, key, required = true) {
  const descriptor = getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    if (required) fail();
    return { present: false, value: undefined };
  }
  if (!hasOwn(descriptor, 'value')) fail();
  return { present: true, value: descriptor.value };
}
function data(value, key) { return field(value, key).value; }
function token(value, maximum = 64) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !TOKEN.test(value)) fail();
  return value;
}
function digest(value) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail();
  return value;
}
function repository(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 255 || !REPOSITORY.test(value)) fail();
  return value;
}
function safeSize(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
}
function hash(bytes) { return `sha256:${nodeCreateHash('sha256').update(bytes).digest('hex')}`; }

function isShared(buffer) {
  if (!sharedArrayBufferByteLength) return false;
  try { sharedArrayBufferByteLength.call(buffer); return true; } catch { return false; }
}
function snapshot(value) {
  if (value === null || typeof value !== 'object' || getPrototypeOf(value) !== uint8Prototype) fail();
  const buffer = typedArrayBuffer.call(value);
  if (isShared(buffer)) fail();
  const backingLength = arrayBufferByteLength.call(buffer);
  if (arrayBufferResizable && arrayBufferResizable.call(buffer)) fail();
  if (sharedArrayBufferGrowable && (() => { try { sharedArrayBufferGrowable.call(buffer); return true; } catch { return false; } })()) fail();
  const offset = typedArrayByteOffset.call(value);
  const length = typedArrayByteLength.call(value);
  if (backingLength < 1 || length < 1 || length > MAX_DOCUMENT || offset + length > backingLength) fail();
  const copy = new Uint8ArrayIntrinsic(length);
  typedArraySet.call(copy, value);
  return copy;
}

function validateUnicode(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) fail();
  }
  if (encodeText.call(new TextEncoderIntrinsic(), value).length > 4096) fail();
}

function preflightJson(text) {
  let cursor = 0;
  let tokens = 0;
  const length = text.length;
  const whitespace = () => { while (cursor < length && (text[cursor] === ' ' || text[cursor] === '\n' || text[cursor] === '\r' || text[cursor] === '\t')) cursor++; };
  const count = () => { if (++tokens > 8192) fail(); };
  function stringToken() {
    cursor++;
    const pieces = [];
    let segmentStart = cursor;
    while (cursor < length) {
      const char = text.charCodeAt(cursor++);
      if (char === 0x22) {
        pieces.push(text.slice(segmentStart, cursor - 1));
        count();
        const decoded = pieces.join('');
        validateUnicode(decoded);
        return decoded;
      }
      if (char < 0x20) fail();
      if (char !== 0x5c) continue;
      pieces.push(text.slice(segmentStart, cursor - 1));
      if (cursor >= length) fail();
      const escape = text[cursor++];
      if (escape === '"') pieces.push('"');
      else if (escape === '\\') pieces.push('\\');
      else if (escape === '/') pieces.push('/');
      else if (escape === 'b') pieces.push(String.fromCharCode(8));
      else if (escape === 'f') pieces.push(String.fromCharCode(12));
      else if (escape === 'n') pieces.push(String.fromCharCode(10));
      else if (escape === 'r') pieces.push(String.fromCharCode(13));
      else if (escape === 't') pieces.push(String.fromCharCode(9));
      else if (escape === 'u') {
        let code = 0;
        for (let i = 0; i < 4; i++) {
          if (cursor >= length) fail();
          const digit = text.charCodeAt(cursor++);
          const value = digit >= 48 && digit <= 57 ? digit - 48
            : digit >= 65 && digit <= 70 ? digit - 55 : digit >= 97 && digit <= 102 ? digit - 87 : -1;
          if (value < 0) fail();
          code = code * 16 + value;
        }
        pieces.push(String.fromCharCode(code));
      } else fail();
      segmentStart = cursor;
    }
    fail();
  }
  function scalar() {
    const start = cursor;
    if (text[cursor] === '"') { stringToken(); return; }
    if (text[cursor] === '-' || (text[cursor] >= '0' && text[cursor] <= '9')) {
      if (text[cursor] === '-') cursor++;
      if (text[cursor] === '0') cursor++;
      else {
        if (!(text[cursor] >= '1' && text[cursor] <= '9')) fail();
        while (text[cursor] >= '0' && text[cursor] <= '9') cursor++;
      }
      if (text[cursor] === '.') {
        cursor++; if (!(text[cursor] >= '0' && text[cursor] <= '9')) fail();
        while (text[cursor] >= '0' && text[cursor] <= '9') cursor++;
      }
      if (text[cursor] === 'e' || text[cursor] === 'E') {
        cursor++; if (text[cursor] === '+' || text[cursor] === '-') cursor++;
        if (!(text[cursor] >= '0' && text[cursor] <= '9')) fail();
        while (text[cursor] >= '0' && text[cursor] <= '9') cursor++;
      }
      count(); if (cursor === start) fail(); return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, cursor)) { cursor += literal.length; count(); return; }
    }
    fail();
  }
  function value(depth) {
    whitespace();
    const char = text[cursor];
    if (char === '{') {
      if (depth >= 32) fail();
      cursor++; count(); whitespace();
      const keys = new Set(); let members = 0;
      if (text[cursor] === '}') { cursor++; count(); return; }
      while (true) {
        whitespace(); if (text[cursor] !== '"') fail();
        const key = stringToken();
        if (++members > 128 || keys.has(key)) fail();
        keys.add(key); whitespace(); if (text[cursor++] !== ':') fail(); count();
        value(depth + 1); whitespace();
        if (text[cursor] === '}') { cursor++; count(); return; }
        if (text[cursor++] !== ',') fail(); count();
      }
    }
    if (char === '[') {
      if (depth >= 32) fail();
      cursor++; count(); whitespace(); let elements = 0;
      if (text[cursor] === ']') { cursor++; count(); return; }
      while (true) {
        if (++elements > 256) fail();
        value(depth + 1); whitespace();
        if (text[cursor] === ']') { cursor++; count(); return; }
        if (text[cursor++] !== ',') fail(); count();
      }
    }
    scalar();
  }
  value(0); whitespace(); if (cursor !== length) fail();
}

function parseDocument(bytes) {
  let text;
  try { text = new TextDecoderIntrinsic('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail(); }
  if (text.charCodeAt(0) === 0xfeff) fail();
  preflightJson(text);
  return parseJson(text);
}
function jsonRecord(value) {
  if (value === null || typeof value !== 'object' || isArray(value)) fail();
  return value;
}
function descriptor(value) {
  const item = jsonRecord(value);
  const mediaType = data(item, 'mediaType');
  if (typeof mediaType !== 'string' || mediaType.length < 1 || mediaType.length > 255 || /[\u0000-\u001f\u007f]/.test(mediaType)) fail();
  return { item, mediaType, digest: digest(data(item, 'digest')), size: safeSize(data(item, 'size')) };
}
function platform(value, variantRequired = false) {
  const valueRecord = record(value);
  const os = token(data(valueRecord, 'os'));
  const architecture = token(data(valueRecord, 'architecture'));
  const variantField = field(valueRecord, 'variant', variantRequired);
  const variant = !variantField.present || variantField.value === null ? null : token(variantField.value);
  return { os, architecture, variant };
}
function samePlatform(a, b) { return a.os === b.os && a.architecture === b.architecture && a.variant === b.variant; }
function exactBytesLink(desc, bytes, actualDigest) {
  if (desc.size !== bytes.length || desc.digest !== actualDigest) fail();
}

function verify(input) {
  const root = record(input);
  const policy = record(data(root, 'policy'));
  const evidence = record(data(root, 'evidence'));
  const repo = repository(data(policy, 'repository'));
  const indexDigest = digest(data(policy, 'indexDigest'));
  const callerPlatform = platform(data(policy, 'platform'), true);
  if (callerPlatform.os !== 'linux') fail();

  const declared = field(root, 'declaredImageId', false);
  if (declared.present) digest(declared.value);
  const indexBytes = snapshot(data(evidence, 'indexBytes'));
  const manifestBytes = snapshot(data(evidence, 'manifestBytes'));
  const configBytes = snapshot(data(evidence, 'configBytes'));
  if (indexBytes.length + manifestBytes.length + configBytes.length > MAX_TOTAL) fail();
  const indexHash = hash(indexBytes);
  const manifestHash = hash(manifestBytes);
  const configHash = hash(configBytes);
  if (indexHash !== indexDigest) fail();

  const index = jsonRecord(parseDocument(indexBytes));
  const descriptors = data(index, 'manifests');
  if (data(index, 'schemaVersion') !== 2 || data(index, 'mediaType') !== OCI_INDEX || !isArray(descriptors) || descriptors.length < 1 || descriptors.length > 64) fail();
  const matches = [];
  for (const rawDescriptor of descriptors) {
    const desc = descriptor(rawDescriptor);
    const selectedPlatform = platform(data(desc.item, 'platform'));
    if (samePlatform(selectedPlatform, callerPlatform)) matches.push(desc);
  }
  if (matches.length !== 1) fail();
  const selected = matches[0];
  if (selected.mediaType !== OCI_MANIFEST && selected.mediaType !== DOCKER_MANIFEST) fail();
  exactBytesLink(selected, manifestBytes, manifestHash);

  const manifest = jsonRecord(parseDocument(manifestBytes));
  if (data(manifest, 'schemaVersion') !== 2 || data(manifest, 'mediaType') !== selected.mediaType || hasOwn(manifest, 'artifactType')) fail();
  const configDescriptor = descriptor(data(manifest, 'config'));
  const expectedConfigType = selected.mediaType === OCI_MANIFEST ? OCI_CONFIG : DOCKER_CONFIG;
  if (configDescriptor.mediaType !== expectedConfigType) fail();
  exactBytesLink(configDescriptor, configBytes, configHash);
  const layers = data(manifest, 'layers');
  if (!isArray(layers) || layers.length > 64) fail();
  for (const rawLayer of layers) {
    const layer = descriptor(rawLayer);
    if (!LAYERS.has(layer.mediaType) || hasOwn(layer.item, 'urls')) fail();
  }

  const config = jsonRecord(parseDocument(configBytes));
  const configPlatform = {
    os: token(data(config, 'os')), architecture: token(data(config, 'architecture')),
    variant: (() => { const value = field(config, 'variant', false); return !value.present || value.value === null ? null : token(value.value); })(),
  };
  if (!samePlatform(configPlatform, callerPlatform)) fail();
  if (declared.present && declared.value !== configHash) fail();
  return Object.freeze({ ok: true, identity: Object.freeze({
    kind: 'verified-supplied-oci-identity', repository: repo, indexDigest, manifestDigest: manifestHash,
    imageId: configHash, platform: Object.freeze({ ...callerPlatform }), declaredImageIdMatched: declared.present,
  }) });
}

/** Verify only the caller-supplied OCI index, manifest, and config byte graph. */
export function verifyOciIdentity(input) {
  try { return verify(input); } catch { return DENIAL; }
}
