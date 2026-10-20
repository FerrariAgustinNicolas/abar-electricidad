import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, lstat, readdir, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { observeDockerImage } from './h1-owned-postgres-docker-transport.mjs';

const builtinHttp = createRequire(import.meta.url)('node:http');

const DENIAL = { ok: false, error: 'Unable to observe Docker image.' };
const id = `sha256:${'a'.repeat(64)}`;
const response = { Id: id, Os: 'linux', Architecture: 'amd64', Config: { User: '1000:1000', Env: ['PRIVATE_SENTINEL'] } };
const json = value => JSON.stringify(value);

const bounded = (promise, label, ms = 1500) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
};
const finiteTest = (name, fn) => test(name, { timeout: 10000 }, fn);

function trackOperation(state, label, operation, onValue) {
  const pending = Promise.resolve(operation).then(value => { onValue?.(value); return value; });
  state.pending.set(pending, label);
  pending.then(() => state.pending.delete(pending), () => state.pending.delete(pending));
  return pending;
}
function beginOperation(state, label, start, onValue) {
  state.operationStarts.push(label);
  let operation;
  try { operation = start(); } catch (error) { operation = Promise.reject(error); }
  return trackOperation(state, label, operation, onValue);
}
async function awaitGate(state, name) {
  const gate = state.controls[name];
  if (gate) await bounded(trackOperation(state, name, gate()), name);
  if (state.closing) throw new Error('fixture setup cancelled');
}
async function awaitOperation(state, label, start, onValue) {
  const deadline = state.cleanupDeadline ?? state.setupDeadline;
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error(`${label} exceeded shared fixture budget`);
  return bounded(beginOperation(state, label, start, onValue), label, Math.min(1500, remaining));
}

function beginFixture(t, respond = (_request, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json(response)) });
  res.end(json(response));
}, controls = {}) {
  const state = {
    controls, handler: respond, controller: new AbortController(), setupDeadline: performance.now() + 8000,
    closing: false, cleaned: false, cleanupPromise: null,
    cleanupAttempts: 0, unresolvedFailure: null, cleanupContractFailure: null, setupDone: false, setupTask: null,
    setupError: null, handlerError: null, directory: null, directoryIdentity: null,
    socketPath: null, socketIdentity: null, server: null, serverCloseObserved: false,
    listenStarted: false, listenSettled: false, listenStarts: 0, socketCaptureTask: null, peerObjects: [], peers: new Set(),
    peerClosures: [], peerCloseReceipts: [], responses: [], timers: new Set(), requests: [], pending: new Map(), nextOperation: 0,
    operationStarts: [],
    testOperations: { unlink: 0, rmdir: 0 },
  };
  const api = {
    get directory() { return state.directory; }, get directoryIdentity() { return state.directoryIdentity; },
    get socketPath() { return state.socketIdentity ? state.socketPath : undefined; },
    get requestedSocketPath() { return state.socketPath; }, get socketIdentity() { return state.socketIdentity; },
    get testOperations() { return state.testOperations; }, get controls() { return state.controls; },
    get requests() { return state.requests; }, get peers() { return state.peers; },
    get peerObjects() { return state.peerObjects; }, get peerClosures() { return state.peerClosures; },
    get peerCloseReceipts() { return state.peerCloseReceipts; }, get responses() { return state.responses; },
    get timers() { return state.timers; }, get setupError() { return state.setupError; },
    get pendingOperations() { return [...state.pending.values()]; }, get operationStarts() { return state.operationStarts; },
    get listenStarts() { return state.listenStarts; }, get handlerError() { return state.handlerError; },
    get serverCloseObserved() { return state.serverCloseObserved; },
    closed() { return state.peers.size === 0; },
    ready: null,
    cancel() { state.closing = true; state.controller.abort(); },
    cleanup() { return cleanupFixture(state); },
    async waitForPeers() {
      await bounded(Promise.all(state.peerClosures), 'owned peer close');
      assert.equal(state.peers.size, 0, 'peer close must precede fixture teardown');
      if (state.handlerError) throw new Error(`owned fixture handler failed: ${state.handlerError}`);
    },
    async observe(input) { const result = await observeDockerImage(input); await api.waitForPeers(); return result; },
  };
  // Ownership cleanup is registered before mkdtemp/listen/filesystem work starts.
  t.after(async () => {
    if (state.unresolvedFailure) throw new Error(`owned fixture requires STOP: ${state.unresolvedFailure}`);
    if (state.cleanupAttempts && !state.cleaned) throw new Error('owned fixture cleanup was attempted but remains unresolved');
    const result = await bounded(cleanupFixture(state), 'fixture cleanup after hook', 8000);
    if (result.result !== 'removed') throw new Error(`owned fixture not removed: ${result.reason}`);
    if (state.cleanupContractFailure) throw new Error(state.cleanupContractFailure);
  });
  state.setupTask = setupFixture(state).catch(error => {
    state.setupError = error.message === 'fixture setup cancelled'
      ? 'fixture-setup-cancelled' : (error.code || error.name || 'fixture-setup-error');
    return state;
  }).finally(() => { state.setupDone = true; });
  state.ready = state.setupTask;
  api.ready = state.ready;
  return api;
}

