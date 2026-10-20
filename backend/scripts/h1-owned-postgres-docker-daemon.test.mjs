import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, lstat, readdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { observeDockerDaemonVersion } from './h1-owned-postgres-docker-daemon.mjs';

const builtinHttp = createRequire(import.meta.url)('node:http');
const denial = { ok: false, error: 'Unable to observe Docker daemon version.' };
const validVersion = { Version: '27.4.0+legacy', ApiVersion: '1.48', MinAPIVersion: '1.24', Os: 'plan9', Arch: 'riscv64', Private: 'PRIVATE_SENTINEL' };
const json = value => JSON.stringify(value);
const bounded = (promise, label, ms = 1500) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); })]).finally(() => clearTimeout(timer));
};
function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}
const finiteTest = (name, fn) => test(name, { timeout: 15000 }, fn);
const FIXTURE_OWNER = Symbol('C14 fixture creator');
const FIXTURE_TIMEOUT_MS = 1500;
const FIXTURE_SETUP_MS = 7000;
const FIXTURE_TEARDOWN_MS = 7000;
function beginOperation(state, label, start, onValue) {
  const record = { label, status: 'pending', value: undefined, error: undefined };
  state.operationReceipts.push(record);
  let resolveOperation;
  let rejectOperation;
  const operation = new Promise((resolve, reject) => { resolveOperation = resolve; rejectOperation = reject; });
  state.pending.set(operation, record);
  const fail = error => {
    record.status = 'failed';
    record.error = error.code || error.name || 'owned-operation-error';
    rejectOperation(error);
  };
  try {
    Promise.resolve(start()).then(value => {
      try {
        record.value = onValue?.(value) ?? value;
        record.status = 'completed';
        resolveOperation(value);
      } catch (error) { fail(error); }
    }, fail);
  } catch (error) { fail(error); }
  operation.then(() => state.pending.delete(operation), () => state.pending.delete(operation));
  return operation;
}
function remaining(state) {
  const deadline = state.teardownDeadline || state.setupDeadline;
  return Math.max(1, deadline - performance.now());
}
function awaitOwned(state, label, start, onValue) {
  return bounded(beginOperation(state, label, start, onValue), label, Math.min(FIXTURE_TIMEOUT_MS, remaining(state)));
}
function ensureSetupOpen(state) { if (state.closing) throw new Error('fixture setup cancelled'); }
function statReceipt(stat) {
  return { dev: stat.dev, ino: stat.ino, mode: stat.mode, isDirectory: stat.isDirectory(), isSocket: stat.isSocket() };
}
function sameIdentity(actual, expected) {
  return Boolean(actual && expected && actual.dev === expected.dev && actual.ino === expected.ino &&
    actual.isDirectory === expected.isDirectory && actual.isSocket === expected.isSocket);
}
function changedView(actual, view) { return typeof view === 'function' ? view(actual) : actual; }
function identityFailure(actual, expected, label) {
  if (!actual || actual.isDirectory !== expected.isDirectory || actual.isSocket !== expected.isSocket) return `${label}-type-mismatch`;
  if (actual.dev !== expected.dev) return `${label}-device-mismatch`;
  if (actual.ino !== expected.ino) return `${label}-inode-mismatch`;
  return undefined;
}
function directoryStatFailure(stat, expected, recordedPermissions) {
  const identityError = identityFailure(stat, expected, 'directory');
  if (identityError) return identityError;
  if (!stat.isDirectory) return 'directory-type-mismatch';
  if ((stat.mode & 0o777) !== 0o700 || recordedPermissions !== 0o700) return 'directory-permissions-mismatch';
  return undefined;
}
function socketStatFailure(stat, expected, recordedPermissions) {
  const identityError = identityFailure(stat, expected, 'socket');
  if (identityError) return identityError;
  if (!stat.isSocket) return 'socket-type-mismatch';
  if ((stat.mode & 0o777) !== recordedPermissions) return 'socket-permissions-mismatch';
  return undefined;
}
function directoryContentFailure(entries, expectedEntries) {
  if (!Array.isArray(entries) || entries.length !== expectedEntries.length ||
      entries.some((entry, index) => entry !== expectedEntries[index])) return 'directory-content-mismatch';
  return undefined;
}
function preserve(state, reason, synthetic = false) {
  if (state.directoryReceipt) state.directoryReceipt.status = 'preserved';
  if (state.socketReceipt && state.socketReceipt.status !== 'removed-by-prevalidated-server-close') state.socketReceipt.status = 'preserved';
  state.managerReceipt = { result: 'preserved', reason, synthetic, directory: state.directory || 'not-created',
    directoryIdentity: state.directoryIdentity || 'unknown', socket: state.socketPath || 'not-created',
    socketIdentity: state.socketIdentity || 'unknown', closeDispatches: state.closeDispatches,
    rmdirDispatches: state.rmdirDispatches,
    pending: [...state.pending.values()].map(record => record.label), peers: state.peers.size };
  const kind = synthetic ? 'SYNTHETIC' : 'OWNED';
  console.log(`# C14_FIXTURE_PRESERVE kind=${kind} dir=${state.managerReceipt.directory} dirId=${state.managerReceipt.directoryIdentity.dev ?? 'unknown'}:${state.managerReceipt.directoryIdentity.ino ?? 'unknown'} socket=${state.managerReceipt.socket} socketId=${state.managerReceipt.socketIdentity.dev ?? 'unknown'}:${state.managerReceipt.socketIdentity.ino ?? 'unknown'} close=${state.closeDispatches} rmdir=${state.rmdirDispatches} pending=${state.managerReceipt.pending.join('|') || 'none'} peers=${state.peers.size} reason=${reason}`);
  return state.managerReceipt;
}
async function drainFixture(state) {
  if (state.ready) {
    try { await bounded(state.ready, 'fixture setup settlement', remaining(state)); }
    catch { if (!state.setupSettled) return preserve(state, `setup-still-pending:${state.setupError || 'unknown'}`); }
  }
  if (state.pending.size) {
    const operations = [...state.pending.keys()];
    try { await bounded(Promise.allSettled(operations), 'owned operation drain', remaining(state)); }
    catch { return preserve(state, `operations-not-drained:${[...state.pending.values()].map(item => item.label).join('|')}`); }
  }
  if (state.pending.size !== 0) return preserve(state, `operations-pending:${[...state.pending.values()].map(item => item.label).join('|')}`);
  try { await bounded(Promise.all(state.peerClosures), 'owned peer drain', remaining(state)); }
  catch { return preserve(state, `peers-not-drained:${state.peers.size}`); }
  if (state.peers.size !== 0) return preserve(state, `peers-pending:${state.peers.size}`);
  return undefined;
}
async function prevalidateOwnedResources(state, useViews) {
  if (!state.directory) return { result: 'no-resources' };
  if (!state.directoryIdentity) return { error: 'directory-identity-unavailable' };
  let directory;
  try { directory = statReceipt(await awaitOwned(state, 'verify owned directory', () => lstat(state.directory))); }
  catch (error) { return { error: `directory-stat:${error.code || error.name}` }; }
  const actualDirectoryError = directoryStatFailure(directory, state.directoryIdentity, state.directoryPermissions);
  if (actualDirectoryError) return { error: actualDirectoryError };
  const directoryView = useViews ? changedView({ ...directory }, state.controls.directoryStatView) : directory;
  const viewedDirectoryError = directoryStatFailure(directoryView, state.directoryIdentity, state.directoryPermissions);
  if (viewedDirectoryError) return { error: viewedDirectoryError, synthetic: useViews && typeof state.controls.directoryStatView === 'function' };
  let entries;
  try { entries = await awaitOwned(state, 'verify exact directory entries', () => readdir(state.directory)); }
  catch (error) { return { error: `directory-entries:${error.code || error.name}` }; }
  const expectedEntries = state.socketIdentity ? ['s'] : [];
  const actualContentError = directoryContentFailure(entries, expectedEntries);
  if (actualContentError) return { error: `${actualContentError}:${entries.join('|') || 'empty'}` };
  const entriesView = useViews ? changedView([...entries], state.controls.entriesView) : entries;
  const viewedContentError = directoryContentFailure(entriesView, expectedEntries);
  if (viewedContentError) return { error: viewedContentError, synthetic: useViews && typeof state.controls.entriesView === 'function' };
  if (state.listenerDispatches > 0 && !state.socketIdentity) return { error: 'socket-identity-unavailable-after-listen' };
  if (state.socketIdentity) {
    let socket;
    try { socket = statReceipt(await awaitOwned(state, 'verify owned socket', () => lstat(state.socketPath))); }
    catch (error) { return { error: `socket-stat:${error.code || error.name}` }; }
    const actualSocketError = socketStatFailure(socket, state.socketIdentity, state.socketPermissions);
    if (actualSocketError) return { error: actualSocketError };
    const socketView = useViews ? changedView({ ...socket }, state.controls.socketStatView) : socket;
    const viewedSocketError = socketStatFailure(socketView, state.socketIdentity, state.socketPermissions);
    if (viewedSocketError) return { error: viewedSocketError, synthetic: useViews && typeof state.controls.socketStatView === 'function' };
  }
  if (state.server?.listening && !state.socketIdentity) return { error: 'listening-without-socket-identity' };
  state.precloseValidation = { directoryIdentity: true, directoryType: true, directoryPermissions: true,
    expectedEntries: true, socketIdentity: Boolean(state.socketIdentity), socketPermissions: Boolean(state.socketIdentity),
    pendingOperations: state.pending.size === 0, acceptedPeers: state.peers.size === 0 };
  return { result: 'validated', directory, entries, socket: state.socketIdentity };
}
async function finishOwnedCleanup(state, actor, inspection) {
  if (inspection.result === 'no-resources') {
    state.terminalReceipt = { result: 'removed', reason: 'no-owned-resource-created', directory: 'not-created', socket: 'not-created' };
    return state.terminalReceipt;
  }
  if (state.server?.listening) {
    state.closeDispatches++;
    try {
      await awaitOwned(state, `${actor} validated Unix listener close`, () => new Promise((resolve, reject) => {
        state.server.close(error => error ? reject(error) : resolve());
      }));
    } catch (error) { return preserve(state, `validated-server-close:${error.code || error.name}`); }
    if (!state.serverCloseObserved || state.server.listening) return preserve(state, 'server-close-not-observed');
  } else if (state.listenerDispatches > 0 && state.socketIdentity) {
    return preserve(state, 'listener-not-live-after-socket-creation; no pathname-unlink-fallback');
  }
  if (state.socketIdentity) {
    let socketGone = false;
    try { await awaitOwned(state, 'correlate validated socket close', () => lstat(state.socketPath)); }
    catch (error) { socketGone = error.code === 'ENOENT'; if (!socketGone) return preserve(state, `post-close-socket-check:${error.code || error.name}`); }
    if (!socketGone) return preserve(state, 'validated-close-did-not-remove-socket; no-unlink-fallback');
    state.socketTerminal = { result: 'removed-by-prevalidated-server-close', identity: state.socketIdentity };
    state.socketReceipt.status = state.socketTerminal.result;
  }
  let finalDirectory;
  let finalEntries;
  try {
    finalDirectory = statReceipt(await awaitOwned(state, 'final directory identity', () => lstat(state.directory)));
    finalEntries = await awaitOwned(state, 'final empty directory check', () => readdir(state.directory));
  } catch (error) { return preserve(state, `final-directory-check:${error.code || error.name}`); }
  if (!sameIdentity(finalDirectory, state.directoryIdentity) || (finalDirectory.mode & 0o777) !== 0o700 || finalEntries.length !== 0) {
    return preserve(state, 'final-directory-identity-permission-or-content-mismatch');
  }
  state.rmdirDispatches++;
  try { await awaitOwned(state, `${actor} validated empty directory removal`, () => rmdir(state.directory)); }
  catch (error) { return preserve(state, `validated-rmdir:${error.code || error.name}`); }
  state.directoryTerminal = { result: 'removed-by-validated-rmdir', identity: state.directoryIdentity };
  state.directoryReceipt.status = state.directoryTerminal.result;
  state.terminalReceipt = { result: 'removed', actor, directory: state.directory, directoryIdentity: state.directoryIdentity,
    directoryCreationReceipt: state.directoryReceipt, directoryTerminal: state.directoryTerminal,
    socket: state.socketPath || 'not-created', socketIdentity: state.socketIdentity || 'not-created',
    socketCreationReceipt: state.socketReceipt || 'not-created', socketTerminal: state.socketTerminal || 'not-created',
    closeDispatches: state.closeDispatches, rmdirDispatches: state.rmdirDispatches,
    operationReceipts: state.operationReceipts.map(({ label, status, error }) => ({ label, status, error })),
    pending: state.pending.size, peers: state.peers.size };
  const socketLabel = state.socketIdentity ? `${state.socketIdentity.dev}:${state.socketIdentity.ino}:${state.socketTerminal.result}` : 'not-created';
  console.log(`# C14_FIXTURE_CLEANUP actor=${actor} dir=${state.directory} dirId=${state.directoryIdentity.dev}:${state.directoryIdentity.ino} socket=${socketLabel} peers=${state.peers.size} pending=${state.pending.size} close=${state.closeDispatches} rmdir=${state.rmdirDispatches} result=removed`);
  return state.terminalReceipt;
}
async function cleanupOwnedFixture(state) {
  if (state.terminalReceipt) return state.terminalReceipt;
  if (state.managerReceipt) return state.managerReceipt;
  state.closing = true;
  state.teardownDeadline = performance.now() + FIXTURE_TEARDOWN_MS;
  const drain = await drainFixture(state);
  if (drain?.result === 'preserved') return preserve(state, drain.reason);
  const inspection = await prevalidateOwnedResources(state, true);
  if (inspection.error) return preserve(state, inspection.error, inspection.synthetic === true);
  return finishOwnedCleanup(state, 'manager', inspection);
}
async function recoverOwnedFixture(state) {
  assert.equal(state.ownerToken, FIXTURE_OWNER, 'recovery is restricted to the exact creator-owned fixture controller');
  assert.ok(state.managerReceipt?.synthetic, 'creator recovery is only separate from a synthetic manager preservation test');
  state.teardownDeadline = performance.now() + FIXTURE_TEARDOWN_MS;
  const drain = await drainFixture(state);
  if (drain?.result === 'preserved') return preserve(state, `creator-recovery-${drain.reason}`);
  const inspection = await prevalidateOwnedResources(state, false);
  if (inspection.error) return preserve(state, `creator-recovery-${inspection.error}`);
  const receipt = await finishOwnedCleanup(state, 'creator-recovery', inspection);
  state.recovered = receipt.result === 'removed';
  console.log(`# C14_FIXTURE_CREATOR_RECOVERY owner=exact-controller dir=${state.directory} result=${receipt.result} managerFallback=false`);
  return receipt;
}
function beginFixture(t, respond = (_req, res) => reply(res), controls = {}) {
  const state = { ownerToken: FIXTURE_OWNER, controls, directory: null, directoryIdentity: null, directoryPermissions: null,
    socketPath: null, socketIdentity: null, socketPermissions: null, server: null, peers: new Set(), peerClosures: [],
    requests: [], responses: [], pending: new Map(), operationReceipts: [], closeInvocations: [], listenerDispatches: 0, closeDispatches: 0,
    rmdirDispatches: 0, timers: new Set(), closing: false, setupSettled: false,
    setupDeadline: performance.now() + FIXTURE_SETUP_MS, setupError: null, serverCloseObserved: false };
  t.after(async () => {
    if (state.recovered) return;
    const receipt = await bounded(cleanupOwnedFixture(state), 'fixture manager cleanup', FIXTURE_TEARDOWN_MS + 1000);
    assert.equal(receipt.result, 'removed', `owned fixture preserved: ${receipt.reason}; dir=${receipt.directory}; dirId=${receipt.directoryIdentity?.dev ?? 'unknown'}:${receipt.directoryIdentity?.ino ?? 'unknown'}; socket=${receipt.socket}; socketId=${receipt.socketIdentity?.dev ?? 'unknown'}:${receipt.socketIdentity?.ino ?? 'unknown'}`);
  });
  state.ready = setupFixture(state, respond).catch(error => {
    state.setupError = error.code || error.name || 'fixture-setup-error';
    throw error;
  }).finally(() => { state.setupSettled = true; });
  return state;
}
async function setupFixture(state, respond) {
  const createDirectory = async () => {
    const directory = await mkdtemp('/tmp/h1-c14-');
    state.directory = directory;
    state.directoryReceipt = { path: directory, status: 'created-identity-pending', identity: null };
    console.log(`# C14_FIXTURE_CREATED dir=${directory} identity=pending`);
    if (state.controls.afterMkdtemp) await bounded(state.controls.afterMkdtemp(), 'controlled post-mkdtemp hold', remaining(state));
    const stat = statReceipt(await lstat(directory));
    state.directoryIdentity = stat;
    state.directoryPermissions = stat.mode & 0o777;
    state.directoryReceipt = { path: directory, status: 'identity-captured', identity: stat, permissions: state.directoryPermissions };
    return stat;
  };
  await awaitOwned(state, 'create directory and capture exact identity', createDirectory);
  ensureSetupOpen(state);
  await awaitOwned(state, 'private chmod', async () => {
    await chmod(state.directory, 0o700);
    if (state.controls.afterChmod) await bounded(state.controls.afterChmod(), 'controlled post-chmod hold', remaining(state));
  });
  ensureSetupOpen(state);
  const directoryMode = statReceipt(await awaitOwned(state, 'verify private directory mode', () => lstat(state.directory)));
  ensureSetupOpen(state);
  if (!sameIdentity(directoryMode, state.directoryIdentity) || (directoryMode.mode & 0o777) !== 0o700) throw new Error('owned directory mode/identity check failed');
  state.directoryPermissions = directoryMode.mode & 0o777;
  state.server = createServer((req, res) => {
    state.requests.push({ method: req.method, url: req.url, headers: req.headers });
    const receipt = { finished: false };
    state.responses.push(receipt);
    res.once('finish', () => { receipt.finished = true; });
    try { (state.controls.respond || respond)(req, res, state); }
    catch { res.destroy(); }
  });
  state.server.once('close', () => { state.serverCloseObserved = true; });
  const nativeClose = state.server.close;
  state.server.close = function (...args) {
    state.closeInvocations.push({ proof: state.precloseValidation ? { ...state.precloseValidation } : null, listening: this.listening });
    return nativeClose.apply(this, args);
  };
  state.server.on('connection', peer => {
    state.peers.add(peer);
    state.peerClosures.push(new Promise(resolve => peer.once('close', () => {
      state.peers.delete(peer);
      for (const timer of state.timers) { clearTimeout(timer); clearInterval(timer); }
      state.timers.clear();
      resolve();
    })));
  });
  state.socketPath = join(state.directory, 's');
  if (state.controls.beforeListen) await bounded(state.controls.beforeListen(), 'controlled pre-listen hold', remaining(state));
  ensureSetupOpen(state);
  state.listenerDispatches++;
  state.socketReceipt = { path: state.socketPath, status: 'listener-creation-pending', identity: null };
  const startListenerAndCaptureSocket = async () => {
    try {
      await new Promise((resolve, reject) => {
        state.server.once('error', reject);
        state.server.listen({ path: state.socketPath }, resolve);
      });
    } catch (error) {
      state.socketReceipt.status = 'listen-failed-identity-unknown';
      throw error;
    }
    state.listenObserved = true;
    if (state.controls.afterListen) await bounded(state.controls.afterListen(), 'controlled post-listen identity hold', remaining(state));
    let socket;
    try { socket = statReceipt(await lstat(state.socketPath)); }
    catch (error) { state.socketReceipt.status = 'identity-capture-failed'; throw error; }
    if (!socket.isSocket) { state.socketReceipt.status = 'identity-capture-wrong-type'; throw new Error('owned listen path did not produce a Unix socket'); }
    state.socketIdentity = socket;
    state.socketPermissions = socket.mode & 0o777;
    state.socketReceipt = { path: state.socketPath, status: 'identity-captured', identity: socket };
    console.log(`# C14_FIXTURE_SOCKET path=${state.socketPath} socketId=${socket.dev}:${socket.ino} mode=${(socket.mode & 0o777).toString(8)}`);
    return socket;
  };
  await awaitOwned(state, 'Unix listener creation and exact socket identity capture', startListenerAndCaptureSocket);
  ensureSetupOpen(state);
  return state;
}
async function fixture(t, respond, controls) { const state = beginFixture(t, respond, controls); await bounded(state.ready, 'fixture setup', FIXTURE_SETUP_MS); return state; }
async function observeAndDrain(local, input) {
  const result = await observeDockerDaemonVersion(input);
  await bounded(Promise.all(local.peerClosures), 'owned peer closure', FIXTURE_TIMEOUT_MS);
  assert.equal(local.peers.size, 0);
  return result;
}
async function observeClientRequestDestroy(run, lateError = false) {
  const prototype = builtinHttp.ClientRequest.prototype;
  const original = prototype.destroy;
  let calls = 0;
  prototype.destroy = function (...args) {
    calls++;
    const result = original.apply(this, args);
    if (lateError) queueMicrotask(() => {
      const error = new Error('synthetic late private error');
      this.emit('error', error);
      this.emit('error', error);
    });
    return result;
  };
  try { return { result: await run(), calls }; }
  finally { prototype.destroy = original; }
}
function reply(res, status = 200, body = validVersion, headers = {}) {
  const text = json(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(text)), ...headers });
  res.end(text);
}
function assertDenied(value) { assert.deepEqual(value, denial); assert.equal(Object.isFrozen(value), true); assert.deepEqual(Reflect.ownKeys(value), ['ok', 'error']); }
function deeplyFrozen(value) { return value === null || typeof value !== 'object' || Object.isFrozen(value) && Reflect.ownKeys(value).every(key => deeplyFrozen(value[key])); }
async function withTransportInstrumentation(run, { intercept = false, captureTimers = false, captureAlloc = false } = {}) {
  const originalAgent = builtinHttp.Agent;
  const originalRequest = builtinHttp.request;
  const originalSetTimeout = globalThis.setTimeout;
  const originalBufferAlloc = Buffer.alloc;
  const agents = [];
  const agentOptions = [];
  const requests = [];
  const timerDelays = [];
  const allocatedBytes = [];
  let destroyCalls = 0;
  class ObservedAgent extends originalAgent {
    constructor(options) { agentOptions.push(options); super(options); agents.push(this); }
    destroy(...args) { destroyCalls++; return super.destroy(...args); }
  }
  try {
    builtinHttp.Agent = ObservedAgent;
    builtinHttp.request = function (options, ...args) {
      requests.push(options);
      if (intercept) throw new Error('controlled request interception');
      return originalRequest.call(this, options, ...args);
    };
    if (captureTimers) globalThis.setTimeout = function (callback, delay, ...args) {
      timerDelays.push(delay);
      return originalSetTimeout.call(this, callback, delay, ...args);
    };
    if (captureAlloc) Buffer.alloc = function (size, ...args) {
      const stack = new Error().stack || '';
      allocatedBytes.push({ size, observerOwned: stack.includes('h1-owned-postgres-docker-daemon.mjs') });
      return originalBufferAlloc.call(this, size, ...args);
    };
    syncBuiltinESMExports();
    const result = await run();
    return { result, agents, agentOptions, requests, timerDelays, allocatedBytes, destroyCalls };
  } finally {
    builtinHttp.Agent = originalAgent;
    builtinHttp.request = originalRequest;
    globalThis.setTimeout = originalSetTimeout;
    Buffer.alloc = originalBufferAlloc;
    syncBuiltinESMExports();
  }
}

