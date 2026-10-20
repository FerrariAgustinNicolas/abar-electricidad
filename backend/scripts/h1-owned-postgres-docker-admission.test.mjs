import test from 'node:test';
import assert from 'node:assert/strict';
import { admitDockerObservations } from './h1-owned-postgres-docker-admission.mjs';

const DENIAL = Object.freeze({ ok: false, error: 'Unable to admit Docker observations.' });
function valid({ apiVersion = '1.48', minimum = '1.24', daemonOs = 'linux', daemonArch = 'arm64',
  imageOs = 'linux', imageArch = 'arm64', expected = 'arm64' } = {}) {
  return {
    daemonObservation: { ok: true, daemon: { apiVersion,
      minimumApiVersion: { kind: 'present', value: minimum }, os: daemonOs, architecture: daemonArch } },
    imageObservation: { ok: true, image: { platform: { os: imageOs, architecture: imageArch } } },
    policy: { expectedArchitecture: expected },
  };
}
const success = (architecture = 'arm64') => ({ ok: true, admission: {
  kind: 'declared-compatible', apiVersion: '1.48', os: 'linux', architecture,
} });
function denied(input) { assert.deepEqual(admitDockerObservations(input), DENIAL); }
function location(root, path) {
  const keys = path ? path.split('.') : [];
  let owner = root;
  for (const key of keys.slice(0, -1)) owner = owner[key];
  return { owner, key: keys.at(-1) };
}
function replaceAt(root, path, value) {
  if (!path) return value;
  const { owner, key } = location(root, path);
  owner[key] = value;
  return root;
}
function atPath(root, path) {
  return path ? path.split('.').reduce((value, key) => value[key], root) : root;
}
function nullPrototype(value, paths) {
  for (const path of paths) Object.setPrototypeOf(atPath(value, path), null);
  return value;
}
function numeric48(length) {
  const majorLength = length - 3;
  return `${'0'.repeat(majorLength - 1)}1.48`;
}
function objectIds(value, found = new Set()) {
  if (value === null || typeof value !== 'object' || found.has(value)) return found;
  found.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) objectIds(descriptor.value, found);
  }
  return found;
}
function assertDescriptorSnapshot(snapshot) {
  if (!snapshot) return;
  assert.equal(Object.getPrototypeOf(snapshot.value), snapshot.prototype);
  assert.deepEqual(Reflect.ownKeys(snapshot.value), snapshot.descriptors.map(({ key }) => key));
  for (const { key, descriptor: before } of snapshot.descriptors) {
    const after = Object.getOwnPropertyDescriptor(snapshot.value, key);
    assert.deepEqual(after, before);
    if (before && Object.hasOwn(before, 'value')) assertDescriptorSnapshotChild(before.value);
  }
}
function assertDescriptorSnapshotChild(value) {
  if (value && typeof value === 'object') {
    const saved = snapshotByIdentity.get(value);
    assertDescriptorSnapshot(saved);
  }
}
const snapshotByIdentity = new WeakMap();
function snapshotInput(value) {
  function build(object, seen = new Set()) {
    if (object === null || typeof object !== 'object' || seen.has(object)) return;
    seen.add(object);
    const snapshot = { value: object, prototype: Object.getPrototypeOf(object), descriptors: [] };
    snapshotByIdentity.set(object, snapshot);
    for (const key of Reflect.ownKeys(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      snapshot.descriptors.push({ key, descriptor });
      if (descriptor && Object.hasOwn(descriptor, 'value')) build(descriptor.value, seen);
    }
  }
  build(value);
  return value && typeof value === 'object' ? snapshotByIdentity.get(value) : undefined;
}

test('admits selected Linux declarations into a detached frozen DTO', () => {
  const input = valid();
  const result = admitDockerObservations(input);
  assert.deepEqual(result, success());
  assert.notEqual(result, input);
  assert.notEqual(result.admission, input.daemonObservation.daemon);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.admission));
  assert.equal([...objectIds(input)].some(id => objectIds(result).has(id)), false);
});

test('requires the fixed API within a present consistent inclusive range', () => {
  for (const [minimum, apiVersion] of [['1.48', '1.48'], ['1.24', '1.48'], ['1.24', '1.60']]) {
    assert.deepEqual(admitDockerObservations(valid({ minimum, apiVersion })), success());
  }
  for (const values of [
    { minimum: '1.49', apiVersion: '1.60' }, { minimum: '1.24', apiVersion: '1.47' },
    { minimum: '1.60', apiVersion: '1.49' }, { minimum: undefined },
  ]) {
    const input = valid(values);
    if (values.minimum === undefined) input.daemonObservation.daemon.minimumApiVersion = { kind: 'absent' };
    denied(input);
  }
});