async function fixture(t, respond, controls) {
  const local = beginFixture(t, respond, controls);
  await bounded(local.ready, 'fixture readiness', 8000);
  if (local.setupError) throw new Error(`owned fixture setup failed: ${local.setupError}`);
  return local;
}

function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}
function ensureSetupOpen(state) {
  if (state.closing) throw new Error('fixture setup cancelled');
}
async function setupFixture(state) {
  await awaitGate(state, 'beforeMkdtemp');
  ensureSetupOpen(state);
  const directoryOperation = beginOperation(state, 'mkdtemp', () => mkdtemp('/tmp/h1-c13-'), value => { state.directory = value; });
  state.directory = await bounded(directoryOperation, 'owned mkdtemp');
  ensureSetupOpen(state);
  const stat = await awaitOperation(state, 'directory identity', () => lstat(state.directory), value => { state.directoryIdentity = value; });
  ensureSetupOpen(state);
  console.log(`# C13_FIXTURE_CREATED pid=${process.pid} ppid=${process.ppid} start=${process.hrtime.bigint()} dir=${state.directory} dev=${stat.dev} ino=${stat.ino}`);
  await awaitOperation(state, 'private mode', async () => {
    await chmod(state.directory, 0o700);
    const hold = state.controls.holdPrivateModeCompletion;
    if (hold) {
      hold.afterChmod();
      await bounded(hold.release.promise, 'controlled private-mode completion');
    }
  });
  ensureSetupOpen(state);
  const mode = await awaitOperation(state, 'private mode check', () => lstat(state.directory));
  assert.equal(mode.dev, stat.dev); assert.equal(mode.ino, stat.ino); assert.equal(mode.mode & 0o777, 0o700);
  ensureSetupOpen(state);

  state.server = createServer((request, res) => {
    const responseReceipt = { socket: request.socket, finished: false };
    state.responses.push(responseReceipt);
    res.once('finish', () => { responseReceipt.finished = true; });
    state.requests.push({ method: request.method, url: request.url, headers: request.headers });
    try { (state.controls.handler || state.handler)(request, res, state.peers, state.peerClosures, state.timers); }
    catch (error) { state.handlerError = error.code || error.name || 'fixture-handler-error'; try { res.destroy(); } catch {} }
  });
  state.server.on('error', error => { state.serverError = error.code || error.name || 'fixture-server-error'; });
  state.serverClosePromise = new Promise(resolve => state.server.once('close', () => {
    state.serverCloseObserved = true; state.serverListening = false; resolve();
  }));
  state.server.on('connection', socket => {
    state.peers.add(socket); state.peerObjects.push(socket);
    state.peerClosures.push(new Promise(resolve => socket.once('close', hadError => {
      const responseReceipt = state.responses.find(item => item.socket === socket);
      state.peerCloseReceipts.push({ writableEnded: socket.writableEnded, readableEnded: socket.readableEnded, hadError, responseFinished: responseReceipt?.finished ?? null });
      state.peers.delete(socket);
      for (const timer of state.timers) { clearTimeout(timer); clearInterval(timer); }
      state.timers.clear(); resolve();
    })));
  });
  state.socketPath = join(state.directory, 's');
  await awaitGate(state, 'beforeListen');
  ensureSetupOpen(state);
  state.listenStarted = true; state.listenStarts++;
  const listenOperation = beginOperation(state, 'server.listen', () => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return; settled = true; state.listenSettled = true;
      if (error) reject(error); else resolve();
    };
    state.server.once('error', error => finish(error));
    state.server.once('close', () => { if (!settled) finish(new Error('server closed before listening')); });
    state.server.once('listening', () => {
      state.serverListening = true;
      if (!state.closing) state.socketCaptureTask = beginOperation(state, 'socket identity', () => lstat(state.socketPath), value => {
        state.socketIdentity = { dev: value.dev, ino: value.ino };
      });
    });
    try {
      state.server.listen({ path: state.socketPath, signal: state.controller.signal }, () => { finish(); });
      state.controls.onListenInvoked?.();
    } catch (error) { finish(error); }
  }));
  await bounded(listenOperation, 'owned Unix listen');
  ensureSetupOpen(state);
  if (!state.socketCaptureTask) throw new Error('fixture listening identity was not captured');
  const socket = await bounded(state.socketCaptureTask, 'socket identity');
  ensureSetupOpen(state);
  console.log(`# C13_FIXTURE_SOCKET pid=${process.pid} path=${state.socketPath} dev=${socket.dev} ino=${socket.ino}`);
  await awaitGate(state, 'afterSocketCaptured');
  ensureSetupOpen(state);
}

