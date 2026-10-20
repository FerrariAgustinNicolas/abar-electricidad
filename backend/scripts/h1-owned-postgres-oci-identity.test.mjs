import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyOciIdentity } from './h1-owned-postgres-oci-identity.mjs';

const DENIAL = Object.freeze({ ok: false, error: 'Unable to verify supplied OCI identity.' });
const INDEX_TYPE = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const DOCKER_CONFIG = 'application/vnd.docker.container.image.v1+json';
const LAYER_TYPES = [
  'application/vnd.oci.image.layer.v1.tar',
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.oci.image.layer.v1.tar+zstd',
  'application/vnd.docker.image.rootfs.diff.tar.gzip',
];
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const descriptor = (mediaType, content, extra = {}) => ({ mediaType, digest: sha(content), size: content.length, ...extra });

function fixture({ architecture = 'amd64', variant = 'v3', indexWhitespace = '', manifestType = OCI_MANIFEST,
  configType = undefined, layers = [], declaredImageId = undefined, indexOverride = undefined,
  manifestOverride = undefined, configOverride = undefined } = {}) {
  const config = configOverride ?? { os: 'linux', architecture, variant };
  const configBytes = bytes(config);
  const manifest = manifestOverride ?? {
    schemaVersion: 2, mediaType: manifestType,
    config: descriptor(configType ?? (manifestType === OCI_MANIFEST ? OCI_CONFIG : DOCKER_CONFIG), configBytes), layers,
  };
  const manifestBytes = bytes(manifest);
  const target = { os: 'linux', architecture, variant };
  const index = indexOverride ?? {
    schemaVersion: 2, mediaType: INDEX_TYPE,
    manifests: [descriptor(manifestType, manifestBytes, { platform: target })],
  };
  const indexBytes = indexWhitespace ? new TextEncoder().encode(indexWhitespace(JSON.stringify(index))) : bytes(index);
  const policy = { repository: 'registry.example/team/image', indexDigest: sha(indexBytes), platform: target };
  const input = { policy, evidence: { indexBytes: new Uint8Array(indexBytes), manifestBytes: new Uint8Array(manifestBytes), configBytes: new Uint8Array(configBytes) } };
  if (declaredImageId !== undefined) input.declaredImageId = declaredImageId;
  return { input, index, manifest, config, indexBytes, manifestBytes, configBytes, target };
}
function expected(f, declaredImageIdMatched = false) {
  return { ok: true, identity: {
    kind: 'verified-supplied-oci-identity', repository: f.input.policy.repository,
    indexDigest: f.input.policy.indexDigest, manifestDigest: sha(f.manifestBytes), imageId: sha(f.configBytes),
    platform: { os: 'linux', architecture: f.target.architecture, variant: f.target.variant }, declaredImageIdMatched,
  } };
}
function verify(input) { return verifyOciIdentity(input); }
function denied(input) { assert.deepEqual(verify(input), DENIAL); }
const clone = value => structuredClone(value);
function rawDocs(f) { return [f.input.evidence.indexBytes, f.input.evidence.manifestBytes, f.input.evidence.configBytes]; }
function setDocs(input, docs) { [input.evidence.indexBytes, input.evidence.manifestBytes, input.evidence.configBytes] = docs; }
function reencode(f, which, value, whitespace = false) {
  const doc = whitespace ? new TextEncoder().encode(value) : bytes(value);
  if (which === 'index') { f.indexBytes = doc; f.input.policy.indexDigest = sha(doc); f.input.evidence.indexBytes = new Uint8Array(doc); }
  if (which === 'manifest') { f.manifestBytes = doc; f.input.evidence.manifestBytes = new Uint8Array(doc); }
  if (which === 'config') { f.configBytes = doc; f.input.evidence.configBytes = new Uint8Array(doc); }
  return f;
}
function rebuildConfig(f, config) {
  f.config = config; f.configBytes = bytes(config);
  return rebuildRawConfig(f, f.configBytes);
}
function rebuildRawConfig(f, raw) {
  f.configBytes = new Uint8Array(raw);
  f.manifest.config = descriptor(f.manifest.config.mediaType, f.configBytes);
  f.manifestBytes = bytes(f.manifest);
  return rebuildManifest(f, f.manifestBytes);
}
function rebuildManifest(f, raw) {
  f.manifestBytes = new Uint8Array(raw);
  f.index.manifests[0].digest = sha(f.manifestBytes);
  f.index.manifests[0].size = f.manifestBytes.length;
  f.indexBytes = bytes(f.index);
  f.input.evidence.configBytes = new Uint8Array(f.configBytes);
  f.input.evidence.manifestBytes = new Uint8Array(f.manifestBytes);
  f.input.evidence.indexBytes = new Uint8Array(f.indexBytes);
  f.input.policy.indexDigest = sha(f.indexBytes);
  return f;
}
function lexicalTokens(value) {
  if (Array.isArray(value)) return 2 + Math.max(0, value.length - 1) + value.reduce((sum, child) => sum + lexicalTokens(child), 0);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return 2 + 2 * entries.length + Math.max(0, entries.length - 1) + entries.reduce((sum, [, child]) => sum + lexicalTokens(child), 0);
  }
  return 1;
}

