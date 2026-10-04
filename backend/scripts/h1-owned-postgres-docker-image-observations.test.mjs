import test from 'node:test';
import assert from 'node:assert/strict';
import * as projector from './h1-owned-postgres-docker-image-observations.mjs';

const id = `sha256:${'a'.repeat(64)}`;
const repoHash = `sha256:${'b'.repeat(64)}`;
function fixture() {
  return {
    imageResponse: {
      Id: id, Os: 'unknown-os', Architecture: 'unknown-arch', Variant: 'v-custom',
      RepoTags: ['sample:latest', 'sample:stable'],
      RepoDigests: [`sample@${repoHash}`, `other@${id}`, `sample@${repoHash}`],
      Config: { User: 'service:group', Env: ['PRIVATE_SENTINEL'] },
      Unknown: 'ignored',
    },
  };
}
const expectedImage = {
  id,
  repoTags: { state: 'present', count: 2 },
  repoDigests: { state: 'present', hashes: [repoHash, id, repoHash] },
  platform: { os: 'unknown-os', architecture: 'unknown-arch', variant: 'v-custom' },
  user: 'present',
};
function frozenDeep(value) {
  return value === null || typeof value !== 'object' ||
    (Object.isFrozen(value) && Reflect.ownKeys(value).every(key => frozenDeep(value[key])));
}
function denied(input) {
  const result = projector.parseDockerImageResponse(input);
  assert.deepEqual(result, { ok: false, error: 'Invalid Docker image response.' });
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Reflect.ownKeys(result), ['ok', 'error']);
  assert.equal(frozenDeep(result), true);
}
function success(input = fixture()) {
  const result = projector.parseDockerImageResponse(input);
  assert.equal(result.ok, true);
  return result;
}
function setAccessor(object, key, getter = () => { throw new Error('SYNTHETIC_SECRET'); }) {
  Object.defineProperty(object, key, { configurable: true, get: getter });
}
test('exports one synchronous projector and succeeds with exact detached frozen DTO', () => {
  assert.deepEqual(Object.keys(projector), ['parseDockerImageResponse']);
  const input = fixture();
  const before = structuredClone(input);
  const output = success(input);
  assert.deepEqual(output, { ok: true, image: expectedImage });
  assert.deepEqual(Reflect.ownKeys(output), ['ok', 'image']);
  assert.deepEqual(Reflect.ownKeys(output.image), ['id', 'repoTags', 'repoDigests', 'platform', 'user']);
  assert.equal(frozenDeep(output), true);
  assert.deepEqual(input, before);
  assert.notEqual(output.image, input.imageResponse);
  assert.notEqual(output.image.repoDigests.hashes, input.imageResponse.RepoDigests);
  input.imageResponse.RepoTags[0] = 'changed';
  input.imageResponse.Config.User = 'changed';
  assert.deepEqual(output.image, expectedImage);
});
test('minimum required fields and null-prototype input/response records are accepted', () => {
  const imageResponse = Object.assign(Object.create(null), { Id: id, Os: 'os', Architecture: 'arch' });
  const input = Object.assign(Object.create(null), { imageResponse });
  assert.deepEqual(success(input), {
    ok: true,
    image: {
      id, repoTags: { state: 'missing', count: 0 },
      repoDigests: { state: 'missing', hashes: [] },
      platform: { os: 'os', architecture: 'arch', variant: null }, user: 'missing',
    },
  });
});
test('optional missing, null, and empty arrays remain distinct', () => {
  const missing = fixture();
  delete missing.imageResponse.RepoTags;
  delete missing.imageResponse.RepoDigests;
  delete missing.imageResponse.Variant;
  delete missing.imageResponse.Config;
  assert.deepEqual(success(missing).image, {
    id, repoTags: { state: 'missing', count: 0 },
    repoDigests: { state: 'missing', hashes: [] },
    platform: { os: 'unknown-os', architecture: 'unknown-arch', variant: null }, user: 'missing',
  });
  const nulls = fixture();
  Object.assign(nulls.imageResponse, { RepoTags: null, RepoDigests: null, Variant: null, Config: null });
  assert.deepEqual(success(nulls).image, {
    id, repoTags: { state: 'null', count: 0 }, repoDigests: { state: 'null', hashes: [] },
    platform: { os: 'unknown-os', architecture: 'unknown-arch', variant: null }, user: 'missing',
  });
  const empty = fixture();
  Object.assign(empty.imageResponse, { RepoTags: [], RepoDigests: [], Variant: '' });
  denied(empty);
  empty.imageResponse.Variant = null;
  assert.deepEqual(success(empty).image.repoTags, { state: 'present', count: 0 });
  assert.deepEqual(success(empty).image.repoDigests, { state: 'present', hashes: [] });
});
test('repository hashes need not equal image Id and preserve order and duplicates', () => {
  const output = success();
  assert.notEqual(output.image.id, output.image.repoDigests.hashes[0]);
  assert.deepEqual(output.image.repoDigests.hashes, [repoHash, id, repoHash]);
});
test('Config User projects missing, empty, or present categories only', () => {
  const input = fixture();
  delete input.imageResponse.Config.User;
  assert.equal(success(input).image.user, 'missing');
  input.imageResponse.Config.User = '';
  assert.equal(success(input).image.user, 'empty');
  input.imageResponse.Config.User = 'a'.repeat(4096);
  assert.equal(success(input).image.user, 'present');
});
test('unknown keys and getters are ignored without enumeration or value access', () => {
  const input = fixture();
  let calls = 0;
  for (const object of [input, input.imageResponse, input.imageResponse.Config]) {
    setAccessor(object, 'unknown', () => { calls++; throw new Error('SYNTHETIC_SECRET'); });
  }
  assert.equal(success(input).ok, true);
  assert.equal(calls, 0);
});