async function cleanupFixture(state) {
  if (state.cleaned) return { result: 'removed', reason: 'already-removed' };
  if (state.cleanupPromise) return state.cleanupPromise;
  if (state.unresolvedFailure) return { result: 'preserved', reason: state.unresolvedFailure };
  state.cleanupAttempts++;
  state.cleanupDeadline = performance.now() + 7000;
  state.cleanupPromise = (async () => {
    state.closing = true;
    if (!state.controller.signal.aborted) state.controller.abort();
    const issues = [];
    const unobservedPeerCount = state.peers.size;
    for (const timer of state.timers) { clearTimeout(timer); clearInterval(timer); }
    state.timers.clear();
    for (const peer of state.peers) peer.destroy();

    if (state.listenStarted && !state.serverCloseObserved && state.server?.listening) {
      try {
        await awaitOperation(state, 'server.close', () => new Promise((resolve, reject) => {
          state.server.close(error => error ? reject(error) : resolve());
        }));
      } catch (error) { if (!state.serverCloseObserved) issues.push(`server-close-call:${error.code || error.name}`); }
    }
    if (state.listenStarted && !state.serverCloseObserved) {
      try { await bounded(state.serverClosePromise, 'owned server close event', Math.min(1500, state.cleanupDeadline - performance.now())); }
      catch (error) { issues.push(`server-close-event:${error.code || error.name}`); }
    }
    if (state.setupTask && !state.setupDone) {
      try { await bounded(state.setupTask, 'fixture setup drain', Math.min(1500, state.cleanupDeadline - performance.now())); }
      catch (error) { issues.push(`setup-pending:${state.pending.size}:${error.name}`); }
    }
    if (state.pending.size) {
      try { await bounded(Promise.allSettled([...state.pending.keys()]), 'owned operations drain', Math.min(1500, state.cleanupDeadline - performance.now())); }
      catch { issues.push(`operations-pending:${[...state.pending.values()].join('|')}`); }
    }
    if (state.peers.size) {
      try { await bounded(Promise.all(state.peerClosures), 'owned peer drain', Math.min(1500, state.cleanupDeadline - performance.now())); }
      catch { issues.push(`peers-pending:${state.peers.size}`); }
    }
    if (unobservedPeerCount && state.peers.size === 0) {
      state.cleanupContractFailure = `fixture teardown had to destroy ${unobservedPeerCount} peer(s) before closure`;
    }
    if (state.server && !state.listenStarted && state.server.listening) issues.push('unexpected-listener-state');
    if (state.pending.size || !state.directory && [...issues].some(item => item.startsWith('setup-pending'))) {
      const reason = issues.join(',') || `operations-pending:${[...state.pending.values()].join('|')}`;
      console.log(`# C13_FIXTURE_CLEANUP pid=${process.pid} dir=${state.directory || 'not-created'} socket=${socketReceiptLabel(state)} result=pending reason=${reason}`);
      return { result: 'preserved', reason };
    }
    if (issues.some(item => item.startsWith('server-close') || item.startsWith('setup-pending') || item.startsWith('operations-pending') || item.startsWith('peers-pending'))) {
      const reason = issues.join(',') + `;pending=${[...state.pending.values()].join('|')}`;
      console.log(`# C13_FIXTURE_CLEANUP pid=${process.pid} dir=${state.directory || 'not-created'} socket=${socketReceiptLabel(state)} result=preserved reason=${reason}`);
      return { result: 'preserved', reason };
    }

    if (!state.directory) {
      state.cleaned = true;
      console.log(`# C13_FIXTURE_CLEANUP pid=${process.pid} dir=not-created socket=not-created result=removed reason=${state.setupError || 'cancelled-before-create'}`);
      return { result: 'removed', reason: state.setupError || 'cancelled-before-create' };
    }
    if (!state.directoryIdentity) {
      const identity = await awaitOperation(state, 'cleanup directory identity', () => lstat(state.directory), value => { state.directoryIdentity = value; });
      if (!identity.isDirectory()) issues.push('created-path-not-directory');
    }
    const actualDirectory = await awaitOperation(state, 'cleanup directory verify', () => lstat(state.directory));
    const viewedDirectory = state.controls.directoryIdentityView?.(actualDirectory) || actualDirectory;
    if (!state.directoryIdentity || actualDirectory.dev !== state.directoryIdentity.dev || actualDirectory.ino !== state.directoryIdentity.ino ||
        viewedDirectory.dev !== state.directoryIdentity.dev || viewedDirectory.ino !== state.directoryIdentity.ino) {
      issues.push('directory-identity-mismatch');
    }
    if (issues.includes('directory-identity-mismatch')) {
      if (!state.controls.directoryIdentityView) state.unresolvedFailure = 'actual-directory-identity-mismatch';
      return cleanupReceipt(state, issues);
    }

    const entries = await awaitOperation(state, 'cleanup entries', () => readdir(state.directory));
    const viewedEntries = state.controls.entriesView?.(entries) || entries;
    const unexpected = viewedEntries.filter(entry => entry !== 's');
    if (unexpected.length) issues.push(`unexpected-entries:${unexpected.length}`);
    if (issues.some(issue => issue.startsWith('unexpected-entries'))) {
      if (!state.controls.entriesView) state.unresolvedFailure = 'actual-unexpected-directory-entry';
      return cleanupReceipt(state, issues);
    }

    if (entries.includes('s')) {
      if (!state.socketIdentity) issues.push('socket-identity-unavailable');
      else {
        const actualSocket = await awaitOperation(state, 'cleanup socket verify', () => lstat(state.socketPath));
        const viewedSocket = state.controls.socketIdentityView?.(actualSocket) || actualSocket;
        if (actualSocket.dev !== state.socketIdentity.dev || actualSocket.ino !== state.socketIdentity.ino ||
            viewedSocket.dev !== state.socketIdentity.dev || viewedSocket.ino !== state.socketIdentity.ino) issues.push('socket-identity-mismatch');
        else {
          state.testOperations.unlink++;
          await awaitOperation(state, 'owned socket unlink', () => unlink(state.socketPath));
        }
      }
    }
    if (issues.some(issue => issue.startsWith('socket-identity'))) {
      if (!state.controls.socketIdentityView) state.unresolvedFailure = 'actual-socket-identity-mismatch';
      return cleanupReceipt(state, issues);
    }
    const finalEntries = await awaitOperation(state, 'final cleanup entries', () => readdir(state.directory));
    const finalDirectory = await awaitOperation(state, 'final directory identity', () => lstat(state.directory));
    if (finalDirectory.dev !== state.directoryIdentity.dev || finalDirectory.ino !== state.directoryIdentity.ino) issues.push('directory-identity-mismatch');
    if (finalEntries.length) issues.push(`unexpected-entries:${finalEntries.length}`);
    if (issues.length) return cleanupReceipt(state, issues);
    state.testOperations.rmdir++;
    await awaitOperation(state, 'owned empty directory removal', () => rmdir(state.directory));
    state.cleaned = true;
    return cleanupReceipt(state, [], 'removed');
  })();
  try { return await state.cleanupPromise; }
  catch (error) {
    const reason = `cleanup-error:${error.code || error.name || 'unknown'};pending=${[...state.pending.values()].join('|') || 'none'}`;
    state.unresolvedFailure = reason;
    return cleanupReceipt(state, [reason], 'preserved');
  } finally { state.cleanupPromise = null; }
}