// Stub-first RED: this valid supplied identity must succeed rather than return the fixed denial.
test('verifies a supplied OCI index-to-manifest-to-config identity without resolving external resources', () => {
  const f = fixture();
  const result = verify(f.input);
  assert.deepEqual(result, expected(f));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.identity), true);
  assert.equal(Object.isFrozen(result.identity.platform), true);
});

test('rejects a custom-prototype caller platform while preserving valid platform controls', () => {
  const control = fixture(); assert.deepEqual(verify(control.input), expected(control));
  const malformed = fixture();
  Object.setPrototypeOf(malformed.input.policy.platform, { custom: true });
  assert.deepEqual(verify(malformed.input), DENIAL);
});

test('rejects an escaped lone high surrogate in an otherwise-valid ignored config value', () => {
  const control = rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ignored: '\ud83d\ude00' });
  assert.deepEqual(verify(control.input), expected(control));
  const malformed = rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ignored: '\ud800' });
  assert.deepEqual(verify(malformed.input), DENIAL);
});

test('rejects an escaped lone high surrogate in an otherwise-valid ignored config key', () => {
  const control = rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ignored: 0 });
  assert.deepEqual(verify(control.input), expected(control));
  const malformed = rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ['\ud800']: 0 });
  assert.deepEqual(verify(malformed.input), DENIAL);
});

test('rejects lone low surrogates and high surrogates followed by non-low characters', () => {
  for (const invalid of ['\udc00', '\ud800x']) {
    const f = rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ignored: invalid });
    denied(f.input);
  }
  const paired = rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ignored: '\ud83d\ude00' });
  assert.deepEqual(verify(paired.input), expected(paired));
});

test('matches an optional declared image ID only against the exact config-byte digest', () => {
  const f = fixture();
  f.input.declaredImageId = sha(f.configBytes);
  assert.deepEqual(verify(f.input), expected(f, true));
  f.input.declaredImageId = sha(f.manifestBytes);
  denied(f.input);
});

test('accepts valid unknown nonmatching descriptors and counts every explicit target before suitability', () => {
  const f = fixture();
  const unknown = { mediaType: 'application/vnd.example.unknown', digest: `sha256:${'0'.repeat(64)}`, size: 0,
    platform: { os: 'other', architecture: 'mystery' } };
  const index = { ...f.index, manifests: [unknown, ...f.index.manifests] };
  reencode(f, 'index', index);
  assert.deepEqual(verify(f.input), expected(f));
  const duplicate = clone(index); duplicate.manifests.unshift({ ...duplicate.manifests[1], mediaType: 'application/vnd.example.unknown' });
  reencode(f, 'index', duplicate);
  denied(f.input);
  const unsupported = fixture();
  unsupported.index.manifests[0].mediaType = 'application/vnd.oci.image.index.v1+json';
  reencode(unsupported, 'index', unsupported.index); denied(unsupported.input);
});

test('selects OCI and Docker schema-2 manifest/config media-type pairs only', () => {
  const docker = fixture({ manifestType: DOCKER_MANIFEST, configType: DOCKER_CONFIG });
  assert.deepEqual(verify(docker.input), expected(docker));
  const wrong = fixture({ manifestType: OCI_MANIFEST, configType: DOCKER_CONFIG });
  denied(wrong.input);
});

