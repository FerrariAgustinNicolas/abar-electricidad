const INVALID = 'Invalid Docker image response.';
const DENIAL = Object.freeze({ ok: false, error: INVALID });
const MAX_STRING_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 128;
const ASCII_CONTROL = /[\x00-\x1f\x7f]/;
const DIGEST_HEX = /^[0-9a-f]{64}$/;

function fail() { throw new TypeError(INVALID); }

function record(value) {
  if (value === null || typeof value !== 'object') fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  return value;
}

function selected(value, key, optional = false) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    if (optional) return { present: false, value: undefined };
    fail();
  }
  if (!Object.hasOwn(descriptor, 'value')) fail();
  return { present: true, value: descriptor.value };
}

function required(value, key) {
  return selected(value, key).value;
}

function boundedString(value, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > MAX_STRING_LENGTH ||
      (!allowEmpty && value.length === 0)) fail();
  return value;
}

function controlFree(value, allowEmpty = false) {
  const text = boundedString(value, allowEmpty);
  if (ASCII_CONTROL.test(text)) fail();
  return text;
}

function sha256Id(value) {
  const text = boundedString(value);
  if (text.length !== 71 || !text.startsWith('sha256:') || !DIGEST_HEX.test(text.slice(7))) fail();
  return text;
}

function ordinaryArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail();
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || !Object.hasOwn(length, 'value') || !Number.isInteger(length.value) ||
      length.value < 0 || length.value > MAX_ARRAY_LENGTH) fail();
  const entries = [];
  for (let index = 0; index < length.value; index++) {
    entries.push(required(value, String(index)));
  }
  return entries;
}

function optionalCollection(response, key) {
  const field = selected(response, key, true);
  if (!field.present) return { state: 'missing', values: [] };
  if (field.value === undefined) fail();
  if (field.value === null) return { state: 'null', values: [] };
  const values = ordinaryArray(field.value);
  return { state: 'present', values };
}

function projectTags(response) {
  const tags = optionalCollection(response, 'RepoTags');
  if (tags.state === 'present') {
    for (const tag of tags.values) controlFree(tag);
  }
  return { state: tags.state, count: tags.values.length };
}

function projectDigests(response) {
  const digests = optionalCollection(response, 'RepoDigests');
  const hashes = [];
  if (digests.state === 'present') {
    for (const entry of digests.values) {
      const value = boundedString(entry);
      const separator = value.indexOf('@');
      if (separator <= 0 || separator !== value.lastIndexOf('@')) fail();
      const repository = value.slice(0, separator);
      if (/[\s\x00-\x1f\x7f]/u.test(repository)) fail();
      hashes.push(sha256Id(value.slice(separator + 1)));
    }
  }
  return { state: digests.state, hashes };
}

function projectVariant(response) {
  const variant = selected(response, 'Variant', true);
  if (!variant.present || variant.value === null) return null;
  return controlFree(variant.value);
}

function projectUser(response) {
  const config = selected(response, 'Config', true);
  if (!config.present || config.value === null) return 'missing';
  const configRecord = record(config.value);
  const user = selected(configRecord, 'User', true);
  if (!user.present) return 'missing';
  if (user.value === undefined || user.value === null) fail();
  const value = controlFree(user.value, true);
  return value.length === 0 ? 'empty' : 'present';
}

function project(input) {
  const request = record(input);
  const response = record(required(request, 'imageResponse'));
  const id = sha256Id(required(response, 'Id'));
  const os = controlFree(required(response, 'Os'));
  const architecture = controlFree(required(response, 'Architecture'));
  const image = {
    id,
    repoTags: projectTags(response),
    repoDigests: projectDigests(response),
    platform: { os, architecture, variant: projectVariant(response) },
    user: projectUser(response),
  };
  Object.freeze(image.repoTags);
  Object.freeze(image.repoDigests.hashes);
  Object.freeze(image.repoDigests);
  Object.freeze(image.platform);
  Object.freeze(image);
  return Object.freeze({ ok: true, image });
}

/** Synchronously project selected Docker image fields into detached safe metadata. */
export function parseDockerImageResponse(input) {
  try {
    return project(input);
  } catch {
    return DENIAL;
  }
}