function socketReceiptLabel(state) {
  return state.socketIdentity ? state.socketPath : (state.listenStarted ? 'identity-unavailable' : 'not-created');
}
function cleanupReceipt(state, issues, forcedResult) {
  const result = forcedResult || (issues.length ? 'preserved' : 'removed');
  const reason = issues.join(',') || 'exact-owned-resources-removed';
  const pending = [...state.pending.values()].join('|') || 'none';
  const socketReceipt = socketReceiptLabel(state);
  console.log(`# C13_FIXTURE_CLEANUP pid=${process.pid} dir=${state.directory || 'not-created'} dirDev=${state.directoryIdentity?.dev ?? 'unavailable'} dirIno=${state.directoryIdentity?.ino ?? 'unavailable'} socket=${socketReceipt} socketDev=${state.socketIdentity?.dev ?? 'unavailable'} socketIno=${state.socketIdentity?.ino ?? 'unavailable'} listenStarted=${state.listenStarted} serverClosed=${state.serverCloseObserved} peers=${state.peers.size} ops=${state.pending.size} pending=${pending} unlink=${state.testOperations.unlink} rmdir=${state.testOperations.rmdir} result=${result} reason=${reason}`);
  return { result, reason };
}

async function observeClientRequestDestroy(run) {
  const prototype = builtinHttp.ClientRequest.prototype;
  const original = prototype.destroy;
  let destroyCalls = 0;
  prototype.destroy = function (...args) { destroyCalls++; return original.apply(this, args); };
  try { return { result: await run(), destroyCalls }; }
  finally { prototype.destroy = original; }
}
function deeplyFrozen(value) {
  return value === null || typeof value !== 'object' ||
    (Object.isFrozen(value) && Reflect.ownKeys(value).every(key => deeplyFrozen(value[key])));
}
function assertDenied(result) {
  assert.deepEqual(result, DENIAL);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Reflect.ownKeys(result), ['ok', 'error']);
}
function jsonReply(_request, res, status = 200, value = response, headers = {}) {
  const body = json(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}
async function observeRequestConstruction(run) {
  const original = builtinHttp.request;
  let attempts = 0;
  try {
    builtinHttp.request = () => { attempts++; throw new Error('test request construction intercepted'); };
    syncBuiltinESMExports();
    const result = await run();
    return { result, attempts };
  } finally {
    builtinHttp.request = original;
    syncBuiltinESMExports();
  }
}

finiteTest('invalid preflight input returns the fixed frozen denial without throwing', async () => {
  const result = await observeDockerImage(null);
  assertDenied(result);
});

finiteTest('one valid observation uses the fixed Unix GET and returns a detached frozen redacted DTO', async t => {
  const local = await fixture(t);
  const input = { socketPath: local.socketPath, ignored: 'PRIVATE_SENTINEL' };
  const result = await local.observe(input);
  assert.deepEqual(result, { ok: true, image: {
    id, repoTags: { state: 'missing', count: 0 }, repoDigests: { state: 'missing', hashes: [] },
    platform: { os: 'linux', architecture: 'amd64', variant: null }, user: 'present',
  } });
  assert.equal(deeplyFrozen(result), true);
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  assert.equal(local.requests.length, 1);
  assert.equal(local.requests[0].method, 'GET');
  assert.equal(local.requests[0].url, '/v1.48/images/postgres:17.11-bookworm/json');
  assert.equal(local.requests[0].headers.host, 'localhost');
  assert.equal(local.requests[0].headers.accept, 'application/json');
  assert.equal(local.requests[0].headers.connection, 'close');
  assert.deepEqual(Object.keys(local.requests[0].headers).sort(), ['accept', 'connection', 'host']);
  assert.equal(local.closed(), true);
  assert.equal(input.socketPath, local.socketPath);
});

finiteTest('control path candidates contain the intended codepoints and exceed the input ceiling', async t => {
  const local = await fixture(t);
  for (const code of [0, 1, 31, 127]) {
    const control = String.fromCharCode(code);
    const candidate = join(local.directory, `child${control}name`);
    assert.ok(candidate.startsWith(`${local.directory}/`));
    assert.ok(candidate.includes(control), `fixture must contain U+${code.toString(16).padStart(4, '0')}`);
  }
  const overlength = join(local.directory, 'x'.repeat(4100));
  assert.ok(overlength.startsWith(`${local.directory}/`));
  assert.ok(overlength.length > 4096);
});

finiteTest('selected own input data fields are validated without invoking accessors or contacting a peer', async t => {
  const local = await fixture(t);
  let getterCalls = 0;
  const timeoutAccessor = { socketPath: local.socketPath };
  Object.defineProperty(timeoutAccessor, 'timeoutMs', { get() { getterCalls++; return 1; } });
  const pathAccessor = {};
  Object.defineProperty(pathAccessor, 'socketPath', { get() { getterCalls++; return local.socketPath; } });
  const byteAccessor = { socketPath: local.socketPath };
  Object.defineProperty(byteAccessor, 'maxResponseBytes', { get() { getterCalls++; return 1; } });
  const descriptorTrap = new Proxy({ socketPath: local.socketPath }, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'timeoutMs') throw new Error('controlled reflection failure');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const badControls = [0, 1, 31, 127].map(code => {
    const control = String.fromCharCode(code);
    const path = join(local.directory, `bad${control}child`);
    assert.ok(path.startsWith(`${local.directory}/`));
    assert.ok(path.includes(control));
    return { socketPath: path };
  });
  const overlengthPath = join(local.directory, 'x'.repeat(4100));
  assert.ok(overlengthPath.length > 4096);
  const invalidInputs = [null, [], Object.create({ socketPath: local.socketPath }), timeoutAccessor,
    pathAccessor, byteAccessor, descriptorTrap,
    { socketPath: local.socketPath, timeoutMs: undefined },
    { socketPath: local.socketPath, maxResponseBytes: undefined },
    ...[true, '1', null, [], {}, NaN, Infinity, -Infinity, 1.5, 0, -1, 12001]
      .map(timeoutMs => ({ socketPath: local.socketPath, timeoutMs })),
    ...[true, '1', null, [], {}, NaN, Infinity, -Infinity, 1.5, 0, -1, 262145]
      .map(maxResponseBytes => ({ socketPath: local.socketPath, maxResponseBytes })),
    ...badControls, { socketPath: overlengthPath },
    new Proxy({ socketPath: local.socketPath }, { getPrototypeOf() { throw new Error('private'); } }),
  ];
  const observed = await observeRequestConstruction(async () => {
    for (const input of invalidInputs) assertDenied(await observeDockerImage(input));
  });
  assert.equal(observed.attempts, 0, 'no http.request construction occurred for invalid inputs');
  assert.equal(getterCalls, 0);
  const boundaryProbe = await observeRequestConstruction(() => observeDockerImage({ socketPath: local.socketPath }));
  assert.equal(boundaryProbe.attempts, 1, 'the test observer must see the live http.request import');
  assertDenied(boundaryProbe.result);
  assert.equal(local.requests.length, 0);
  assert.equal(local.peerObjects.length, 0);
});

finiteTest('explicit inclusive integer bounds pass input validation before intercepted request construction', async t => {
  const local = await fixture(t);
  for (const options of [{ timeoutMs: 1 }, { timeoutMs: 12000 },
    { maxResponseBytes: 1 }, { maxResponseBytes: 262144 }]) {
    const observed = await observeRequestConstruction(() => observeDockerImage({ socketPath: local.socketPath, ...options }));
    assert.equal(observed.attempts, 1, `selected endpoint accepted: ${JSON.stringify(options)}`);
    assertDenied(observed.result);
  }
  assert.equal(local.requests.length, 0, 'intercepted boundary probes must not contact the fixture');
  assert.equal(local.peerObjects.length, 0);
});

finiteTest('cancelled pre-creation setup drains its gate before cleanup and never creates a directory', async t => {
  const entered = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, { beforeMkdtemp: () => { entered.resolve(); return release.promise; } });
  await bounded(entered.promise, 'pre-creation gate entered');
  local.cancel(); release.resolve();
  await bounded(local.ready, 'cancelled setup completion');
  assert.equal(local.setupError, 'fixture-setup-cancelled');
  assert.equal(local.directory, null);
  assert.equal(local.listenStarts, 0);
  assert.deepEqual(local.pendingOperations, []);
  assert.equal((await local.cleanup()).result, 'removed');
});