finiteTest('valid observation uses the exact private Unix GET and returns a detached deeply frozen redacted DTO', async t => {
  const local = await fixture(t);
  const body = { ...validVersion, Platform: { Name: 'PRIVATE_PLATFORM' }, Components: [{ Name: 'PRIVATE_COMPONENT', Details: 'PRIVATE_DETAILS' }],
    GitCommit: 'PRIVATE_GIT', GoVersion: 'PRIVATE_GO', KernelVersion: 'PRIVATE_KERNEL', BuildTime: 'PRIVATE_BUILD' };
  local.controls.respond = (_req, res) => reply(res, 200, body);
  const observed = await withTransportInstrumentation(() => observeAndDrain(local, { socketPath: local.socketPath, ignored: 'PRIVATE_INPUT' }));
  const result = observed.result;
  assert.deepEqual(result, { ok: true, daemon: { version: '27.4.0+legacy', apiVersion: '1.48', minimumApiVersion: { kind: 'present', value: '1.24' }, os: 'plan9', architecture: 'riscv64' } });
  assert.equal(deeplyFrozen(result), true);
  assert.equal(Object.isFrozen(result.daemon), true);
  assert.equal(Object.isFrozen(result.daemon.minimumApiVersion), true);
  assert.notEqual(result.daemon, body);
  assert.notEqual(result.daemon.minimumApiVersion, body);
  assert.equal(Object.isFrozen(body), false);
  body.Version = 'changed-after-response';
  assert.equal(result.daemon.version, '27.4.0+legacy');
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
  assert.equal(observed.requests.length, 1);
  assert.equal(observed.requests[0].socketPath, local.socketPath);
  assert.equal(observed.requests[0].method, 'GET');
  assert.equal(observed.requests[0].path, '/v1.48/version');
  assert.deepEqual(observed.requests[0].headers, { Host: 'localhost', Accept: 'application/json', Connection: 'close' });
  assert.equal(observed.requests[0].maxHeaderSize, 8192);
  assert.equal(observed.requests[0].insecureHTTPParser, false);
  assert.equal(observed.requests[0].agent, observed.agents[0]);
  assert.equal(Object.hasOwn(observed.requests[0], 'host'), false, 'the request uses only the explicit Unix socket');
  assert.equal(observed.agents.length, 1);
  assert.notEqual(observed.agents[0], builtinHttp.globalAgent);
  assert.deepEqual(observed.agentOptions[0], { keepAlive: false, proxyEnv: undefined, maxSockets: 1, maxTotalSockets: 1 });
  assert.equal(observed.destroyCalls, 1);
  assert.equal(local.requests.length, 1);
  assert.deepEqual(Object.keys(local.requests[0].headers).sort(), ['accept', 'connection', 'host']);
  assert.equal(local.peers.size, 0);
});