test('checks repository grammar, canonical policy digests, and required exact platform declarations', () => {
  const badRepositories = ['', 'Registry.example/team/image', 'https://registry.example/a/b', 'a/b:tag', 'a/b@sha256:x', 'a//b', 'a/user@host/b', 'a/b:5000/x'];
  for (const repository of badRepositories) { const f = fixture(); f.input.policy.repository = repository; denied(f.input); }
  for (const variant of [null, 'v4']) {
    const f = fixture({ variant });
    f.input.policy.platform.variant = variant;
    assert.deepEqual(verify(f.input), expected(f));
  }
  const undefinedVariant = fixture(); undefinedVariant.input.policy.platform.variant = undefined;
  denied(undefinedVariant.input);
  for (const mutate of [
    f => { f.input.policy.platform.os = 'Linux'; },
    f => { f.input.policy.platform.architecture = 'ARM64'; },
    f => { f.input.policy.platform.variant = null; },
  ]) { const f = fixture(); mutate(f); denied(f.input); }
  const badDigest = fixture(); badDigest.input.policy.indexDigest = badDigest.input.policy.indexDigest.toUpperCase(); denied(badDigest.input);
});

test('links exact raw index, manifest, config digests and sizes without JSON canonicalization', () => {
  for (const which of ['manifest', 'config']) {
    const f = fixture();
    const root = which === 'manifest' ? f.index : f.manifest;
    const selected = which === 'manifest' ? root.manifests[0] : root.config;
    selected.digest = `sha256:${'0'.repeat(64)}`;
    if (which === 'manifest') reencode(f, 'index', root);
    else rebuildManifest(f, bytes(root));
    denied(f.input);
  }
  for (const which of ['manifest', 'config']) {
    const f = fixture();
    const root = which === 'manifest' ? f.index : f.manifest;
    const selected = which === 'manifest' ? root.manifests[0] : root.config;
    selected.size++;
    if (which === 'manifest') reencode(f, 'index', root);
    else rebuildManifest(f, bytes(root));
    denied(f.input);
  }
  const wrongPin = fixture(); wrongPin.input.policy.indexDigest = sha(new Uint8Array([1])); denied(wrongPin.input);
  const exactWhitespace = fixture({ indexWhitespace: text => ` ${text}\n` });
  assert.deepEqual(verify(exactWhitespace.input), expected(exactWhitespace));
  const reordered = fixture({ indexWhitespace: text => {
    const index = JSON.parse(text); return JSON.stringify({ manifests: index.manifests, mediaType: index.mediaType, schemaVersion: index.schemaVersion });
  } });
  assert.equal(verify(reordered.input).identity.indexDigest, sha(reordered.indexBytes));
});

test('validates manifest schema, selected artifacts, layer metadata and external URLs', () => {
  for (const artifactType of ['application/example', null]) {
    const f = fixture(); f.manifest.artifactType = artifactType; rebuildManifest(f, bytes(f.manifest)); denied(f.input);
  }
  for (const type of LAYER_TYPES) {
    const f = fixture({ layers: [{ mediaType: type, digest: `sha256:${'a'.repeat(64)}`, size: 0 }] });
    assert.deepEqual(verify(f.input), expected(f));
  }
  for (const type of ['application/vnd.oci.image.layer.nondistributable.v1.tar', 'unknown']) {
    const f = fixture({ layers: [{ mediaType: type, digest: `sha256:${'a'.repeat(64)}`, size: 1 }] }); denied(f.input);
  }
  const urls = fixture({ layers: [{ mediaType: LAYER_TYPES[0], digest: `sha256:${'a'.repeat(64)}`, size: 1, urls: [] }] }); denied(urls.input);
  const schema = fixture(); schema.manifest.schemaVersion = 1; rebuildManifest(schema, bytes(schema.manifest)); denied(schema.input);
  const media = fixture(); media.manifest.mediaType = DOCKER_MANIFEST; rebuildManifest(media, bytes(media.manifest)); denied(media.input);
});

test('requires config platform agreement and preserves the deliberately strict variant rule', () => {
  for (const config of [{ os: 'windows', architecture: 'amd64', variant: 'v3' },
    { os: 'linux', architecture: 'arm64', variant: 'v3' }, { os: 'linux', architecture: 'amd64' },
    { os: 'linux', architecture: 'amd64', variant: null }]) {
    const f = fixture({ configOverride: config }); denied(f.input);
  }
  const f = fixture({ variant: null, configOverride: { os: 'linux', architecture: 'amd64', variant: null } });
  assert.deepEqual(verify(f.input), expected(f));
});