test('tests exact numeric-version length limits independently in maximum and minimum slots', () => {
  const max32 = numeric48(32), max33 = numeric48(33);
  const min32 = numeric48(32), min33 = numeric48(33);
  assert.equal(max32.length, 32); assert.equal(max33.length, 33);
  assert.equal(min32.length, 32); assert.equal(min33.length, 33);
  assert.deepEqual(admitDockerObservations(valid({ minimum: '1.0', apiVersion: max32 })), success());
  denied(valid({ minimum: '1.0', apiVersion: max33 }));
  assert.deepEqual(admitDockerObservations(valid({ minimum: min32, apiVersion: '2.0' })), success());
  denied(valid({ minimum: min33, apiVersion: '2.0' }));
});

test('compares leading-zero and major/minor strings as numeric components', () => {
  const safeInteger = '9007199254740991', beyondSafe = '9007199254740992', nextBeyondSafe = '9007199254740993';
  assert.equal(safeInteger.length, 16); assert.equal(beyondSafe.length, 16); assert.equal(nextBeyondSafe.length, 16);
  assert.ok(beyondSafe > safeInteger); assert.ok(nextBeyondSafe > beyondSafe);
  for (const [minimum, apiVersion] of [
    ['01.048', '001.048'], ['1.9', '1.100'], ['1.48', '2.0'],
    ['1.0', `${beyondSafe}.0`], ['1.0', `${nextBeyondSafe}.0`],
    ['1.0', `1.${beyondSafe}`], ['1.0', `1.${nextBeyondSafe}`],
  ]) {
    assert.ok(minimum.length <= 32 && apiVersion.length <= 32);
    assert.deepEqual(admitDockerObservations(valid({ minimum, apiVersion })), success());
  }
  for (const [minimum, apiVersion] of [
    ['1.100', '1.100'],
    [`${beyondSafe}.0`, `${nextBeyondSafe}.0`],
    [`1.${beyondSafe}`, `1.${nextBeyondSafe}`],
  ]) {
    assert.ok(minimum.length <= 32 && apiVersion.length <= 32);
    denied(valid({ minimum, apiVersion }));
  }
});

test('rejects malformed numeric strings, non-ASCII digits, and controls in both slots', () => {
  for (const malformed of ['', '1', '1.', '.48', '1.48\n', '１.48', '1.48.0',
    '1.000000000000000000000000000000000']) denied(valid({ apiVersion: malformed }));
  for (const malformed of ['', '1', '1.', '.48', '1.48\0', '١.48', '1.48.0',
    '1.000000000000000000000000000000000']) denied(valid({ minimum: malformed }));
});

test('requires exact Linux and three-way matching architecture at length 64', () => {
  const architecture64 = 'a'.repeat(64);
  assert.equal(architecture64.length, 64);
  assert.deepEqual(admitDockerObservations(valid({
    expected: architecture64, daemonArch: architecture64, imageArch: architecture64,
  })), success(architecture64));
  for (const values of [
    { daemonOs: 'Linux' }, { imageOs: 'LINUX' }, { daemonOs: 'windows' },
    { daemonArch: 'AMD64', imageArch: 'amd64', expected: 'amd64' },
    { daemonArch: 'arm64', imageArch: 'aarch64', expected: 'arm64' },
    { daemonArch: 'arm64', imageArch: 'arm64', expected: 'aarch64' },
    { expected: '' }, { expected: 'x'.repeat(65) }, { expected: 'arm/64' }, { expected: 'arm64\n' },
    { daemonArch: 'arm64\n' }, { imageArch: 'é' },
  ]) denied(valid(values));
});

test('rejects matching length-65 architectures and each overlong selected slot', () => {
  const architecture64 = 'a'.repeat(64), architecture65 = 'a'.repeat(65);
  assert.equal(architecture65.length, 65);
  denied(valid({ expected: architecture65, daemonArch: architecture65, imageArch: architecture65 }));
  denied(valid({ expected: architecture65, daemonArch: architecture64, imageArch: architecture64 }));
  denied(valid({ expected: architecture64, daemonArch: architecture65, imageArch: architecture64 }));
  denied(valid({ expected: architecture64, daemonArch: architecture64, imageArch: architecture65 }));
  // A 65-token in any one slot also disagrees with the other two otherwise-valid 64-token declarations.
});