finiteTest('valid observations preserve unusual daemon self-reports and represent absent minimum explicitly', async t => {
  const local = await fixture(t);
  local.controls.respond = (_req, res) => reply(res, 200, { Version: 'dev+build-not-semver', ApiVersion: '0009.0007', Os: 'unknown-os', Arch: 'unknown_arch' });
  const result = await observeAndDrain(local, { socketPath: local.socketPath });
  assert.deepEqual(result, { ok: true, daemon: { version: 'dev+build-not-semver', apiVersion: '0009.0007', minimumApiVersion: { kind: 'absent' }, os: 'unknown-os', architecture: 'unknown_arch' } });
  assert.equal(deeplyFrozen(result), true);
});

finiteTest('reported API highest below its minimum remains observation and preserves leading zero strings', async t => {
  const local = await fixture(t);
  const body = { Version: 'legacy+opaque', ApiVersion: '0001.0000', MinAPIVersion: '9999.0009', Os: 'unknown.os', Arch: 'unlisted_arch' };
  local.controls.respond = (_req, res) => reply(res, 200, body);
  const result = await observeAndDrain(local, { socketPath: local.socketPath });
  assert.deepEqual(result, { ok: true, daemon: { version: 'legacy+opaque', apiVersion: '0001.0000', minimumApiVersion: { kind: 'present', value: '9999.0009' }, os: 'unknown.os', architecture: 'unlisted_arch' } });
  assert.equal(deeplyFrozen(result), true);
});

