import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as probe from '../../odd/checks/h1-browser-real.mjs';

class FakeWebSocket extends EventTarget {
  sent = [];
  readyState = 0;
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  emit(type, detail = {}) {
    const event = new Event(type);
    Object.assign(event, detail);
    this.dispatchEvent(event);
  }
}

function fakeTimers() {
  let next = 0;
  const pending = new Map();
  return {
    setTimer(callback, delay) { const id = ++next; pending.set(id, { callback, delay }); return id; },
    clearTimer(id) { pending.delete(id); },
    runNext() { const [id, timer] = pending.entries().next().value ?? []; assert.ok(timer, 'expected a pending timer'); pending.delete(id); timer.callback(); },
    count() { return pending.size; },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('CDP connection deadline rejects a socket that never opens and clears its timer', async () => {
  assert.equal(typeof probe.connectCdp, 'function');
  const timers = fakeTimers();
  const ws = new FakeWebSocket();
  const connecting = probe.connectCdp('ws://fake.invalid', { WebSocketImpl: class { constructor() { return ws; } },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, connectionTimeout: 50 });
  timers.runNext();
  await assert.rejects(connecting, { message: 'CDP connection timed out' });
  assert.equal(timers.count(), 0);
});

test('CDP command deadlines reject pending commands and close rejects every waiter', async () => {
  assert.equal(typeof probe.connectCdp, 'function');
  const timers = fakeTimers();
  const ws = new FakeWebSocket();
  const connecting = probe.connectCdp('ws://fake.invalid', { WebSocketImpl: class { constructor() { return ws; } },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, commandTimeout: 40 });
  ws.emit('open');
  const cdp = await connecting;
  const first = cdp.call('Runtime.evaluate');
  const second = cdp.call('Page.navigate');
  assert.equal(ws.sent.length, 2);
  timers.runNext();
  await assert.rejects(first, { message: 'CDP command timed out' });
  ws.close();
  await assert.rejects(second, { message: 'CDP connection closed' });
  await assert.rejects(cdp.call('Page.reload'), { message: 'CDP connection closed' });
  assert.equal(timers.count(), 0);
});

test('CDP socket error rejects pending commands and later calls fail closed', async () => {
  assert.equal(typeof probe.connectCdp, 'function');
  const timers = fakeTimers();
  const ws = new FakeWebSocket();
  const connecting = probe.connectCdp('ws://fake.invalid', { WebSocketImpl: class { constructor() { return ws; } },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  ws.emit('open');
  const cdp = await connecting;
  const pending = cdp.call('Runtime.evaluate');
  ws.emit('error');
  await assert.rejects(pending, { message: 'CDP connection failed' });
  await assert.rejects(cdp.call('Page.reload'), { message: 'CDP connection failed' });
  assert.equal(timers.count(), 0);
});

test('CDP command success and protocol errors retain their bounded responses', async () => {
  const timers = fakeTimers();
  const ws = new FakeWebSocket();
  const connecting = probe.connectCdp('ws://fake.invalid', { WebSocketImpl: class { constructor() { return ws; } },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  ws.emit('open');
  const cdp = await connecting;
  const success = cdp.call('Runtime.evaluate');
  ws.emit('message', { data: JSON.stringify({ id: ws.sent[0].id, result: { value: 42 } }) });
  assert.deepEqual(await success, { value: 42 });
  const failure = cdp.call('Page.navigate');
  ws.emit('message', { data: JSON.stringify({ id: ws.sent[1].id, error: { message: 'private protocol detail' } }) });
  await assert.rejects(failure, { message: 'CDP command failed' });
  assert.equal(timers.count(), 0);
  cdp.close();
});

test('process readiness turns asynchronous spawn errors into controlled rejection', async () => {
  assert.equal(typeof probe.waitForProcessReady, 'function');
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const outcome = probe.waitForProcessReady(child, async () => false, { timeout: 100, interval: 10 });
  const launchError = new Error('private executable path');
  child.emit('error', launchError);
  await assert.rejects(outcome, { message: 'process failed to launch' });
  assert.equal(child.listenerCount('error'), 1, 'launch error remains handled after readiness settles');
});

test('process readiness preserves successful readiness', async () => {
  assert.equal(typeof probe.waitForProcessReady, 'function');
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  await probe.waitForProcessReady(child, async () => true, { timeout: 100, interval: 10 });
});

function fakeProcess() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('startChrome launch failure is handled by its actual readiness path', async () => {
  const child = fakeProcess();
  globalThis.__H1_TEST_SPAWN = () => child;
  globalThis.__H1_TEST_PORT = async () => 12345;
  const absorbProbeError = () => child.removeListener('error', absorbProbeError);
  child.on('error', absorbProbeError);
  const pending = probe.startChrome({ spawnProcess: () => child, listenPortFn: async () => 12345,
    fetchTargets: async () => ({ json: async () => [] }), connect: async () => { throw new Error('unexpected CDP connect'); } });
  if (typeof probe.waitForProcessReady === 'function') queueMicrotask(() => child.emit('error', new Error('private executable path')));
  await assert.rejects(pending, { message: 'process failed to launch' });
  assert.equal(child.listenerCount('error'), 1);
});

test('startChrome success uses the spawned child for bounded target readiness', async () => {
  const child = fakeProcess();
  globalThis.__H1_TEST_SPAWN = () => child;
  globalThis.__H1_TEST_PORT = async () => 12345;
  const calls = [];
  const result = await probe.startChrome({ spawnProcess: () => child, listenPortFn: async () => 12345,
    fetchTargets: async () => ({ json: async () => [{ type: 'page', webSocketDebuggerUrl: 'ws://fake.invalid/devtools/page' }] }),
    connect: async (url) => { calls.push(['connect', url]); return { call: async (method) => calls.push(['call', method]),
      on: (method) => { calls.push(['on', method]); return () => {}; } }; } });
  assert.equal(result, undefined);
  assert.deepEqual(calls, [['connect', 'ws://fake.invalid/devtools/page'], ['call', 'Network.enable'], ['on', 'Network.responseReceived']]);
});