test('rejects selected accessors without invoking them and ignores unknown accessors', () => {
  let calls = 0;
  const f = fixture();
  Object.defineProperty(f.input.policy, 'repository', { enumerable: true, get() { calls++; throw Error('secret'); } });
  denied(f.input); assert.equal(calls, 0);
  const g = fixture();
  Object.defineProperty(g.input, 'unknown', { get() { calls++; throw Error('secret'); } });
  Object.defineProperty(g.input.policy, 'unknown', { get() { calls++; throw Error('secret'); } });
  assert.deepEqual(verify(g.input), expected(g)); assert.equal(calls, 0);
});

test('never invokes any selected input-data accessor, including optional declared image ID', () => {
  const cases = [
    [input => input, 'policy'], [input => input, 'evidence'],
    [input => input.policy, 'repository'], [input => input.policy, 'indexDigest'], [input => input.policy, 'platform'],
    [input => input.policy.platform, 'os'], [input => input.policy.platform, 'architecture'], [input => input.policy.platform, 'variant'],
    [input => input.evidence, 'indexBytes'], [input => input.evidence, 'manifestBytes'], [input => input.evidence, 'configBytes'],
    [input => input, 'declaredImageId'],
  ];
  let calls = 0;
  for (const [ownerFor, key] of cases) {
    const input = fixture().input; input.declaredImageId = sha(input.evidence.configBytes);
    const owner = ownerFor(input);
    const before = calls;
    Object.defineProperty(owner, key, { configurable: true, get() { calls++; throw Error('private'); } });
    denied(input);
    assert.equal(calls, before, `selected accessor invoked: ${key}`);
  }
  assert.equal(calls, 0);
});

test('requires own plain or null-prototype records and rejects malformed typed byte inputs', () => {
  const base = fixture();
  const cases = [
    null, [], new Date(), Object.create({ policy: base.input.policy }),
    { ...base.input, policy: Object.create(base.input.policy) },
  ];
  for (const input of cases) denied(input);
  for (const value of [undefined, null, [], new Uint8Array(), new DataView(new ArrayBuffer(1)),
    new Uint8Array([123]).subarray(0, 0)]) { const f = fixture(); f.input.evidence.indexBytes = value; denied(f.input); }
  const custom = fixture(); custom.input.evidence.indexBytes = Object.setPrototypeOf(new Uint8Array(rawDocs(custom)[0]), {}); denied(custom.input);
  const buffer = fixture(); buffer.input.evidence.indexBytes = Buffer.from(rawDocs(buffer)[0]); denied(buffer.input);
  const validNull = fixture(); Object.setPrototypeOf(validNull.input, null); Object.setPrototypeOf(validNull.input.policy, null);
  Object.setPrototypeOf(validNull.input.policy.platform, null); Object.setPrototypeOf(validNull.input.evidence, null);
  assert.deepEqual(verify(validNull.input), expected(validNull));
  const offset = fixture();
  for (const [key, raw] of Object.entries({ indexBytes: offset.indexBytes, manifestBytes: offset.manifestBytes, configBytes: offset.configBytes })) {
    const backing = new Uint8Array(raw.length + 4); backing.set(raw, 2);
    offset.input.evidence[key] = backing.subarray(2, 2 + raw.length);
  }
  assert.deepEqual(verify(offset.input), expected(offset));
});

test('snapshots do not mutate supplied data and returns detached frozen identities', () => {
  const f = fixture();
  const inputs = [f.input.policy, f.input.policy.platform, ...rawDocs(f)];
  const before = inputs.map(v => v && typeof v === 'object' ? Reflect.ownKeys(v).map(k => [k, v[k]]) : v);
  const result = verify(f.input);
  assert.deepEqual(result, expected(f));
  assert.notEqual(result.identity, f.input.policy);
  assert.notEqual(result.identity.platform, f.input.policy.platform);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.identity) && Object.isFrozen(result.identity.platform));
  assert.equal(Object.isFrozen(f.input.policy), false);
  assert.equal(inputs.every((v, i) => v && typeof v === 'object'
    ? Reflect.ownKeys(v).every((k, j) => k === before[i][j][0] && v[k] === before[i][j][1]) : true), true);
});