finiteTest('exact inclusive field bounds are accepted and wrong-case root keys are not aliases', async t => {
  const local = await fixture(t);
  const lower = { Version: '+', ApiVersion: '0.0', MinAPIVersion: '0.0', Os: 'x', Arch: 'x' };
  local.controls.respond = (_req, res) => reply(res, 200, lower);
  const lowResult = await observeAndDrain(local, { socketPath: local.socketPath });
  assert.equal(lowResult.ok, true);
  const api32 = `1.${'0'.repeat(30)}`;
  const upper = { Version: 'v'.repeat(256), ApiVersion: api32, MinAPIVersion: api32, Os: 'o'.repeat(64), Arch: 'a'.repeat(64) };
  local.controls.respond = (_req, res) => reply(res, 200, upper);
  const upperResult = await observeAndDrain(local, { socketPath: local.socketPath });
  assert.equal(upperResult.ok, true);
  assert.equal(upperResult.daemon.version.length, 256);
  assert.equal(upperResult.daemon.apiVersion.length, 32);
  assert.equal(upperResult.daemon.os.length, 64);
  assert.equal(upperResult.daemon.architecture.length, 64);
  for (const [key, alias] of [['Version', 'version'], ['ApiVersion', 'apiVersion'], ['Os', 'os'], ['Arch', 'arch']]) {
    const wrongCase = { ...validVersion, [alias]: validVersion[key] };
    delete wrongCase[key];
    local.controls.respond = (_req, res) => reply(res, 200, wrongCase);
    assertDenied(await observeAndDrain(local, { socketPath: local.socketPath }));
  }
});