test('selected accessors are rejected without invoking their getters', () => {
  const cases = [
    [f => f, 'imageResponse'],
    [f => f.imageResponse, 'Id'], [f => f.imageResponse, 'Os'],
    [f => f.imageResponse, 'Architecture'], [f => f.imageResponse, 'RepoTags'],
    [f => f.imageResponse, 'RepoDigests'], [f => f.imageResponse, 'Variant'],
    [f => f.imageResponse, 'Config'], [f => f.imageResponse.Config, 'User'],
  ];
  for (const [locate, key] of cases) {
    const input = fixture(); let calls = 0;
    setAccessor(locate(input), key, () => { calls++; return 'SYNTHETIC_SECRET'; });
    denied(input);
    assert.equal(calls, 0);
  }
});
test('required and optional selected properties reject present undefined', () => {
  for (const [key, locate] of [
    ['imageResponse', f => f], ['Id', f => f.imageResponse], ['Os', f => f.imageResponse],
    ['Architecture', f => f.imageResponse], ['RepoTags', f => f.imageResponse],
    ['RepoDigests', f => f.imageResponse], ['Variant', f => f.imageResponse],
    ['Config', f => f.imageResponse],
  ]) {
    const input = fixture();
    if (key === 'imageResponse') input.imageResponse = undefined;
    else locate(input)[key] = undefined;
    denied(input);
  }
  const input = fixture(); input.imageResponse.Config.User = undefined; denied(input);
});
test('missing required and inherited fields do not satisfy the contract', () => {
  for (const key of ['imageResponse']) {
    const input = fixture(); delete input[key]; denied(input);
  }
  for (const key of ['Id', 'Os', 'Architecture']) {
    const input = fixture(); delete input.imageResponse[key]; denied(input);
    const inherited = fixture();
    const response = inherited.imageResponse;
    delete response[key]; Object.setPrototypeOf(response, { [key]: key === 'Id' ? id : 'value' });
    denied(inherited);
  }
  const inheritedInput = Object.assign(Object.create({ imageResponse: fixture().imageResponse }), {});
  denied(inheritedInput);
});

test('inherited selected fields never satisfy required or optional own-property checks', () => {
  const cases = [
    { key: 'imageResponse', make: fixture, nested: false, path: 'imageResponse' },
    { key: 'Id', make: fixture, nested: true, path: 'imageResponse' },
    { key: 'Os', make: fixture, nested: true, path: 'imageResponse' },
    { key: 'Architecture', make: fixture, nested: true, path: 'imageResponse' },
  ];
  for (const { key, make, nested, path } of cases) {
    const input = make();
    const intendedOwner = nested ? input.imageResponse : input;
    const inheritedValue = key === 'imageResponse' ? fixture().imageResponse :
      key === 'Id' ? id : 'inherited-value';
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, value: inheritedValue });
      const actualOwner = nested ? intendedOwner : input;
      delete actualOwner[key];
      assert.equal(Object.hasOwn(input, 'imageResponse'), nested, 'wrapper ownership invariant');
      assert.equal(Object.hasOwn(intendedOwner, key), false, 'selected owner lacks own field');
      assert.equal(intendedOwner[key], inheritedValue, 'inherited selected value is available');
      denied(input);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, key, previous);
      else delete Object.prototype[key];
    }
  }
  const input = fixture(); delete input.imageResponse.Config.User;
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'User');
  try {
    Object.defineProperty(Object.prototype, 'User', { configurable: true, value: 'inherited-value' });
    assert.equal(success(input).image.user, 'missing');
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'User', previous);
    else delete Object.prototype.User;
  }
});

