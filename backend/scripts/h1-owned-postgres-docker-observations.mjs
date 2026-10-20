// Moby v28.0.0 / Engine API v1.48; strict local observation slice, not authority.
// Unknown response keys are ignored. Only known own data properties are read.
const INVALID = 'Invalid Docker observations.';
const EXPECTED = ['containerId', 'containerName', 'imageReference', 'containerLabels',
  'volumeName', 'volumeDriver', 'volumeLabels', 'dataDestination', 'bindSource', 'bindDestination'];
function fail() { throw new Error(INVALID); }
function record(value) {
  if (value === null || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  return value;
}
function own(value, key, optional = false) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) { if (optional) return undefined; fail(); }
  if (!Object.hasOwn(descriptor, 'value')) fail();
  return descriptor.value;
}
function text(value, empty = false) {
  if (typeof value !== 'string' || value.length > 4096 || (!empty && !value.length)) fail();
  return value;
}
function field(value, key) { return text(own(value, key)); }
function array(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail();
  const length = own(value, 'length');
  if (length > 128) fail();
  const result = [];
  for (let i = 0; i < length; i++) result.push(own(value, String(i)));
  return result;
}
function stringMap(value) {
  record(value);
  const keys = Reflect.ownKeys(value);
  if (keys.length > 128) fail();
  const result = {};
  for (const key of keys) {
    text(key);
    Object.defineProperty(result, key, {
      value: text(own(value, key), true), enumerable: true,
    });
  }
  return Object.freeze(result);
}
function matchingMap(observed, expected) {
  for (const key of Object.keys(expected)) {
    if (!Object.hasOwn(observed, key) || observed[key] !== expected[key]) fail();
  }
  return observed;
}
function equal(actual, expected) { if (actual !== expected) fail(); return actual; }
function containerId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) fail();
  return value.toLowerCase();
}
function absolute(value) {
  text(value);
  if (!value.startsWith('/') || value.includes('\0')) fail();
  return value; // Literal comparison only; no filesystem or canonical-path claim.
}
function timestamp(value) {
  text(value);
  // Local RFC3339 slice, with calendar validation; not a freshness check.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) fail();
  const [, year, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second) > 59 || Number(offsetHour) > 23 || Number(offsetMinute) > 59) fail();
  return value;
}
function parse(input) {
  record(input);
  const expected = record(own(input, 'expected'));
  const keys = Reflect.ownKeys(expected);
  if (keys.length !== EXPECTED.length || keys.some(key => !EXPECTED.includes(key))) fail();
  const e = {};
  for (const key of EXPECTED) e[key] = key.endsWith('Labels')
    ? stringMap(own(expected, key)) : field(expected, key);
  e.containerId = containerId(e.containerId);
  absolute(e.bindSource); absolute(e.bindDestination); absolute(e.dataDestination);
  if (e.bindDestination === e.dataDestination) fail();
  const create = record(own(input, 'createResponse'));
  equal(containerId(field(create, 'Id')), e.containerId);
  const warnings = array(own(create, 'Warnings'));
  warnings.forEach(value => text(value, true));
  if (warnings.length) fail();
  const inspect = record(own(input, 'inspectResponse'));
  const id = equal(containerId(field(inspect, 'Id')), e.containerId);
  const name = equal(field(inspect, 'Name'), e.containerName);
  const imageId = field(inspect, 'Image');
  const config = record(own(inspect, 'Config'));
  const imageReference = equal(field(config, 'Image'), e.imageReference);
  const labels = matchingMap(stringMap(own(config, 'Labels')), e.containerLabels);
  let dataMount, bootstrapMount;
  for (const raw of array(own(inspect, 'Mounts'))) {
    record(raw);
    const destination = field(raw, 'Destination');
    const type = field(raw, 'Type');
    if (!['bind', 'volume', 'image', 'tmpfs', 'npipe', 'cluster'].includes(type)) fail();
    if (destination !== e.dataDestination && destination !== e.bindDestination) continue;
    const source = field(raw, 'Source');
    const rw = own(raw, 'RW');
    if (typeof rw !== 'boolean') fail();
    if (destination === e.dataDestination) {
      if (dataMount || type !== 'volume' || rw !== true) fail();
      dataMount = Object.freeze({ type, name: equal(field(raw, 'Name'), e.volumeName), source, destination, rw });
    } else {
      if (bootstrapMount || type !== 'bind' || rw !== false) fail();
      equal(absolute(source), e.bindSource);
      bootstrapMount = Object.freeze({ type, source, destination, rw });
    }
  }
  if (!dataMount || !bootstrapMount) fail();
  const network = record(own(inspect, 'NetworkSettings'));
  const ports = record(own(network, 'Ports'));
  const bindings = array(own(ports, '5432/tcp'));
  if (bindings.length !== 1) fail();
  const binding = record(bindings[0]);
  const hostIp = equal(field(binding, 'HostIp'), '127.0.0.1');
  const hostPort = field(binding, 'HostPort');
  if (!/^[1-9][0-9]{0,4}$/.test(hostPort) || Number(hostPort) > 65535) fail();
  const volume = record(own(input, 'volumeResponse'));
  const createdAt = own(volume, 'CreatedAt', true);
  // Present undefined is malformed; absence alone yields null in the projection.
  if (Object.hasOwn(volume, 'CreatedAt') && createdAt === undefined) fail();
  return Object.freeze({
    container: Object.freeze({ id, name, imageId, imageReference, labels, dataMount,
      bootstrapMount, port: Object.freeze({ hostIp, hostPort }) }),
    volume: Object.freeze({
      name: equal(field(volume, 'Name'), e.volumeName),
      driver: equal(field(volume, 'Driver'), e.volumeDriver),
      mountpoint: field(volume, 'Mountpoint'),
      labels: matchingMap(stringMap(own(volume, 'Labels')), e.volumeLabels),
      scope: equal(field(volume, 'Scope'), 'local'), options: stringMap(own(volume, 'Options')),
      createdAt: createdAt === undefined ? null : timestamp(createdAt),
    }),
  });
}
/** Pure detached observations or a fixed Error; comparisons confer no ownership. */
export function parseDockerObservations(input) {
  try { return parse(input); } catch { throw new Error(INVALID); }
}