finiteTest('all required daemon strings and present minimum enforce local type, presence, format, and length rules', async t => {
  const local = await fixture(t);
  for (const key of ['Version', 'ApiVersion', 'Os', 'Arch']) {
    for (const bad of [undefined, null, 1, {}, [], '', 'A'.repeat(key === 'Version' ? 257 : key === 'ApiVersion' ? 33 : 65), 'é', 'bad value', 'bad/path', 'bad\0value', 'bad\x7fvalue']) {
      const body = { ...validVersion, [key]: bad };
      if (bad === undefined) delete body[key];
      local.controls.respond = (_req, res) => reply(res, 200, body);
      assertDenied(await observeAndDrain(local, { socketPath: local.socketPath }));
    }
  }
  for (const bad of [null, 1, {}, [], '', '1', '1.2.3', '1.a', '1.2 '.repeat(8), '1'.repeat(33), '1.2\0', '1.2\x7f']) {
    local.controls.respond = (_req, res) => reply(res, 200, { ...validVersion, MinAPIVersion: bad });
    assertDenied(await observeAndDrain(local, { socketPath: local.socketPath }));
  }
  for (const key of ['Version', 'ApiVersion', 'Os', 'Arch']) {
    const body = { ...validVersion }; delete body[key];
    local.controls.respond = (_req, res) => reply(res, 200, body);
    assertDenied(await observeAndDrain(local, { socketPath: local.socketPath }));
  }
});