test('rejects malformed minimum kind/value types and failed wrappers symmetrically', () => {
  for (const mutate of [
    input => { input.daemonObservation.ok = false; }, input => { input.imageObservation.ok = false; },
    input => { delete input.daemonObservation.ok; }, input => { delete input.imageObservation.ok; },
    input => { input.daemonObservation.ok = undefined; }, input => { input.imageObservation.ok = undefined; },
    input => { input.daemonObservation.ok = 1; }, input => { input.imageObservation.ok = 'true'; },
    input => { input.daemonObservation.daemon.minimumApiVersion.kind = undefined; },
    input => { input.daemonObservation.daemon.minimumApiVersion.kind = 1; },
    input => { input.daemonObservation.daemon.minimumApiVersion.value = undefined; },
    input => { input.daemonObservation.daemon.minimumApiVersion.value = null; },
    input => { input.daemonObservation.daemon.minimumApiVersion.value = 1.48; },
  ]) { const input = valid(); mutate(input); denied(input); }
  for (const value of [undefined, null, 1, [], {}]) {
    const input = valid(); input.daemonObservation.daemon.minimumApiVersion = value; denied(input);
  }
});

test('rejects missing selected own fields and malformed root or nested records', () => {
  for (const mutate of [
    input => { delete input.daemonObservation; }, input => { delete input.imageObservation; },
    input => { delete input.policy; }, input => { delete input.daemonObservation.daemon.apiVersion; },
    input => { delete input.daemonObservation.daemon.os; },
    input => { delete input.imageObservation.image.platform.architecture; },
    input => { delete input.policy.expectedArchitecture; },
    input => { input.policy.expectedArchitecture = undefined; }, input => { input.policy.expectedArchitecture = 17; },
    input => { input.daemonObservation.daemon.apiVersion = 1.48; },
    input => { input.daemonObservation.daemon = null; }, input => { input.imageObservation.image = []; },
    input => { input.imageObservation.image.platform.architecture = null; },
    input => { input.daemonObservation.daemon.minimumApiVersion.kind = 'absent'; },
    input => { delete input.daemonObservation.daemon.minimumApiVersion; },
  ]) { const input = valid(); mutate(input); denied(input); }
  class CustomRecord {}
  const contexts = [
    '', 'daemonObservation', 'imageObservation', 'policy', 'daemonObservation.daemon',
    'imageObservation.image', 'imageObservation.image.platform', 'daemonObservation.daemon.minimumApiVersion',
  ];
  const invalidRecords = [null, [], 1, 'x', new Date(), new CustomRecord(), Object.create({ inherited: true })];
  for (const path of contexts) for (const value of invalidRecords) denied(replaceAt(valid(), path, value));
});

test('accepts null-prototype root and every selected record including the minimum', () => {
  const records = ['', 'daemonObservation', 'imageObservation', 'policy', 'daemonObservation.daemon',
    'imageObservation.image', 'imageObservation.image.platform', 'daemonObservation.daemon.minimumApiVersion'];
  assert.deepEqual(admitDockerObservations(nullPrototype(valid(), records)), success());
});

test('never invokes selected accessors across all 17 selected property slots', () => {
  let calls = 0;
  const slots = [
    ['', 'daemonObservation'], ['', 'imageObservation'], ['', 'policy'],
    ['daemonObservation', 'ok'], ['imageObservation', 'ok'],
    ['daemonObservation', 'daemon'], ['imageObservation', 'image'], ['imageObservation.image', 'platform'],
    ['daemonObservation.daemon', 'apiVersion'], ['daemonObservation.daemon', 'minimumApiVersion'],
    ['daemonObservation.daemon', 'os'], ['daemonObservation.daemon', 'architecture'],
    ['daemonObservation.daemon.minimumApiVersion', 'kind'], ['daemonObservation.daemon.minimumApiVersion', 'value'],
    ['imageObservation.image.platform', 'os'], ['imageObservation.image.platform', 'architecture'],
    ['policy', 'expectedArchitecture'],
  ];
  assert.equal(slots.length, 17);
  for (const [path, key] of slots) {
    const candidate = valid();
    const target = path ? path.split('.').reduce((value, part) => value[part], candidate) : candidate;
    Object.defineProperty(target, key, { configurable: true, get() { calls++; throw Error('must not execute'); } });
    denied(candidate);
  }
  assert.equal(calls, 0);
});

