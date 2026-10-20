import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { captureChild, USAGE } from './h1-real-e2e-runner.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture() {
  let clock = 0, next = 0;
  const timers = new Map();
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.destroy = () => {}; child.stderr.destroy = () => {};
  child.signals = []; child.kill = signal => { child.signals.push(signal); return true; };
  child.unref = () => {};
  return { child, options: { totalBudgetMs: 100, termGraceMs: 10, finalDrainMs: 10,
    now: () => clock, setTimer: (fn, delay) => { const id = ++next; timers.set(id, { at: clock + delay, fn }); return id; },
    clearTimer: id => timers.delete(id) },
    advance(to) { for (;;) { const entry = [...timers].filter(([, t]) => t.at <= to).sort((a,b) => a[1].at-b[1].at)[0];
      if (!entry) break; const [id,t] = entry; timers.delete(id); clock=t.at; t.fn(); } clock=to; } };
}

test('caller finalizes at its deadline when direct child exits but output streams never close', async () => {
  const f=fixture(); let result;
  captureChild(f.child,f.options).then(value => { result=value; });
  f.child.stdout.emit('data',Buffer.from('partial\n')); f.child.emit('exit',0,null);
  f.advance(100); await Promise.resolve();
  assert.ok(result, 'deadline must settle even without a close event');
  assert.equal(result.timedOut,true);
  assert.equal(result.actualCloseObserved,false);
  assert.equal(result.stdout.toString(),'partial\n');
  assert.equal(result.stderr.toString(),'');
  assert.equal(result.childExitStatus,0);
  assert.equal(result.childExitObserved,true);
  assert.equal(result.stdoutComplete,false);
  assert.equal(result.stderrComplete,false);
  assert.equal(result.publicCheckExitStatus,1);
  assert.deepEqual(f.child.signals,[],'never signal a child already observed exited');
});

test('normal close preserves exact stdout, stderr and nonzero exit status', async () => {
  const f=fixture(); const pending=captureChild(f.child,f.options);
  f.child.stdout.emit('data',Buffer.from('out\n')); f.child.stderr.emit('data',Buffer.from('err\n'));
  f.child.stdout.emit('end'); f.child.stderr.emit('end'); f.child.emit('exit',7,null); f.child.emit('close',7,null);
  const result=await pending;
  assert.equal(result.stdout.toString(),'out\n'); assert.equal(result.stderr.toString(),'err\n');
  assert.equal(result.childExitStatus,7); assert.equal(result.actualCloseObserved,true); assert.equal(result.timedOut,false);
  assert.equal(result.childExitObserved,true); assert.equal(result.stdoutComplete,true); assert.equal(result.stderrComplete,true);
  assert.equal(result.publicCheckExitStatus,7); assert.deepEqual(f.child.signals,[]);
});

test('a live child receives bounded signal requests without fabricated exit or EOF', async () => {
  const f=fixture(); const pending=captureChild(f.child,f.options);
  f.advance(100); const result=await pending;
  assert.deepEqual(f.child.signals,['SIGTERM','SIGKILL']);
  assert.equal(result.elapsedMs,100); assert.equal(result.childExitObserved,false);
  assert.equal(result.childExitStatus,null); assert.equal(result.childSignal,null);
  assert.equal(result.actualCloseObserved,false); assert.equal(result.captureComplete,false);
  assert.equal(result.publicCheckExitStatus,1); assert.equal(result.descendantExitProven,false);
  f.child.emit('exit',0,null); f.child.emit('close',0,null);
  assert.equal(result.childExitObserved,false,'late events cannot rewrite delivered evidence');
});

test('output overflow remains bounded and never implies successful capture', async () => {
  const f=fixture(); const pending=captureChild(f.child,{...f.options,maxOutputBytes:3});
  f.child.stdout.emit('data',Buffer.from('abcde')); f.advance(20);
  const result=await pending;
  assert.equal(result.stdout.toString(),'abc'); assert.equal(result.stdoutBytes,5);
  assert.equal(result.outputLimitExceeded,true); assert.equal(result.publicCheckExitStatus,1);
  assert.equal(result.captureComplete,false); assert.equal(result.elapsedMs,20);
});

test('ordinary successful exit preserves empty stderr and complete capture', async () => {
  const f=fixture(); const pending=captureChild(f.child,f.options);
  f.child.stdout.emit('data',Buffer.from('ok\n')); f.child.stdout.emit('end'); f.child.stderr.emit('end');
  f.child.emit('exit',0,null); f.child.emit('close',0,null);
  const result=await pending;
  assert.equal(result.stdout.toString(),'ok\n'); assert.equal(result.stderr.toString(),'');
  assert.equal(result.publicCheckExitStatus,0); assert.equal(result.captureComplete,true);
  assert.equal(result.outcome,'completed'); assert.deepEqual(f.child.signals,[]);
});

test('help and rejected arguments do not enter the real execution path', () => {
  const script=fileURLToPath(new URL('./h1-real-e2e-runner.mjs',import.meta.url));
  const help=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0); assert.equal(help.stdout,USAGE); assert.equal(help.stderr,'');
  const invalid=spawnSync(process.execPath,[script,'--unknown'],{encoding:'utf8'});
  assert.equal(invalid.status,2); assert.equal(invalid.stdout,''); assert.equal(invalid.stderr,USAGE);
});