finiteTest('input preflight rejects invalid selected data without requests and never invokes unknown getters', async t => {
  const local = await fixture(t);
  let getterCalls = 0;
  const accessor = { socketPath: local.socketPath };
  Object.defineProperty(accessor, 'timeoutMs', { get() { getterCalls++; return 1; } });
  const pathAccessor = {};
  Object.defineProperty(pathAccessor, 'socketPath', { get() { getterCalls++; return local.socketPath; } });
  const bytesAccessor = { socketPath: local.socketPath };
  Object.defineProperty(bytesAccessor, 'maxResponseBytes', { get() { getterCalls++; return 1; } });
  const unknown = Object.assign(Object.create(null), { socketPath: local.socketPath });
  Object.defineProperty(unknown, 'private', { get() { getterCalls++; throw new Error('private'); } });
  const unknownTrap = new Proxy(unknown, {
    ownKeys() { getterCalls++; throw new Error('unknown enumeration'); },
    get(target, key, receiver) { if (key === 'private') { getterCalls++; throw new Error('unknown get'); } return Reflect.get(target, key, receiver); },
    getOwnPropertyDescriptor(target, key) { if (key === 'private') { getterCalls++; throw new Error('unknown descriptor'); } return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  const trap = new Proxy({ socketPath: local.socketPath }, { getOwnPropertyDescriptor(target, key) { if (key === 'timeoutMs') throw new Error('private reflection'); return Reflect.getOwnPropertyDescriptor(target, key); } });
  const badPaths = [null, '', '/', 'relative', '/bad\0socket', '/bad\x01socket', '/bad\x1fsocket', '/bad\x7fsocket', `/${'x'.repeat(4096)}`];
  const invalidInputs = [
    ...badPaths.map(socketPath => ({ socketPath })),
    ...[undefined, 0, -1, 12001, 1.5, NaN, Infinity, '1', null].map(timeoutMs => ({ socketPath: local.socketPath, timeoutMs })),
    ...[undefined, 0, -1, 262145, 1.5, NaN, Infinity, '1', null].map(maxResponseBytes => ({ socketPath: local.socketPath, maxResponseBytes })),
    null, [], {}, Object.create({ socketPath: local.socketPath }), accessor, pathAccessor, bytesAccessor, trap,
    new Proxy({ socketPath: local.socketPath }, { getPrototypeOf() { throw new Error('private reflection'); } }),
    { socketPath: local.socketPath, timeoutMs: undefined }, { socketPath: local.socketPath, maxResponseBytes: undefined },
  ];
  const guarded = await withTransportInstrumentation(async () => {
    for (const input of invalidInputs) assertDenied(await observeDockerDaemonVersion(input));
  }, { intercept: true, captureTimers: true });
  assert.equal(guarded.agents.length, 0, 'invalid selected data must be rejected before Agent construction');
  assert.equal(guarded.requests.length, 0, 'invalid selected data must be rejected before request construction');
  assert.equal(guarded.timerDelays.length, 0);
  assert.equal(getterCalls, 0);
  assert.equal((await observeAndDrain(local, unknownTrap)).ok, true);
  assert.equal(getterCalls, 0, 'unknown keys are neither enumerated nor read');
  assert.equal(local.requests.length, 1, 'only the unknown-field record reaches the fixture');
});

finiteTest('inclusive input and defaults reach real private Agent/request construction with exact fixed options', async t => {
  const local = await fixture(t);
  const cases = [
    { input: { socketPath: '/x', timeoutMs: 1 }, timeout: 1 },
    { input: { socketPath: '/x', timeoutMs: 12000 }, timeout: 12000 },
    { input: { socketPath: '/x', maxResponseBytes: 1 }, timeout: 12000 },
    { input: { socketPath: '/x', maxResponseBytes: 262144 }, timeout: 12000 },
    { input: { socketPath: '/x' }, timeout: 12000 },
    { input: { socketPath: `/${'x'.repeat(4095)}` }, timeout: 12000 },
  ];
  const observed = await withTransportInstrumentation(async () => {
    for (const item of cases) assertDenied(await observeDockerDaemonVersion(item.input));
  }, { intercept: true, captureTimers: true });
  assert.equal(observed.agents.length, cases.length);
  assert.equal(observed.requests.length, cases.length);
  assert.equal(observed.timerDelays.length, cases.length);
  assert.equal(observed.destroyCalls, cases.length);
  assert.equal(new Set(observed.agents).size, cases.length, 'every call owns a distinct private Agent');
  for (let index = 0; index < cases.length; index++) {
    const item = cases[index]; const request = observed.requests[index];
    assert.deepEqual(observed.agentOptions[index], { keepAlive: false, proxyEnv: undefined, maxSockets: 1, maxTotalSockets: 1 });
    assert.ok(observed.timerDelays[index] > 0 && observed.timerDelays[index] <= item.timeout);
    if (item.timeout === 12000) assert.ok(observed.timerDelays[index] > 11000, 'default/maximum deadline is the observed 12-second timer');
    assert.equal(request.socketPath, item.input.socketPath);
    assert.equal(request.method, 'GET');
    assert.equal(request.path, '/v1.48/version');
    assert.deepEqual(request.headers, { Host: 'localhost', Accept: 'application/json', Connection: 'close' });
    assert.equal(request.agent, observed.agents[index]);
    assert.equal(request.maxHeaderSize, 8192);
    assert.equal(request.insecureHTTPParser, false);
    assert.equal(Object.hasOwn(request, 'host'), false);
    assert.equal(Object.hasOwn(request, 'timeout'), false, 'deadline is implemented by the observed timer, not an invented HTTP option');
  }
  assert.equal(local.requests.length, 0);
  assert.equal(local.peers.size, 0);
});

finiteTest('absent input defaults use a real default-size body buffer and return absent minimum', async t => {
  const local = await fixture(t);
  const body = { Version: 'legacy', ApiVersion: '1.48', Os: 'linux', Arch: 'arm64', Platform: { Name: 'PRIVATE_PLATFORM' } };
  local.controls.respond = (_req, res) => reply(res, 200, body);
  const input = Object.assign(Object.create(null), { socketPath: local.socketPath });
  const observed = await withTransportInstrumentation(() => observeAndDrain(local, input), { captureTimers: true, captureAlloc: true });
  const result = observed.result;
  assert.equal(result.ok, true);
  assert.deepEqual(result.daemon.minimumApiVersion, { kind: 'absent' });
  assert.equal(deeplyFrozen(result), true);
  assert.equal(Object.keys(result).join(','), 'ok,daemon');
  assert.deepEqual(Object.keys(result.daemon).sort(), ['apiVersion', 'architecture', 'minimumApiVersion', 'os', 'version']);
  assert.equal(JSON.stringify(result).includes('PRIVATE_PLATFORM'), false);
  assert.deepEqual(observed.allocatedBytes.filter(item => item.observerOwned).map(item => item.size), [262144], 'the observer allocated exactly its default bounded body buffer');
  assert.ok(observed.timerDelays.some(delay => delay > 11000 && delay <= 12000), 'the actual default cooperative timer is near 12 seconds, not an HTTP timeout option');
  assert.notEqual(result.daemon, body);
  assert.equal(Object.isFrozen(body), false);
  const explicitUpper = await withTransportInstrumentation(
    () => observeAndDrain(local, { socketPath: local.socketPath, maxResponseBytes: 262144 }), { captureAlloc: true });
  assert.equal(explicitUpper.result.ok, true);
  assert.deepEqual(explicitUpper.allocatedBytes.filter(item => item.observerOwned).map(item => item.size), [262144], 'explicit upper input cap matches the actual owned body buffer');
});

finiteTest('explicit one-byte cap allocates one owned body byte before malformed JSON is denied', async t => {
  const local = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1' });
    res.end('{');
  });
  const observed = await withTransportInstrumentation(
    () => observeAndDrain(local, { socketPath: local.socketPath, maxResponseBytes: 1 }), { captureAlloc: true });
  assertDenied(observed.result);
  assert.deepEqual(observed.allocatedBytes.filter(item => item.observerOwned).map(item => item.size), [1], 'exactly one observer-owned Buffer.alloc(1) precedes the fixed JSON denial');
  assert.equal(local.requests.length, 1);
});

finiteTest('response byte cap accepts the exact declared UTF-8 length and exact chunked cap, and denies overflow', async t => {
  const local = await fixture(t);
  const body = { ...validVersion, UnknownMultibyte: 'é🧪' };
  const text = json(body); const size = Buffer.byteLength(text);
  assert.ok(size > text.length, 'UTF-8 cap uses encoded bytes rather than JavaScript character count');
  let servedLength;
  local.controls.respond = (_req, res) => {
    const encoded = json(body);
    servedLength = Buffer.byteLength(encoded);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(servedLength) });
    res.end(encoded);
  };
  assert.equal((await observeAndDrain(local, { socketPath: local.socketPath, maxResponseBytes: size })).ok, true);
  assert.equal(servedLength, size, 'the same served multibyte body has Content-Length exactly equal to the configured cap');
  local.controls.respond = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }); res.end(text); };
  assert.equal((await observeAndDrain(local, { socketPath: local.socketPath, maxResponseBytes: size })).ok, true);
  local.controls.respond = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }); res.end(`${text} `); };
  assertDenied(await observeAndDrain(local, { socketPath: local.socketPath, maxResponseBytes: size }));
  local.controls.respond = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(size + 1) }); res.end(); };
  assertDenied(await observeAndDrain(local, { socketPath: local.socketPath, maxResponseBytes: size }));
});