finiteTest('cancellation after the owned chmod settles prevents a late private-mode-check lstat', async t => {
  const chmodSettled = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, {
    holdPrivateModeCompletion: { afterChmod: () => chmodSettled.resolve(), release },
  });
  try {
    await bounded(chmodSettled.promise, 'owned chmod settlement observed');
    assert.ok(local.pendingOperations.includes('private mode'));
    local.cancel(); release.resolve();
    await bounded(local.ready, 'cancelled private-mode continuation');
    assert.equal(local.setupError, 'fixture-setup-cancelled');
    assert.equal(local.operationStarts.filter(label => label === 'private mode check').length, 0);
    assert.equal(local.listenStarts, 0);
    assert.deepEqual(local.pendingOperations, []);
    assert.equal((await local.cleanup()).result, 'removed');
    assert.equal(local.testOperations.rmdir, 1);
  } finally {
    local.cancel(); release.resolve();
  }
});

finiteTest('cancelled delayed pre-listen setup fences late continuation and removes its empty owned directory', async t => {
  const entered = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, { beforeListen: () => { entered.resolve(); return release.promise; } });
  await bounded(entered.promise, 'pre-listen gate entered');
  const ownedDirectory = local.directory;
  assert.ok(ownedDirectory.startsWith('/tmp/h1-c13-'));
  local.cancel(); release.resolve();
  await bounded(local.ready, 'late setup continuation');
  assert.equal(local.setupError, 'fixture-setup-cancelled');
  assert.equal(local.listenStarts, 0);
  assert.equal(local.socketPath, undefined);
  assert.deepEqual(local.pendingOperations, []);
  assert.equal((await local.cleanup()).result, 'removed');
});

