import test from 'node:test';
import assert from 'node:assert/strict';
import * as parser from './h1-owned-postgres-docker-observations.mjs';

const id = 'a'.repeat(64);
function fixture() {
  return {
    expected: {
      containerId: id, containerName: '/h1', imageReference: 'postgres:17',
      containerLabels: { purpose: 'test' }, volumeName: 'data',
      volumeDriver: 'local', volumeLabels: { purpose: 'test' },
      dataDestination: '/var/lib/postgresql/data',
      bindSource: '/literal/../bootstrap', bindDestination: '/bootstrap',
    },
    createResponse: { Id: id, Warnings: [] },
    inspectResponse: {
      Id: id, Name: '/h1', Image: 'sha256:observed-image',
      Config: { Image: 'postgres:17', Labels: { purpose: 'test', extra: 'retained' } },
      Mounts: [
        { Type: 'volume', Name: 'data', Source: '/volume/data', Destination: '/var/lib/postgresql/data', RW: true },
        { Type: 'bind', Source: '/literal/../bootstrap', Destination: '/bootstrap', RW: false },
      ],
      NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }] } },
    },
    volumeResponse: {
      Name: 'data', Driver: 'local', Mountpoint: '/volume/data',
      Labels: { purpose: 'test', extra: 'retained' }, Scope: 'local', Options: {},
      CreatedAt: '2025-01-02T03:04:05Z',
    },
  };
}
const parsed = {
  container: {
    id, name: '/h1', imageId: 'sha256:observed-image', imageReference: 'postgres:17',
    labels: { purpose: 'test', extra: 'retained' },
    dataMount: { type: 'volume', name: 'data', source: '/volume/data', destination: '/var/lib/postgresql/data', rw: true },
    bootstrapMount: { type: 'bind', source: '/literal/../bootstrap', destination: '/bootstrap', rw: false },
    port: { hostIp: '127.0.0.1', hostPort: '54321' },
  },
  volume: {
    name: 'data', driver: 'local', mountpoint: '/volume/data',
    labels: { purpose: 'test', extra: 'retained' }, scope: 'local', options: {},
    createdAt: '2025-01-02T03:04:05Z',
  },
};
function frozen(value) {
  return Object.isFrozen(value) && Object.values(value).every(item =>
    item === null || typeof item !== 'object' || frozen(item));
}
function rejects(input) {
  let error;
  try { parser.parseDockerObservations(input); } catch (caught) { error = caught; }
  assert.equal(error instanceof Error && error.message === 'Invalid Docker observations.' &&
    error.cause === undefined, true, 'fixed failure');
}
test('import is an inert single-function API', () => {
  assert.equal(Object.keys(parser).join(), 'parseDockerObservations');
  assert.equal(typeof parser.parseDockerObservations, 'function');
});
test('exact detached deeply frozen observations, not authority', () => {
  const input = fixture();
  const before = JSON.stringify(input); // Only trusted synthetic fixture data.
  const output = parser.parseDockerObservations(input);
  assert.equal(JSON.stringify(output) === JSON.stringify(parsed), true, 'exact projection');
  assert.equal(frozen(output), true, 'deep freeze');
  assert.equal(JSON.stringify(input) === before, true, 'unchanged input');
  input.inspectResponse.Config.Labels.extra = 'changed';
  input.volumeResponse.Labels.extra = 'changed';
  assert.equal(output.container.labels.extra === 'retained' && output.volume.labels.extra === 'retained', true);
});
const negatives = [
  ['id mismatch', f => { f.inspectResponse.Id = 'b'.repeat(64); }],
  ['warnings ambiguity', f => { f.createResponse.Warnings = ['synthetic']; }],
  ['null warnings', f => { f.createResponse.Warnings = null; }],
  ['null labels', f => { f.volumeResponse.Labels = null; }],
  ['null port bindings', f => { f.inspectResponse.NetworkSettings.Ports['5432/tcp'] = null; }],
  ['invalid expected shape', f => { f.expected = []; }],
  ['extra expected field', f => { f.expected.owned = true; }],
  ['expected mismatch', f => { f.expected.volumeName = 'other'; }],
  ['relative source', f => { f.expected.bindSource = f.inspectResponse.Mounts[1].Source = 'relative'; }],
  ['canonicalized source mismatch', f => { f.inspectResponse.Mounts[1].Source = '/bootstrap'; }],
  ['missing mount', f => { f.inspectResponse.Mounts.pop(); }],
  ['duplicate mount', f => { f.inspectResponse.Mounts.push(f.inspectResponse.Mounts[0]); }],
  ['wrong mount type', f => { f.inspectResponse.Mounts[0].Type = 'bind'; }],
  ['wrong mount name', f => { f.inspectResponse.Mounts[0].Name = 'other'; }],
  ['wrong mount rw', f => { f.inspectResponse.Mounts[1].RW = true; }],
  ['wrong label value', f => { f.inspectResponse.Config.Labels.purpose = 'other'; }],
  ['inherited map entry', f => { f.volumeResponse.Labels = Object.create({ purpose: 'test' }); }],
  ['nonplain response', f => { f.createResponse = new Date(); }],
  ['global scope', f => { f.volumeResponse.Scope = 'global'; }],
  ['null options', f => { f.volumeResponse.Options = null; }],
  ['bad timestamp calendar', f => { f.volumeResponse.CreatedAt = '2025-02-29T00:00:00Z'; }],
  ['bad timestamp shape', f => { f.volumeResponse.CreatedAt = 'yesterday'; }],
  ['present undefined timestamp', f => { f.volumeResponse.CreatedAt = undefined; }],
  ['null timestamp', f => { f.volumeResponse.CreatedAt = null; }],
];
for (const [name, mutate] of negatives) test(name, () => {
  const input = fixture(); mutate(input); rejects(input);
});
// Each known selected field must be an own data property, not an inherited value.
const selected = [
  [f => f, ['expected', 'createResponse', 'inspectResponse', 'volumeResponse']],
  [f => f.expected, Object.keys(fixture().expected)],
  [f => f.createResponse, ['Id', 'Warnings']],
  [f => f.inspectResponse, ['Id', 'Name', 'Image', 'Config', 'Mounts', 'NetworkSettings']],
  [f => f.inspectResponse.Config, ['Image', 'Labels']],
  [f => f.inspectResponse.Mounts[0], ['Type', 'Name', 'Source', 'Destination', 'RW']],
  [f => f.inspectResponse.Mounts[1], ['Type', 'Source', 'Destination', 'RW']],
  [f => f.inspectResponse.NetworkSettings, ['Ports']],
  [f => f.inspectResponse.NetworkSettings.Ports, ['5432/tcp']],
  [f => f.inspectResponse.NetworkSettings.Ports['5432/tcp'][0], ['HostIp', 'HostPort']],
  [f => f.volumeResponse, ['Name', 'Driver', 'Mountpoint', 'Labels', 'Scope', 'Options', 'CreatedAt']],
  [f => f.inspectResponse.Config.Labels, ['purpose']],
  [f => f.volumeResponse.Labels, ['purpose']],
  [f => f.volumeResponse.Options, ['synthetic']],
];
selected.forEach(([locate, keys], group) => {
  for (const key of keys) test(`known field group ${group} ${key}`, () => {
    const input = fixture();
    let calls = 0;
    Object.defineProperty(locate(input), key, { get() { calls++; return 'synthetic'; } });
    rejects(input);
    assert.equal(calls, 0, 'getter not evaluated');
    if (key !== 'CreatedAt' && group !== 13) {
      const missing = fixture(); delete locate(missing)[key]; rejects(missing);
      const malformed = fixture(); locate(malformed)[key] = null; rejects(malformed);
    }
  });
});
for (const port of ['0', '65536', '01', '+1', '1.0', ' 1', '1e3', '', 5432]) {
  test(`reject malformed port case ${typeof port === 'number' ? 'number' : JSON.stringify(port)}`, () => {
    const f = fixture(); f.inspectResponse.NetworkSettings.Ports['5432/tcp'][0].HostPort = port; rejects(f);
  });
}
for (const bindings of [[], [{ HostIp: '0.0.0.0', HostPort: '5432' }],
  [{ HostIp: '::1', HostPort: '5432' }], [{}, {}]]) {
  test('reject ambiguous or nonloopback bindings', () => {
    const f = fixture(); f.inspectResponse.NetworkSettings.Ports['5432/tcp'] = bindings; rejects(f);
  });
}
for (const warnings of ['wrong', [1], [null], [,]]) test('reject malformed warnings', () => {
  const f = fixture(); f.createResponse.Warnings = warnings; rejects(f);
});
test('ID normalization only, image reference and observed ID remain distinct', () => {
  const f = fixture(); f.createResponse.Id = f.inspectResponse.Id = f.expected.containerId = id.toUpperCase();
  const result = parser.parseDockerObservations(f);
  assert.equal(result.container.id === id && result.container.imageId !== result.container.imageReference, true);
});
test('unknown raw getters are ignored without evaluating them', () => {
  const f = fixture(); let calls = 0;
  for (const object of [f, f.createResponse, f.inspectResponse, f.inspectResponse.Config,
    ...f.inspectResponse.Mounts, f.inspectResponse.NetworkSettings,
    f.inspectResponse.NetworkSettings.Ports, f.inspectResponse.NetworkSettings.Ports['5432/tcp'][0], f.volumeResponse]) {
    Object.defineProperty(object, 'unknown', { get() { calls++; throw new Error('synthetic'); } });
  }
  parser.parseDockerObservations(f); assert.equal(calls, 0);
});
test('own fields on null-prototype records and dangerous map keys remain data', () => {
  const f = fixture();
  f.volumeResponse = Object.assign(Object.create(null), f.volumeResponse);
  Object.defineProperty(f.volumeResponse.Options, '__proto__', { value: 'literal', enumerable: true });
  const result = parser.parseDockerObservations(f);
  assert.equal(Object.hasOwn(result.volume.options, '__proto__') && result.volume.options.__proto__ === 'literal', true);
});
test('absent timestamp and repeated same-name observations provide no ownership', () => {
  const f = fixture(); delete f.volumeResponse.CreatedAt;
  const first = parser.parseDockerObservations(f), second = parser.parseDockerObservations(f);
  assert.equal(first.volume.createdAt === null && JSON.stringify(first) === JSON.stringify(second), true);
  assert.equal(Object.keys(first.volume).join(), 'name,driver,mountpoint,labels,scope,options,createdAt');
});
test('alternate timestamps, options, port limits and unrelated mount', () => {
  for (const port of ['1', '65535']) {
    const f = fixture(); f.inspectResponse.NetworkSettings.Ports['5432/tcp'][0].HostPort = port;
    f.volumeResponse.CreatedAt = '2024-02-29T23:59:59.123456789+01:00';
    f.volumeResponse.Options = { option: 'literal' };
    f.inspectResponse.Mounts.push({ Type: 'tmpfs', Destination: '/unrelated' });
    const result = parser.parseDockerObservations(f);
    assert.equal(result.container.port.hostPort === port && result.volume.options.option === 'literal', true);
  }
});
test('array indices are own data and response shapes are not coerced', () => {
  for (const mutate of [
    f => { Object.defineProperty(f.inspectResponse.Mounts, '0', { get() { throw new Error('synthetic'); } }); },
    f => { delete f.inspectResponse.Mounts[0]; },
    f => { f.inspectResponse.Config.Labels = []; },
    f => { f.volumeResponse.Options = { key: false }; },
    f => { f.inspectResponse.Mounts[0].RW = 'true'; },
    f => { f.inspectResponse.Mounts[0].Type = 'unknown'; },
    f => { f.inspectResponse.Id = 123; },
    f => { f.createResponse.Id = 'a'.repeat(63); },
    f => { f.inspectResponse.Config.Image = 'different:tag'; },
    f => { f.expected.bindDestination = f.expected.dataDestination; },
    f => { f.volumeResponse.CreatedAt = '2025-01-02T24:00:00Z'; },
  ]) { const f = fixture(); mutate(f); rejects(f); }
});
test('local processing bounds and fixed redacted errors', () => {
  for (const mutate of [f => { f.inspectResponse.Image = 'x'.repeat(4097); },
    f => { f.volumeResponse.Options = Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`k${i}`, 'v'])); },
    f => { f.inspectResponse.Mounts = Array(129).fill(f.inspectResponse.Mounts[0]); },
    f => { f.createResponse.Id = 'synthetic-private-sentinel'; },
    f => { f.inspectResponse.Config.Labels.extra = 42; },
    f => { f.expected.containerLabels = { missing: 'test' }; },
    f => { f.createResponse = Object.create(f.createResponse); }]) {
    const f = fixture(); mutate(f); rejects(f);
  }
});