test('records must be plain or null-prototype and input property must be own data', () => {
  for (const input of [null, undefined, 1, 'x', [], new Date(), Object.create({})]) denied(input);
  const inputAccessor = {}; setAccessor(inputAccessor, 'imageResponse'); denied(inputAccessor);
  for (const response of [null, [], new Date(), Object.create({})]) {
    const input = fixture(); input.imageResponse = response; denied(input);
  }
  const config = fixture(); config.imageResponse.Config = []; denied(config);
});

test('ordinary arrays must be dense own-data arrays and bounded to 128 entries', () => {
  for (const mutate of [
    f => { f.imageResponse.RepoTags = Array(1); },
    f => { Object.defineProperty(f.imageResponse.RepoTags, '0', { get() { throw new Error('SYNTHETIC_SECRET'); } }); },
    f => { Object.setPrototypeOf(f.imageResponse.RepoTags, { 0: 'inherited:tag' }); },
    f => { f.imageResponse.RepoTags = new Array(129).fill('tag'); },
    f => { f.imageResponse.RepoTags = ['tag', ...Array(128).fill('tag')]; },
  ]) {
    const input = fixture(); mutate(input); denied(input);
  }
  const atLimit = fixture(); atLimit.imageResponse.RepoTags = Array(128).fill('tag');
  assert.equal(success(atLimit).image.repoTags.count, 128);
  atLimit.imageResponse.RepoDigests = Array(128).fill(`repo@${repoHash}`);
  assert.equal(success(atLimit).image.repoDigests.hashes.length, 128);
});
test('accessor array indices are denied without invoking the getter', () => {
  const input = fixture();
  let getterCalls = 0;
  const tags = ['tag'];
  Object.defineProperty(tags, '0', { configurable: true, get() { getterCalls++; return 'synthetic'; } });
  input.imageResponse.RepoTags = tags;
  denied(input);
  assert.equal(getterCalls, 0);
});

test('unknown enumerable and symbol properties on arrays do not become DTO values', () => {
  const input = fixture(); let calls = 0;
  Object.defineProperty(input.imageResponse.RepoTags, 'extra', { get() { calls++; throw new Error('SYNTHETIC_SECRET'); } });
  Object.defineProperty(input.imageResponse.RepoTags, Symbol('unknown'), { get() { calls++; throw new Error('SYNTHETIC_SECRET'); } });
  assert.equal(success(input).image.repoTags.count, 2);
  assert.equal(calls, 0);
});

test('strings accept 4096 UTF-16 units and reject 4097 or ASCII controls', () => {
  for (const [mutate, check] of [
    [f => { f.imageResponse.Os = 'o'.repeat(4096); }, r => r.image.platform.os.length === 4096],
    [f => { f.imageResponse.Architecture = 'a'.repeat(4096); }, r => r.image.platform.architecture.length === 4096],
    [f => { f.imageResponse.Variant = 'v'.repeat(4096); }, r => r.image.platform.variant.length === 4096],
    [f => { f.imageResponse.RepoTags = ['t'.repeat(4096)]; }, r => r.image.repoTags.count === 1],
    [f => { f.imageResponse.Config.User = 'u'.repeat(4096); }, r => r.image.user === 'present'],
  ]) { const input = fixture(); mutate(input); assert.equal(check(success(input)), true); }
  for (const mutate of [
    f => { f.imageResponse.Os = 'o'.repeat(4097); },
    f => { f.imageResponse.Architecture = 'a'.repeat(4097); },
    f => { f.imageResponse.Variant = 'v'.repeat(4097); },
    f => { f.imageResponse.RepoTags = ['t'.repeat(4097)]; },
    f => { f.imageResponse.Config.User = 'u'.repeat(4097); },
    f => { f.imageResponse.Os = ''; }, f => { f.imageResponse.Architecture = ''; },
    f => { f.imageResponse.Variant = ''; },
    f => { f.imageResponse.Os = 'os\n'; }, f => { f.imageResponse.Architecture = 'arch\0'; },
    f => { f.imageResponse.Variant = 'v\x7f'; }, f => { f.imageResponse.Config.User = 'x\r'; },
    f => { f.imageResponse.RepoTags = ['']; }, f => { f.imageResponse.RepoTags = ['tag\t']; },
  ]) { const input = fixture(); mutate(input); denied(input); }
});