finiteTest('cancelled post-listen continuation drains close and fences delayed fixture completion', async t => {
  const entered = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, { afterSocketCaptured: () => { entered.resolve(); return release.promise; } });
  await bounded(entered.promise, 'post-listen gate entered');
  assert.ok(local.socketPath.startsWith('/tmp/h1-c13-'));
  local.cancel(); release.resolve();
  await bounded(local.ready, 'delayed fixture continuation');
  assert.equal(local.setupError, 'fixture-setup-cancelled');
  assert.deepEqual(local.pendingOperations, []);
  assert.equal((await local.cleanup()).result, 'removed');
  assert.equal(local.serverCloseObserved, true);
});

finiteTest('aborting an in-flight owned Unix listen observes server close and drains the listen operation', async t => {
  const invoked = deferred();
  const local = beginFixture(t, undefined, { onListenInvoked: () => invoked.resolve() });
  await bounded(invoked.promise, 'listen invocation observed');
  assert.equal(local.listenStarts, 1);
  local.cancel();
  await bounded(local.ready, 'aborted listen settlement');
  assert.ok(local.setupError);
  assert.deepEqual(local.pendingOperations, []);
  assert.equal((await local.cleanup()).result, 'removed');
  assert.equal(local.listenStarts, 1);
  assert.equal(local.serverCloseObserved, true);
  assert.deepEqual(local.pendingOperations, []);
});

finiteTest('controlled setup and handler failures are captured and their owned resources settle', async t => {
  const failedSetup = beginFixture(t, undefined, { beforeListen: () => { throw new Error('controlled setup failure'); } });
  await bounded(failedSetup.ready, 'controlled setup failure');
  assert.equal(failedSetup.setupError, 'Error');
  assert.equal(failedSetup.listenStarts, 0);
  assert.equal((await failedSetup.cleanup()).result, 'removed');

  const local = await fixture(t, () => { throw Object.assign(new Error('private handler detail'), { code: 'CONTROLLED_HANDLER_FAILURE' }); });
  const result = await observeDockerImage({ socketPath: local.socketPath });
  assertDenied(result);
  await assert.rejects(local.waitForPeers(), /owned fixture handler failed: CONTROLLED_HANDLER_FAILURE/);
  assert.equal(local.handlerError, 'CONTROLLED_HANDLER_FAILURE');
  assert.equal(local.peers.size, 0);
});