test('all ordinary failures and reflective exceptions return the same frozen redacted denial', () => {
  const a = verify(null), b = verify({});
  assert.deepEqual(a, DENIAL); assert.deepEqual(b, DENIAL); assert.ok(Object.isFrozen(a) && Object.isFrozen(b));
  const proxy = new Proxy(fixture().input, { getOwnPropertyDescriptor() { throw Error('private'); } });
  assert.deepEqual(verify(proxy), DENIAL);
  const revoked = Proxy.revocable(fixture().input, {}); revoked.revoke();
  assert.deepEqual(verify(revoked.proxy), DENIAL);
});

test('applies per-document byte caps including exact positive and over-limit raw documents', () => {
  for (const which of ['indexBytes', 'manifestBytes', 'configBytes']) {
    const f = fixture();
    const empty = new Uint8Array(); f.input.evidence[which] = empty; denied(f.input);
    const oneByte = fixture(); oneByte.input.evidence[which] = new Uint8Array([0x78]);
    if (which === 'indexBytes') oneByte.input.policy.indexDigest = sha(oneByte.input.evidence.indexBytes);
    denied(oneByte.input); // byte 1 is a parser-denial case, not isolated proof of the lower cap.
  }
  for (const which of ['indexBytes', 'manifestBytes', 'configBytes']) {
    const f = fixture(); f.input.evidence[which] = new Uint8Array(262145); denied(f.input);
  }
  const exact = fixture();
  const pad = ' '.repeat(262144 - exact.indexBytes.length);
  exact.indexBytes = new TextEncoder().encode(JSON.stringify(exact.index) + pad);
  exact.input.evidence.indexBytes = new Uint8Array(exact.indexBytes);
  exact.input.policy.indexDigest = sha(exact.indexBytes);
  assert.equal(exact.indexBytes.length, 262144);
  assert.deepEqual(verify(exact.input), expected(exact));
});

test('denies malformed JSON, UTF-8, BOM, escaped duplicate keys and unpaired surrogates', () => {
  for (const raw of [new Uint8Array([0xff]), new TextEncoder().encode('\ufeff{}'), new TextEncoder().encode('{'),
    new TextEncoder().encode('{"a":1,"\\u0061":2}')]) {
    const f = fixture(); f.input.evidence.indexBytes = raw; f.input.policy.indexDigest = sha(raw); denied(f.input);
  }
  const raw = new TextEncoder().encode('{"a":"\\ud800"}');
  const f = fixture(); f.input.evidence.indexBytes = raw; f.input.policy.indexDigest = sha(raw); denied(f.input);
});

test('rejects malformed and duplicate descriptors even when target is unsupported', () => {
  const f = fixture();
  for (const descriptorValue of [
    { mediaType: OCI_MANIFEST, digest: `sha256:${'a'.repeat(64)}`, size: -1, platform: { os: 'linux', architecture: 'amd64' } },
    { mediaType: OCI_MANIFEST, digest: 'sha512:bad', size: 1, platform: { os: 'linux', architecture: 'amd64' } },
    { mediaType: OCI_MANIFEST, digest: `sha256:${'a'.repeat(64)}`, size: 1.5, platform: { os: 'linux', architecture: 'amd64' } },
    { mediaType: OCI_MANIFEST, digest: `sha256:${'a'.repeat(64)}`, size: Number.MAX_SAFE_INTEGER + 1, platform: { os: 'linux', architecture: 'amd64' } },
    { mediaType: OCI_MANIFEST, digest: `sha256:${'a'.repeat(64)}`, size: 1, platform: { os: 'linux' } },
  ]) {
    const index = { ...f.index, manifests: [descriptorValue] }; reencode(f, 'index', index); denied(f.input);
  }
  const maxSafe = { ...f.index, manifests: [{ mediaType: 'application/vnd.example.unknown', digest: `sha256:${'0'.repeat(64)}`, size: Number.MAX_SAFE_INTEGER, platform: { os: 'other', architecture: 'mystery' } }, ...f.index.manifests] };
  reencode(f, 'index', maxSafe); assert.deepEqual(verify(f.input), expected(f));
  for (const count of [0, 65]) {
    const index = { ...f.index, manifests: Array.from({ length: count }, () => f.index.manifests[0]) };
    reencode(f, 'index', index); denied(f.input);
  }
});