test('image Id requires exact lowercase sha256 and exact length', () => {
  for (const bad of [
    `SHA256:${'a'.repeat(64)}`, `sha256:${'A'.repeat(64)}`, `sha256:${'a'.repeat(63)}`,
    `${id}\n`, `${id}\r`, `${id} `, ` ${id}`, `sha256:${'a'.repeat(65)}`,
    `sha256:${'g'.repeat(64)}`, 'sha256:', null, 1,
  ]) { const input = fixture(); input.imageResponse.Id = bad; denied(input); }
});
test('RepoDigests require one @, valid prefix and exact lowercase hash suffix', () => {
  const valid = fixture(); valid.imageResponse.RepoDigests = ['repo/path@' + repoHash];
  assert.deepEqual(success(valid).image.repoDigests.hashes, [repoHash]);
  for (const value of [
    '@' + repoHash, 'repo@', 'repo@@' + repoHash, 'repo @' + repoHash,
    'repo\tname@' + repoHash, 'repo\nname@' + repoHash, 'repo\0name@' + repoHash,
    'repo@' + repoHash.toUpperCase(), 'repo@' + repoHash + '\n',
    'repo@SHA256:' + 'a'.repeat(64), 'repo@sha256:' + 'a'.repeat(63),
    'repo@sha256:' + 'g'.repeat(64), '', 1, null,
  ]) { const input = fixture(); input.imageResponse.RepoDigests = [value]; denied(input); }
});
test('RepoDigests enforce 128-entry and whole-entry UTF-16 boundaries', () => {
  const atLimit = fixture();
  atLimit.imageResponse.RepoDigests = Array.from({ length: 128 }, (_, index) =>
    `${index % 2 === 0 ? 'repo' : 'other'}@${index % 2 === 0 ? repoHash : id}`);
  const projected = success(atLimit).image.repoDigests.hashes;
  assert.equal(projected.length, 128);
  assert.deepEqual(projected.slice(0, 4), [repoHash, id, repoHash, id]);

  const tooMany = fixture();
  tooMany.imageResponse.RepoDigests = Array.from({ length: 129 }, () => `repo@${repoHash}`);
  denied(tooMany);

  const makeEntry = length => `${'r'.repeat(length - 72)}@${repoHash}`;
  const entryAtLimit = makeEntry(4096);
  assert.equal(entryAtLimit.length, 4096);
  const accepted = fixture(); accepted.imageResponse.RepoDigests = [entryAtLimit];
  assert.deepEqual(success(accepted).image.repoDigests.hashes, [repoHash]);

  const entryOverLimit = makeEntry(4097);
  assert.equal(entryOverLimit.length, 4097);
  const rejected = fixture(); rejected.imageResponse.RepoDigests = [entryOverLimit];
  denied(rejected);
});

test('RepoTags and RepoDigests reject non-string entries and malformed containers', () => {
  for (const value of [undefined, 'tag', {}, new Date(), [1], [null], [undefined]]) {
    const input = fixture(); input.imageResponse.RepoTags = value; denied(input);
  }
  for (const value of [undefined, 'repo@' + repoHash, {}, new Date(), [1], [null], [undefined]]) {
    const input = fixture(); input.imageResponse.RepoDigests = value; denied(input);
  }
});
test('reflective Proxy traps become fixed frozen denials without leaking details', () => {
  const sentinel = 'SYNTHETIC_PROXY_PRIVATE_SENTINEL';
  const input = fixture();
  input.imageResponse = new Proxy(input.imageResponse, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'Id') throw new Error(sentinel);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  let result;
  assert.doesNotThrow(() => { result = projector.parseDockerImageResponse(input); });
  assert.deepEqual(result, { ok: false, error: 'Invalid Docker image response.' });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes(sentinel), false);
});

test('Config User and Config reject malformed selected shapes without leaking input', () => {
  for (const user of [null, undefined, 0, false, {}, [], 'x\n']) {
    const input = fixture(); input.imageResponse.Config.User = user; denied(input);
  }
  for (const config of [undefined, 0, false, '', [], new Date()]) {
    const input = fixture(); input.imageResponse.Config = config; denied(input);
  }
  const secret = fixture(); secret.imageResponse.Config.User = 'PRIVATE_SENTINEL';
  secret.imageResponse.Id = 'PRIVATE_SENTINEL';
  const result = projector.parseDockerImageResponse(secret);
  assert.deepEqual(result, { ok: false, error: 'Invalid Docker image response.' });
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
});

test('every invalid response is a fixed nonthrowing denial without input mutation', () => {
  for (const input of [undefined, {}, { imageResponse: null }, { imageResponse: { Id: 'secret' } }]) {
    const before = input && structuredClone(input);
    assert.doesNotThrow(() => denied(input));
    if (input) assert.deepEqual(input, before);
  }
});