finiteTest('framing and selected headers accept positive UTF-8/identity and reject duplicates, ambiguity, unsupported coding, and trailers', async t => {
  const local = await fixture(t);
  const text = json(validVersion);
  local.controls.respond = (_req, res) => reply(res, 200, validVersion, { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Encoding': 'identity' });
  assert.equal((await observeAndDrain(local, { socketPath: local.socketPath })).ok, true);
  local.controls.respond = (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${text}`);
  assert.equal((await observeAndDrain(local, { socketPath: local.socketPath })).ok, true);
  const chunk = Buffer.from(text);
  const chunkedWire = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${chunk.length.toString(16)}\r\n${chunk}\r\n0\r\n\r\n`;
  const bad = [
    (_req, res) => reply(res, 302, validVersion, { Location: '/v1.48/version' }),
    (_req, res) => { res.writeHead(200, ['Content-Type', 'application/json', 'Content-Type', 'application/json', 'Content-Length', String(Buffer.byteLength(text))]); res.end(text); },
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: identity\r\nContent-Encoding: identity\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${chunkedWire.split('Connection: close\r\n\r\n')[1]}`),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTrailer: X-A\r\nTrailer: X-B\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${text}`),
    (_req, res) => res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: gzip\r\nConnection: close\r\n\r\n'),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`),
    (_req, res) => reply(res, 200, validVersion, { 'Content-Type': 'text/plain' }),
    (_req, res) => reply(res, 200, validVersion, { 'Content-Type': 'application/json; charset=latin1' }),
    (_req, res) => reply(res, 200, validVersion, { 'Content-Encoding': 'gzip' }),
    (_req, res) => res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nTrailer: X-Sensitive\r\nConnection: close\r\n\r\n0\r\nX-Sensitive: secret\r\n\r\n'),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${chunk.length.toString(16)}\r\n${chunk}\r\n0\r\nX-Unadvertised: secret\r\n\r\n`),
    (_req, res) => res.socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${chunk.length.toString(16)}\r\n${chunk}\r\n0\r\n`),
    (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' }); res.end('{}'); },
    (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'X-Large': 'x'.repeat(9000), 'Content-Length': String(Buffer.byteLength(text)) }); res.end(text); },
  ];
  for (const respond of bad) { local.controls.respond = respond; assertDenied(await observeAndDrain(local, { socketPath: local.socketPath })); }
});

finiteTest('malformed JSON, invalid UTF-8, BOM, non-object JSON, and incomplete replies deny', async t => {
  const local = await fixture(t);
  const raw = body => (_req, res) => { const bytes = Buffer.from(body); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(bytes.length) }); res.end(bytes); };
  const invalid = [raw('{'), raw(Buffer.from([0xff])), raw(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json(validVersion))])), raw('null'), raw('[]'), raw('"scalar"')];
  for (const respond of invalid) { local.controls.respond = respond; assertDenied(await observeAndDrain(local, { socketPath: local.socketPath })); }
  local.controls.respond = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' }); res.end('{}'); };
  assertDenied(await observeAndDrain(local, { socketPath: local.socketPath }));
});

finiteTest('deadline and slow-body paths destroy only the owned request before the peer finishes', async t => {
  const held = await fixture(t, () => {});
  const started = performance.now();
  const timeout = await observeClientRequestDestroy(() => observeDockerDaemonVersion({ socketPath: held.socketPath, timeoutMs: 50 }), true);
  assertDenied(timeout.result);
  assert.equal(timeout.calls, 1);
  assert.ok(performance.now() - started < 1000);
  await bounded(Promise.all(held.peerClosures), 'held peer closure', FIXTURE_TIMEOUT_MS);
  assert.equal(held.peers.size, 0);
  assert.equal(held.responses[0].finished, false, 'the peer had not finished a response before client destroy');
  assert.equal(JSON.stringify(timeout.result).includes('private'), false);

  const slow = await fixture(t, (_req, res, state) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
    res.write('{"Version":');
    const timer = setInterval(() => res.write(' '), 8);
    state.timers.add(timer);
  });
  const slowResult = await observeClientRequestDestroy(() => observeDockerDaemonVersion({ socketPath: slow.socketPath, timeoutMs: 70 }));
  assertDenied(slowResult.result);
  assert.equal(slowResult.calls, 1);
  await bounded(Promise.all(slow.peerClosures), 'slow-body peer closure', FIXTURE_TIMEOUT_MS);
  assert.equal(slow.peers.size, 0);
  assert.equal(slow.responses[0].finished, false);
  assert.equal(slow.timers.size, 0, 'fixture-owned trickle timer drains when peer closes');
});

finiteTest('connection refusal at a nonexistent child of the owned directory is not an HTTP status response', async t => {
  const local = await fixture(t);
  const missingSocket = join(local.directory, 'missing-socket');
  assertDenied(await observeDockerDaemonVersion({ socketPath: missingSocket, timeoutMs: 500 }));
  assert.equal(local.requests.length, 0);
  assert.equal(local.peers.size, 0);
  assert.equal(local.directory.startsWith('/tmp/h1-c14-'), true);
});

finiteTest('manager validates exact directory/socket identities, permissions, and content before close and removal', async t => {
  const local = await fixture(t);
  const receipt = await cleanupOwnedFixture(local);
  assert.equal(receipt.result, 'removed');
  assert.deepEqual(local.precloseValidation, { directoryIdentity: true, directoryType: true, directoryPermissions: true,
    expectedEntries: true, socketIdentity: true, socketPermissions: true, pendingOperations: true, acceptedPeers: true });
  assert.equal(local.closeInvocations.length, 1);
  assert.deepEqual(local.closeInvocations[0].proof, local.precloseValidation);
  assert.equal(local.closeInvocations[0].listening, true);
  assert.equal(local.socketTerminal.result, 'removed-by-prevalidated-server-close');
  assert.equal(local.directoryTerminal.result, 'removed-by-validated-rmdir');
  assert.equal(receipt.pending, 0);
  assert.equal(receipt.peers, 0);
  assert.equal(local.rmdirDispatches, 1, 'rmdir occurs once after the final identity and empty-content check');
});

finiteTest('synthetic directory, socket, and content mismatches preserve before destructive dispatch; creator recovery is separate', async t => {
  const faults = [
    { name: 'directory device', reason: 'directory-device-mismatch', apply: local => { local.controls.directoryStatView = stat => ({ ...stat, dev: stat.dev + 1 }); } },
    { name: 'directory inode', reason: 'directory-inode-mismatch', apply: local => { local.controls.directoryStatView = stat => ({ ...stat, ino: stat.ino + 1 }); } },
    { name: 'directory type', reason: 'directory-type-mismatch', apply: local => { local.controls.directoryStatView = stat => ({ ...stat, isDirectory: false }); } },
    { name: 'directory permissions', reason: 'directory-permissions-mismatch', apply: local => { local.controls.directoryStatView = stat => ({ ...stat, mode: stat.mode ^ 1 }); } },
    { name: 'socket device', reason: 'socket-device-mismatch', apply: local => { local.controls.socketStatView = stat => ({ ...stat, dev: stat.dev + 1 }); } },
    { name: 'socket inode', reason: 'socket-inode-mismatch', apply: local => { local.controls.socketStatView = stat => ({ ...stat, ino: stat.ino + 1 }); } },
    { name: 'socket type', reason: 'socket-type-mismatch', apply: local => { local.controls.socketStatView = stat => ({ ...stat, isSocket: false }); } },
    { name: 'socket permissions', reason: 'socket-permissions-mismatch', apply: local => { local.controls.socketStatView = stat => ({ ...stat, mode: stat.mode ^ 1 }); } },
    { name: 'directory contents', reason: 'directory-content-mismatch', apply: local => { local.controls.entriesView = entries => [...entries, 'synthetic-unowned-entry']; } },
  ];
  for (const fault of faults) {
    const local = await fixture(t);
    fault.apply(local);
    let recoveryReceipt;
    try {
      const preserved = await cleanupOwnedFixture(local);
      assert.equal(preserved.result, 'preserved', fault.name);
      assert.equal(preserved.synthetic, true);
      assert.equal(preserved.reason, fault.reason, fault.name);
      assert.equal(preserved.closeDispatches, 0);
      assert.equal(preserved.rmdirDispatches, 0);
      assert.equal(local.closeInvocations.length, 0);
      assert.equal(local.server.listening, true);
      const actualDirectory = await bounded(lstat(local.directory), 'confirm synthetically preserved directory');
      assert.equal(actualDirectory.dev, local.directoryIdentity.dev);
      assert.equal(actualDirectory.ino, local.directoryIdentity.ino);
      const actualSocket = await bounded(lstat(local.socketPath), 'confirm synthetically preserved socket');
      assert.equal(actualSocket.dev, local.socketIdentity.dev);
      assert.equal(actualSocket.ino, local.socketIdentity.ino);
    } finally {
      local.controls.directoryStatView = undefined;
      local.controls.socketStatView = undefined;
      local.controls.entriesView = undefined;
      if (local.managerReceipt?.synthetic && !local.recovered) recoveryReceipt = await recoverOwnedFixture(local);
    }
    assert.equal(local.terminalReceipt?.result, 'removed');
    assert.equal(local.terminalReceipt?.actor, 'creator-recovery');
    assert.equal(local.terminalReceipt.directoryIdentity.dev, local.directoryIdentity.dev);
    assert.equal(local.terminalReceipt.directoryIdentity.ino, local.directoryIdentity.ino);
    assert.equal(local.terminalReceipt.socketIdentity.dev, local.socketIdentity.dev);
    assert.equal(local.terminalReceipt.socketIdentity.ino, local.socketIdentity.ino);
    assert.equal(recoveryReceipt?.result, 'removed');
    assert.equal(local.closeInvocations.length, 1);
  }
});

finiteTest('cancellation while mkdtemp completion is pending still captures that exact directory identity before stopping setup', async t => {
  const entered = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, { afterMkdtemp: () => { entered.resolve(); return release.promise; } });
  await bounded(entered.promise, 'post-mkdtemp hold entered', FIXTURE_TIMEOUT_MS);
  const exactCreatedPath = local.directory;
  assert.ok(exactCreatedPath.startsWith('/tmp/h1-c14-'));
  assert.equal(local.directoryIdentity, null);
  assert.ok([...local.pending.values()].some(record => record.label === 'create directory and capture exact identity'));
  local.closing = true;
  release.resolve();
  await assert.rejects(bounded(local.ready, 'cancelled post-mkdtemp setup', FIXTURE_TIMEOUT_MS), /fixture setup cancelled/);
  assert.equal(local.directory, exactCreatedPath);
  assert.ok(local.directoryIdentity, 'pending creator operation obtains identity for its exact new directory');
  assert.equal(local.pending.size, 0);
  assert.equal(local.listenerDispatches, 0);
  assert.equal(local.operationReceipts.some(record => record.label === 'private chmod'), false);
  const receipt = await cleanupOwnedFixture(local);
  assert.equal(receipt.result, 'removed');
  assert.equal(receipt.socket, 'not-created');
  assert.equal(local.closeDispatches, 0);
});

finiteTest('cancellation during delayed chmod completion drains the owned operation and fences the next lstat', async t => {
  const entered = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, { afterChmod: () => { entered.resolve(); return release.promise; } });
  await bounded(entered.promise, 'post-chmod hold entered', FIXTURE_TIMEOUT_MS);
  assert.ok([...local.pending.values()].some(record => record.label === 'private chmod'));
  local.closing = true;
  release.resolve();
  await assert.rejects(bounded(local.ready, 'cancelled chmod continuation', FIXTURE_TIMEOUT_MS), /fixture setup cancelled/);
  assert.equal(local.pending.size, 0);
  assert.equal(local.operationReceipts.some(record => record.label === 'verify private directory mode'), false);
  assert.equal(local.listenerDispatches, 0);
  const receipt = await cleanupOwnedFixture(local);
  assert.equal(receipt.result, 'removed');
  assert.equal(local.directoryTerminal.result, 'removed-by-validated-rmdir');
});

finiteTest('cancellation during listener completion still captures the exact owned socket before cleanup', async t => {
  const entered = deferred(); const release = deferred();
  const local = beginFixture(t, undefined, { afterListen: () => { entered.resolve(); return release.promise; } });
  await bounded(entered.promise, 'post-listen identity hold entered', FIXTURE_TIMEOUT_MS);
  assert.equal(local.listenerDispatches, 1);
  assert.equal(local.socketIdentity, null);
  assert.ok([...local.pending.values()].some(record => record.label === 'Unix listener creation and exact socket identity capture'));
  local.closing = true;
  release.resolve();
  await assert.rejects(bounded(local.ready, 'cancelled socket identity continuation', FIXTURE_TIMEOUT_MS), /fixture setup cancelled/);
  assert.ok(local.socketIdentity, 'late completion captures the exact socket created by this listener operation');
  assert.equal(local.pending.size, 0);
  const receipt = await cleanupOwnedFixture(local);
  assert.equal(receipt.result, 'removed');
  assert.equal(local.precloseValidation.socketIdentity, true);
  assert.equal(local.closeInvocations.length, 1);
  assert.equal(local.closeInvocations[0].proof.socketIdentity, true);
  assert.equal(local.socketTerminal.identity.dev, local.socketIdentity.dev);
  assert.equal(local.socketTerminal.identity.ino, local.socketIdentity.ino);
});

finiteTest('redirects are denied after exactly one request; HTTP 404 is one HTTP denial', async t => {
  const redirect = await fixture(t, (_req, res) => reply(res, 302, validVersion, { Location: '/v1.48/version' }));
  assertDenied(await observeAndDrain(redirect, { socketPath: redirect.socketPath }));
  assert.equal(redirect.requests.length, 1);
  assert.equal(redirect.requests[0].url, '/v1.48/version');
  const missing = await fixture(t, (_req, res) => reply(res, 404));
  assertDenied(await observeAndDrain(missing, { socketPath: missing.socketPath }));
  assert.equal(missing.requests.length, 1);
});