test('bounds JSON nesting, decoded strings, object keys, arrays, token counts, and duplicate keys', () => {
  const validWith = value => rebuildConfig(fixture(), { os: 'linux', architecture: 'amd64', variant: 'v3', ignored: value });
  const stringOk = validWith('é'.repeat(2048)); // exactly 4096 UTF-8 bytes
  assert.deepEqual(verify(stringOk.input), expected(stringOk));
  denied(validWith('é'.repeat(2049)).input);
  const key128 = Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`k${i}`, i]));
  const atKeys = validWith(key128); assert.deepEqual(verify(atKeys.input), expected(atKeys));
  const overKeys = validWith({ ...key128, overflow: true }); denied(overKeys.input);
  const arrays = validWith(Array(256).fill(0)); assert.deepEqual(verify(arrays.input), expected(arrays));
  denied(validWith(Array(257).fill(0)).input);
  const deepPass = validWith(JSON.parse('['.repeat(31) + '0' + ']'.repeat(31)));
  assert.deepEqual(verify(deepPass.input), expected(deepPass));
  denied(validWith(JSON.parse('['.repeat(32) + '0' + ']'.repeat(32))).input);
  const manyTokens = Array.from({ length: 140 }, () => Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i}`, i])));
  denied(validWith(manyTokens).input);
  const duplicateIgnored = fixture();
  const raw = new TextEncoder().encode(JSON.stringify(duplicateIgnored.index).slice(0, -1) + ',"ignored":{"x":1,"\\u0078":2}}');
  duplicateIgnored.input.evidence.indexBytes = raw; duplicateIgnored.input.policy.indexDigest = sha(raw); denied(duplicateIgnored.input);
});

test('checks the inclusive lexical-token cap with valid 8191, 8192, and 8193-token documents', () => {
  const make = (target, includeEmptyObject) => {
    const arrayCount = includeEmptyObject ? 123 : 124;
    const memberCount = 3 + arrayCount + Number(includeEmptyObject);
    const scalarTotal = (target - (4 + 3 * memberCount + arrayCount + 2 * Number(includeEmptyObject))) / 2;
    assert.equal(Number.isInteger(scalarTotal), true);
    const config = { os: 'linux', architecture: 'amd64', variant: 'v3' };
    let remaining = scalarTotal;
    for (let i = 0; i < arrayCount; i++) {
      const count = Math.floor(scalarTotal / arrayCount) + (i < scalarTotal % arrayCount ? 1 : 0);
      config[`p${i}`] = Array(count).fill(0); remaining -= count;
    }
    if (includeEmptyObject) config.empty = {};
    assert.equal(remaining, 0);
    assert.equal(Object.keys(config).length, memberCount);
    assert.equal(lexicalTokens(config), target);
    return rebuildConfig(fixture(), config);
  };
  const at8191 = make(8191, false); assert.deepEqual(verify(at8191.input), expected(at8191));
  // Empty unknown objects have two punctuation tokens; with this valid schema-root construction 8192 is reachable.
  const at8192 = make(8192, true); assert.deepEqual(verify(at8192.input), expected(at8192));
  const over8193 = make(8193, false); denied(over8193.input);
});

test('enforces exact decoded UTF-8 byte limits independently for object keys and string values', () => {
  const base = { os: 'linux', architecture: 'amd64', variant: 'v3' };
  for (const [size, shouldPass] of [[4096, true], [4097, false]]) {
    const value = 'é'.repeat(Math.floor(size / 2)) + (size % 2 ? 'a' : '');
    const withValue = rebuildConfig(fixture(), { ...base, ignoredValue: value });
    assert.equal(new TextEncoder().encode(value).length, size);
    if (shouldPass) assert.deepEqual(verify(withValue.input), expected(withValue)); else denied(withValue.input);
    const key = 'é'.repeat(Math.floor(size / 2)) + (size % 2 ? 'a' : '');
    const withKey = rebuildConfig(fixture(), { ...base, [key]: 0 });
    assert.equal(new TextEncoder().encode(key).length, size);
    if (shouldPass) assert.deepEqual(verify(withKey.input), expected(withKey)); else denied(withKey.input);
  }
});

test('scans duplicate decoded keys in valid linked config unknown subtrees', () => {
  const f = fixture();
  const controlRaw = new TextEncoder().encode('{"os":"linux","architecture":"amd64","variant":"v3","ignored":{"x":1}}');
  rebuildRawConfig(f, controlRaw); assert.deepEqual(verify(f.input), expected(f));
  const duplicateRaw = new TextEncoder().encode('{"os":"linux","architecture":"amd64","variant":"v3","ignored":{"x":1,"\\u0078":2}}');
  rebuildRawConfig(f, duplicateRaw); denied(f.input);
});

test('accepts the 64-descriptor and 64-layer endpoints and rejects 65', () => {
  const f = fixture();
  const nonmatching = () => ({ mediaType: 'application/vnd.example.unknown', digest: `sha256:${'0'.repeat(64)}`, size: 0,
    platform: { os: 'other', architecture: 'other' } });
  const endpoint = { ...f.index, manifests: [...f.index.manifests, ...Array.from({ length: 63 }, nonmatching)] };
  reencode(f, 'index', endpoint); assert.deepEqual(verify(f.input), expected(f));
  const overflow = { ...endpoint, manifests: [...endpoint.manifests, nonmatching()] };
  reencode(f, 'index', overflow); denied(f.input);
  for (const count of [64, 65]) {
    const layers = Array.from({ length: count }, () => ({ mediaType: LAYER_TYPES[0], digest: `sha256:${'b'.repeat(64)}`, size: 0 }));
    const g = fixture({ layers });
    if (count === 64) assert.deepEqual(verify(g.input), expected(g)); else denied(g.input);
  }
  const noLayers = fixture({ layers: [] }); assert.deepEqual(verify(noLayers.input), expected(noLayers));
});

test('requires policy platform variant own presence and denies optional declared-ID malformed states', () => {
  for (const mutate of [
    input => { delete input.policy.platform.variant; },
    input => { input.declaredImageId = undefined; },
    input => { input.declaredImageId = null; },
    input => { input.declaredImageId = `SHA256:${'a'.repeat(64)}`; },
    input => { input.declaredImageId = `sha256:${'A'.repeat(64)}`; },
  ]) { const f = fixture(); mutate(f.input); denied(f.input); }
  const nullPrototype = fixture();
  Object.setPrototypeOf(nullPrototype.input.evidence.indexBytes, null); // authentic typed-array branding still rejects this custom prototype.
  denied(nullPrototype.input);
});

test('uses exact cap for a padded manifest and config as well as the index', () => {
  const f = fixture();
  f.manifestBytes = new TextEncoder().encode(JSON.stringify(f.manifest) + ' '.repeat(262144 - f.manifestBytes.length));
  f.input.evidence.manifestBytes = new Uint8Array(f.manifestBytes);
  f.index.manifests[0].digest = sha(f.manifestBytes); f.index.manifests[0].size = f.manifestBytes.length;
  f.indexBytes = bytes(f.index); f.input.evidence.indexBytes = new Uint8Array(f.indexBytes); f.input.policy.indexDigest = sha(f.indexBytes);
  assert.equal(f.manifestBytes.length, 262144); assert.deepEqual(verify(f.input), expected(f));
  const g = fixture();
  g.configBytes = new TextEncoder().encode(JSON.stringify(g.config) + ' '.repeat(262144 - g.configBytes.length));
  g.input.evidence.configBytes = new Uint8Array(g.configBytes);
  g.manifest.config.digest = sha(g.configBytes); g.manifest.config.size = g.configBytes.length;
  g.manifestBytes = bytes(g.manifest); g.input.evidence.manifestBytes = new Uint8Array(g.manifestBytes);
  g.index.manifests[0].digest = sha(g.manifestBytes); g.index.manifests[0].size = g.manifestBytes.length;
  g.indexBytes = bytes(g.index); g.input.evidence.indexBytes = new Uint8Array(g.indexBytes); g.input.policy.indexDigest = sha(g.indexBytes);
  assert.equal(g.configBytes.length, 262144); assert.deepEqual(verify(g.input), expected(g));
});

test('uses captured typed-array intrinsics and rejects nonordinary valid-byte views', () => {
  const source = fixture(); const raw = rawDocs(source)[0];
  const acceptedView = view => {
    const f = fixture(); f.input.evidence.indexBytes = view;
    assert.deepEqual(verify(f.input), expected(f));
  };
  let calls = 0;
  const shadow = new Uint8Array(raw);
  for (const key of ['buffer', 'byteLength', 'byteOffset', 'length', 'constructor', Symbol.iterator]) {
    Object.defineProperty(shadow, key, { configurable: true, get() { calls++; throw Error('must not be read'); } });
  }
  acceptedView(shadow); assert.equal(calls, 0);
  class DerivedBytes extends Uint8Array {}
  const subclass = new DerivedBytes(raw.length); subclass.set(raw); const f = fixture(); f.input.evidence.indexBytes = subclass; denied(f.input);
  const custom = new Uint8Array(raw); Object.setPrototypeOf(custom, {});
  const g = fixture(); g.input.evidence.indexBytes = custom; denied(g.input);
  const proxy = new Proxy(new Uint8Array(raw), {}); const h = fixture(); h.input.evidence.indexBytes = proxy; denied(h.input);
  const buffer = Buffer.from(raw); const i = fixture(); i.input.evidence.indexBytes = buffer; denied(i.input);
  assert.equal(typeof SharedArrayBuffer, 'function');
  const sharedBuffer = new SharedArrayBuffer(raw.length); new Uint8Array(sharedBuffer).set(raw);
  const shared = new Uint8Array(sharedBuffer); const j = fixture(); j.input.evidence.indexBytes = shared; denied(j.input);
  const resizableBuffer = new ArrayBuffer(raw.length, { maxByteLength: raw.length + 1 });
  const resizable = new Uint8Array(resizableBuffer); resizable.set(raw);
  assert.equal(resizableBuffer.resizable, true); const k = fixture(); k.input.evidence.indexBytes = resizable; denied(k.input);
  assert.equal(typeof ArrayBuffer.prototype.transfer, 'function');
  const detached = new Uint8Array(raw); detached.buffer.transfer(); const m = fixture(); m.input.evidence.indexBytes = detached; denied(m.input);
});

test('accepts an actual raw JSON escape pair in an unknown config key', () => {
  const escapedKey = '\\uD83D\\uDE00';
  const rawText = '{"os":"linux","architecture":"amd64","variant":"v3","' + escapedKey + '":0}';
  assert.equal(rawText.includes('\\uD83D\\uDE00'), true);
  const decodedKey = Object.keys(JSON.parse(rawText)).find(key => !['os', 'architecture', 'variant'].includes(key));
  assert.equal(decodedKey.length, 2);
  assert.equal(decodedKey.codePointAt(0), 0x1f600);
  assert.equal(new TextEncoder().encode(decodedKey).length, 4);
  const f = fixture(); rebuildRawConfig(f, new TextEncoder().encode(rawText));
  assert.deepEqual(verify(f.input), expected(f));
});

test('accepts an actual raw JSON escape pair in an unknown config value', () => {
  const escapedPair = '\\uD83D\\uDE00';
  const rawText = '{"os":"linux","architecture":"amd64","variant":"v3","ignored":"' + escapedPair + '"}';
  assert.equal(rawText.includes('\\uD83D\\uDE00'), true);
  const decodedValue = JSON.parse(rawText).ignored;
  assert.equal(decodedValue.length, 2);
  assert.equal(decodedValue.codePointAt(0), 0x1f600);
  assert.equal(new TextEncoder().encode(decodedValue).length, 4);
  const f = fixture(); rebuildRawConfig(f, new TextEncoder().encode(rawText));
  assert.deepEqual(verify(f.input), expected(f));
});

test('measures escaped decoded UTF-8 key and value byte limits at 4096 and 4097', () => {
  const makeText = (kind, size) => {
    const escaped = '\\u00e9'.repeat(2048) + (size === 4097 ? 'a' : '');
    if (kind === 'key') return '{"os":"linux","architecture":"amd64","variant":"v3","' + escaped + '":0}';
    return '{"os":"linux","architecture":"amd64","variant":"v3","ignored":"' + escaped + '"}';
  };
  for (const kind of ['key', 'value']) {
    for (const [size, shouldPass] of [[4096, true], [4097, false]]) {
      const rawText = makeText(kind, size);
      assert.equal([...new TextEncoder().encode(rawText)].every(byte => byte < 0x80), true);
      assert.equal(rawText.includes('\\u00e9'), true);
      const decoded = JSON.parse(rawText);
      const target = kind === 'key'
        ? Object.keys(decoded).find(key => !['os', 'architecture', 'variant'].includes(key))
        : decoded.ignored;
      assert.equal(new TextEncoder().encode(target).length, size);
      const f = fixture(); rebuildRawConfig(f, new TextEncoder().encode(rawText));
      if (shouldPass) assert.deepEqual(verify(f.input), expected(f));
      else denied(f.input);
    }
  }
});