finiteTest('cleanup preserves an owned directory on injected identity mismatch, then removes it after restoration', async t => {
  const local = await fixture(t);
  const original = local.directoryIdentity;
  local.controls.directoryIdentityView = stat => ({ ...stat, ino: stat.ino + 1 });
  const first = await local.cleanup();
  assert.equal(first.result, 'preserved');
  assert.match(first.reason, /directory-identity-mismatch/);
  assert.equal(local.testOperations.unlink, 0);
  assert.equal(local.testOperations.rmdir, 0);
  const stillOwned = await bounded(lstat(local.directory), 'confirm preserved owned directory');
  assert.equal(stillOwned.dev, original.dev);
  assert.equal(stillOwned.ino, original.ino);
  local.controls.directoryIdentityView = undefined;
  assert.equal((await local.cleanup()).result, 'removed');
  assert.equal(local.testOperations.rmdir, 1);
});

finiteTest('cleanup refuses injected unexpected entries without filesystem deletion, then removes after restoration', async t => {
  const local = await fixture(t);
  local.controls.entriesView = () => ['injected-unexpected-entry'];
  const first = await local.cleanup();
  assert.equal(first.result, 'preserved');
  assert.match(first.reason, /unexpected-entries/);
  assert.equal(local.testOperations.unlink, 0);
  assert.equal(local.testOperations.rmdir, 0);
  assert.deepEqual(await bounded(readdir(local.directory), 'confirm own directory preserved'), []);
  local.controls.entriesView = undefined;
  assert.equal((await local.cleanup()).result, 'removed');
  assert.equal(local.testOperations.rmdir, 1);
});

finiteTest('a refused connection to a nonexistent child of the owned directory is redacted', async t => {
  const local = await fixture(t);
  assertDenied(await local.observe({ socketPath: join(local.directory, 'missing') }));
  assert.equal(local.requests.length, 0);
});

finiteTest('unknown-field reflection is avoided; null-prototype inputs remain accepted', async t => {
  const local = await fixture(t);
  const target = Object.assign(Object.create(null), { socketPath: local.socketPath });
  Object.defineProperty(target, 'unknown', { get() { throw new Error('private'); } });
  let unknownTouched = false;
  const guarded = new Proxy(target, {
    ownKeys() { unknownTouched = true; throw new Error('unknown enumeration'); },
    get(object, key, receiver) {
      if (key === 'unknown') { unknownTouched = true; throw new Error('unknown get'); }
      return Reflect.get(object, key, receiver);
    },
    getOwnPropertyDescriptor(object, key) {
      if (key === 'unknown') { unknownTouched = true; throw new Error('unknown descriptor'); }
      return Reflect.getOwnPropertyDescriptor(object, key);
    },
  });
  assert.equal((await local.observe(guarded)).ok, true);
  const nullRecord = Object.assign(Object.create(null), { socketPath: local.socketPath });
  assert.equal((await local.observe(nullRecord)).ok, true);
  assert.equal(unknownTouched, false);
  assert.equal(local.requests.length, 2);
});

finiteTest('non-200 status and relative redirects are denied without following or retrying', async t => {
  const local = await fixture(t, (_request, res) => {
    res.writeHead(302, { Location: '/v1.48/images/postgres:17.11-bookworm/json', 'Content-Length': '0' });
    res.end();
  });
  assertDenied(await local.observe({ socketPath: local.socketPath }));
  assert.equal(local.requests.length, 1);
  const missing = await fixture(t, (_request, res) => jsonReply(_request, res, 404));
  assertDenied(await missing.observe({ socketPath: missing.socketPath }));
  assert.equal(missing.requests.length, 1);
});

finiteTest('exact byte cap accepts multibyte JSON and rejects declared or streamed overflow', async t => {
  const text = { Id: id, Os: 'é', Architecture: 'amd64' };
  const body = Buffer.from(json(text));
  const accepted = await fixture(t, (_request, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) });
    res.end(body);
  });
  assert.equal((await accepted.observe({ socketPath: accepted.socketPath, maxResponseBytes: body.length })).ok, true);
  const chunkedExact = await fixture(t, (_request, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
    res.write(body);
    res.end();
  });
  assert.equal((await chunkedExact.observe({ socketPath: chunkedExact.socketPath, maxResponseBytes: body.length })).ok, true);
  const oversizedDeclared = await fixture(t, (_request, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' });
    res.end();
  });
  assertDenied(await oversizedDeclared.observe({ socketPath: oversizedDeclared.socketPath, maxResponseBytes: 32 }));
  const oversizedStream = await fixture(t, (_request, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
    res.end(Buffer.alloc(33, 0x20));
  });
  assertDenied(await oversizedStream.observe({ socketPath: oversizedStream.socketPath, maxResponseBytes: 32 }));
});

