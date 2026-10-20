const DENIAL = Object.freeze({ ok: false, error: 'Unable to admit Docker observations.' });
const API_VERSION = '1.48';
const TOKEN = /^[A-Za-z0-9._-]+$/;
const NUMERIC_VERSION = /^([0-9]+)\.([0-9]+)$/;

function reject() { throw new TypeError('rejected'); }

function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject();
  return value;
}

function ownData(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) reject();
  return descriptor.value;
}

function token(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || !TOKEN.test(value)) reject();
  return value;
}

function version(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 32) reject();
  const match = NUMERIC_VERSION.exec(value);
  if (!match) reject();
  return [match[1], match[2]];
}

function compareIntegerStrings(left, right) {
  const a = left.replace(/^0+/, '') || '0';
  const b = right.replace(/^0+/, '') || '0';
  return a.length === b.length ? (a < b ? -1 : a > b ? 1 : 0) : a.length < b.length ? -1 : 1;
}

function compareVersions(left, right) {
  return compareIntegerStrings(left[0], right[0]) || compareIntegerStrings(left[1], right[1]);
}

function compatible(input) {
  const root = record(input);
  const daemonWrapper = record(ownData(root, 'daemonObservation'));
  const imageWrapper = record(ownData(root, 'imageObservation'));
  const policy = record(ownData(root, 'policy'));
  if (ownData(daemonWrapper, 'ok') !== true || ownData(imageWrapper, 'ok') !== true) reject();

  const daemon = record(ownData(daemonWrapper, 'daemon'));
  const image = record(ownData(imageWrapper, 'image'));
  const platform = record(ownData(image, 'platform'));
  const api = version(ownData(daemon, 'apiVersion'));
  const minimum = record(ownData(daemon, 'minimumApiVersion'));
  if (ownData(minimum, 'kind') !== 'present') reject();
  const min = version(ownData(minimum, 'value'));
  const max = api;
  const fixed = version(API_VERSION);
  if (compareVersions(min, max) > 0 || compareVersions(min, fixed) > 0 || compareVersions(fixed, max) > 0) reject();

  if (ownData(daemon, 'os') !== 'linux' || ownData(platform, 'os') !== 'linux') reject();
  const expectedArchitecture = token(ownData(policy, 'expectedArchitecture'));
  const daemonArchitecture = token(ownData(daemon, 'architecture'));
  const imageArchitecture = token(ownData(platform, 'architecture'));
  if (daemonArchitecture !== expectedArchitecture || imageArchitecture !== expectedArchitecture) reject();

  return Object.freeze({ ok: true, admission: Object.freeze({
    kind: 'declared-compatible', apiVersion: API_VERSION, os: 'linux', architecture: expectedArchitecture,
  }) });
}

/**
 * Compare selected daemon and image declarations with the explicit local policy.
 * This reports declared compatibility only; it grants no operational authority.
 */
export function admitDockerObservations(input) {
  try {
    return compatible(input);
  } catch {
    return DENIAL;
  }
}