test('ignores unknown throwing getters on every selected record and unused DTO members', () => {
  let calls = 0;
  const input = valid();
  const records = [input, input.daemonObservation, input.imageObservation, input.policy,
    input.daemonObservation.daemon, input.daemonObservation.daemon.minimumApiVersion,
    input.imageObservation.image, input.imageObservation.image.platform];
  for (const [index, record] of records.entries()) {
    Object.defineProperty(record, `unselected${index}`, { configurable: true, get() { calls++; throw Error('private'); } });
  }
  const daemon = input.daemonObservation.daemon, image = input.imageObservation.image;
  for (const [record, key] of [
    [daemon, 'version'], [image, 'id'], [image, 'repoTags'],
    [image, 'repoDigests'], [image, 'user'], [image.platform, 'variant'],
  ]) {
    Object.defineProperty(record, key, {
      configurable: true, get() { calls++; throw Error('private'); },
    });
  }
  assert.deepEqual(admitDockerObservations(input), success());
  assert.equal(calls, 0);
});

test('rejects inherited selected values without claiming permitted inherited records', () => {
  const cases = [
    ['', input => Object.create(input)],
    ['daemonObservation', input => Object.create(input.daemonObservation)],
    ['imageObservation', input => Object.create(input.imageObservation)],
    ['policy', input => Object.create(input.policy)],
    ['daemonObservation.daemon', input => Object.create(input.daemonObservation.daemon)],
    ['imageObservation.image.platform', input => Object.create(input.imageObservation.image.platform)],
    ['daemonObservation.daemon.minimumApiVersion', input => Object.create(input.daemonObservation.daemon.minimumApiVersion)],
  ];
  for (const [path, make] of cases) denied(replaceAt(valid(), path, make(valid())));
  const missing = valid(); delete missing.policy.expectedArchitecture;
  denied(missing);
});

test('redacts descriptor/prototype reflection exceptions and revoked proxies', () => {
  const fixed = admitDockerObservations(null);
  assert.deepEqual(fixed, DENIAL);
  assert.equal(Object.isFrozen(fixed), true);
  for (const proxy of [
    new Proxy(valid(), { getOwnPropertyDescriptor() { throw Error('private descriptor'); } }),
    new Proxy(valid(), { getPrototypeOf() { throw Error('private prototype'); } }),
  ]) assert.equal(admitDockerObservations(proxy), fixed);
  const revoked = Proxy.revocable(valid(), {}); revoked.revoke();
  assert.equal(admitDockerObservations(revoked.proxy), fixed);
});

test('preserves ordinary valid, denied, and ignored-accessor input descriptors and values', () => {
  let getterCalls = 0;
  const validInput = valid();
  Object.defineProperty(validInput, 'ignored', { configurable: true, get() { getterCalls++; return {}; } });
  const deniedInput = valid({ imageArch: 'amd64' });
  const ignoredInput = valid();
  Object.defineProperty(ignoredInput.daemonObservation.daemon, 'unused', {
    configurable: true, get() { getterCalls++; throw Error('ignored'); },
  });
  const inputs = [validInput, deniedInput, ignoredInput];
  const snapshots = inputs.map(snapshotInput);
  const results = [admitDockerObservations(validInput), admitDockerObservations(deniedInput),
    admitDockerObservations(ignoredInput)];
  assert.deepEqual(results[0], success());
  assert.deepEqual(results[1], DENIAL);
  assert.deepEqual(results[2], success());
  snapshots.forEach(assertDescriptorSnapshot);
  assert.equal(getterCalls, 0);
  for (let index = 0; index < inputs.length; index++) {
    const inputIds = objectIds(inputs[index]), outputIds = objectIds(results[index]);
    assert.equal([...outputIds].some(id => inputIds.has(id)), false);
  }
});

test('returns fresh success objects and one identical fixed denial', () => {
  const input = valid();
  const first = admitDockerObservations(input), second = admitDockerObservations(input);
  assert.deepEqual(first, success()); assert.deepEqual(second, success());
  assert.notEqual(first, second); assert.notEqual(first.admission, second.admission);
  const badA = admitDockerObservations(null), badB = admitDockerObservations({});
  assert.equal(badA, badB); assert.deepEqual(badA, DENIAL); assert.ok(Object.isFrozen(badA));
  assert.equal(Object.hasOwn(badA, 'input'), false);
});