finiteTest('unsupported framing, duplicate selected headers, malformed JSON, UTF-8 and BOM deny', async t => {
  const cases = [
    (_request, res) => { res.writeHead(200, ['Content-Type', 'application/json', 'Content-Type', 'application/json', 'Content-Length', '0']); res.end(); },
    (_request, res) => { res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: identity\r\nContent-Encoding: identity\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); },
    (_request, res) => { res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); },
    (_request, res) => { res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n'); },
    (_request, res) => { const body = json(response); res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${body}`); },
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '0' }); res.end(); },
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '0' }); res.end(); },
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=latin1', 'Content-Length': '0' }); res.end(); },
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': '0' }); res.end(); },
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1' }); res.end('{'); },
    (_request, res) => { const bytes = Buffer.from([0xff]); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1' }); res.end(bytes); },
    (_request, res) => { const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json(response))]); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(bytes.length) }); res.end(bytes); },
    (_request, res) => { const body = json({ Id: 'bad', Os: 'linux', Architecture: 'amd64' }); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) }); res.end(body); },
  ];
  for (const respond of cases) {
    const local = await fixture(t, respond);
    assertDenied(await local.observe({ socketPath: local.socketPath }));
    assert.equal(local.requests.length, 1);
  }
});

finiteTest('a no-response peer is closed by the cooperative whole-operation deadline', async t => {
  const local = await fixture(t, () => {});
  const started = performance.now();
  const observed = await observeClientRequestDestroy(() => local.observe({ socketPath: local.socketPath, timeoutMs: 40 }));
  assertDenied(observed.result);
  assert.equal(observed.destroyCalls, 1, 'the client request was explicitly destroyed at the deadline');
  assert.ok(performance.now() - started < 1000);
  assert.equal(local.closed(), true);
  assert.equal(local.peerCloseReceipts.length, 1);
  assert.equal(local.peerCloseReceipts[0].responseFinished, false, 'the peer had not finished a response before client teardown');
});

finiteTest('valid chunked framing succeeds; ambiguous framing, encodings, trailers and incomplete bodies deny', async t => {
  const chunked = await fixture(t, (_request, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
    res.write(json(response));
    res.end();
  });
  assert.equal((await chunked.observe({ socketPath: chunked.socketPath })).ok, true);
  const unsupported = [
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': '0' }); res.end(); },
    (_request, res) => { res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n'); },
    (_request, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked', Trailer: 'X-Extra' }); res.addTrailers({ 'X-Extra': 'value' }); res.end(json(response)); },
    (_request, res) => { const body = json(response); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body) + 4) }); res.end(body); },
  ];
  for (const respond of unsupported) {
    const local = await fixture(t, respond);
    assertDenied(await local.observe({ socketPath: local.socketPath }));
  }
});

finiteTest('100 and 103 interim responses and oversized response headers fail closed', async t => {
  const interim = await fixture(t, (_request, res) => {
    res.writeContinue();
    jsonReply(_request, res);
  });
  assertDenied(await interim.observe({ socketPath: interim.socketPath }));
  const earlyHints = await fixture(t, (_request, res) => {
    res.writeEarlyHints({ link: '</local-fixture>; rel=preload' });
    jsonReply(_request, res);
  });
  assertDenied(await earlyHints.observe({ socketPath: earlyHints.socketPath }));
  const oversized = await fixture(t, (_request, res) => {
    const body = json(response);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)), 'X-Large': 'x'.repeat(9000) });
    res.end(body);
  });
  assertDenied(await oversized.observe({ socketPath: oversized.socketPath }));
  const upgrade = await fixture(t, (_request, res) => {
    res.socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  assertDenied(await upgrade.observe({ socketPath: upgrade.socketPath }));
});

finiteTest('a trickling peer cannot extend the fixed whole-operation deadline', async t => {
  const local = await fixture(t, (_request, res, _peers, _closures, timers) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
    res.write('{');
    const timer = setInterval(() => res.write(' '), 5);
    timers.add(timer);
  });
  const started = performance.now();
  const observed = await observeClientRequestDestroy(() => local.observe({ socketPath: local.socketPath, timeoutMs: 45 }));
  assertDenied(observed.result);
  assert.equal(observed.destroyCalls, 1, 'the client request was explicitly destroyed at the deadline');
  assert.ok(performance.now() - started < 1000);
  assert.equal(local.closed(), true);
  assert.equal(local.peerCloseReceipts.length, 1);
  assert.equal(local.peerCloseReceipts[0].responseFinished, false, 'the trickling peer had not finished a response before client teardown');
  assert.equal(local.timers.size, 0);
});

finiteTest('two valid calls use independent requests and close both owned peers', async t => {
  const local = await fixture(t);
  assert.equal((await local.observe({ socketPath: local.socketPath })).ok, true);
  assert.equal((await local.observe({ socketPath: local.socketPath })).ok, true);
  assert.equal(local.requests.length, 2);
  assert.equal(local.peerObjects.length, 2);
  assert.notEqual(local.peerObjects[0], local.peerObjects[1]);
  assert.equal(local.closed(), true);
});
