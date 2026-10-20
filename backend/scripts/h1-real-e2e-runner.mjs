import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { chmod, lstat, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const USAGE = 'Usage: node backend/scripts/h1-real-e2e-runner.mjs --qualification <project-local.json>\n';

/** Capture one caller-owned child; a deadline never implies exit, EOF or tree cleanup. */
export function captureChild(child, {
  totalBudgetMs = 65000, termGraceMs = 1000, finalDrainMs = 1000,
  maxOutputBytes = 2 * 1024 * 1024,
  setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now(),
} = {}) {
  if (![totalBudgetMs, termGraceMs, finalDrainMs, maxOutputBytes].every(Number.isSafeInteger) ||
      termGraceMs <= 0 || finalDrainMs <= 0 || maxOutputBytes <= 0 ||
      totalBudgetMs <= termGraceMs + finalDrainMs) throw new Error('Invalid capture bounds');
  const started = now();
  const deadline = started + totalBudgetMs;
  return new Promise(resolveResult => {
    const chunks = { stdout: [], stderr: [] };
    const bytes = { stdout: 0, stderr: 0 };
    const complete = { stdout: false, stderr: false };
    const signals = [];
    const timers = new Set();
    let done = false, reason = 'completed', aborting = false;
    let exitObserved = false, closeObserved = false, code = null, signal = null, errorCode = null;
    const later = (fn, delay) => {
      const timer = setTimer(fn, Math.max(0, delay)); timers.add(timer); return timer;
    };
    const clear = () => { for (const timer of timers) clearTimer(timer); timers.clear(); };
    const requestSignal = name => {
      if (exitObserved || done) return;
      let accepted = false;
      try { accepted = child.kill(name) === true; } catch { /* Signal request is not exit evidence. */ }
      signals.push(Object.freeze({ signal: name, accepted }));
    };
    const finish = () => {
      if (done) return;
      done = true; clear();
      const captureComplete = closeObserved && complete.stdout && complete.stderr;
      const successPath = reason === 'completed' && exitObserved && captureComplete && errorCode === null;
      const publicCode = successPath && Number.isInteger(code) && code >= 0 ? code : 1;
      // Stop observing inherited streams; do not claim their writers were killed or reaped.
      if (!closeObserved) {
        child.stdout?.destroy(); child.stderr?.destroy(); child.unref?.();
      }
      resolveResult(Object.freeze({
        stdout: Buffer.concat(chunks.stdout), stderr: Buffer.concat(chunks.stderr),
        stdoutBytes: bytes.stdout, stderrBytes: bytes.stderr,
        stdoutComplete: complete.stdout, stderrComplete: complete.stderr, captureComplete,
        childExitStatus: code, childSignal: signal, childExitObserved: exitObserved,
        actualCloseObserved: closeObserved, timedOut: reason === 'deadline',
        outputLimitExceeded: reason === 'output_limit', childErrorCode: errorCode,
        outcome: reason, publicCheckExitStatus: publicCode, elapsedMs: now() - started,
        signalRequests: Object.freeze([...signals]), descendantExitProven: false,
      }));
    };
    const abort = cause => {
      if (done || aborting) return;
      aborting = true; reason = cause; clear();
      requestSignal('SIGTERM');
      const remaining = Math.max(0, deadline - now());
      if (remaining === 0) { requestSignal('SIGKILL'); finish(); return; }
      later(() => requestSignal('SIGKILL'), Math.min(termGraceMs, remaining));
      later(finish, Math.min(termGraceMs + finalDrainMs, remaining));
    };
    for (const channel of ['stdout', 'stderr']) {
      const stream = child[channel];
      stream?.on('data', chunk => {
        if (done) return;
        const value = Buffer.from(chunk);
        const available = Math.max(0, maxOutputBytes - bytes[channel]);
        bytes[channel] += value.length;
        if (available > 0) chunks[channel].push(value.subarray(0, available));
        if (bytes[channel] > maxOutputBytes) abort('output_limit');
      });
      stream?.once('end', () => { if (!done) complete[channel] = true; });
      stream?.on('error', () => { if (!done) abort('stream_error'); });
    }
    child.once('exit', (status, exitSignal) => {
      if (!done) { exitObserved = true; code = status; signal = exitSignal; }
    });
    child.once('error', error => {
      if (done) return;
      errorCode = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'UNKNOWN';
      reason = 'child_error'; finish();
    });
    child.once('close', (status, exitSignal) => {
      if (done) return;
      closeObserved = true;
      if (!exitObserved) { code = status; signal = exitSignal; }
      finish();
    });
    later(() => abort('deadline'), totalBudgetMs - termGraceMs - finalDrainMs);
  });
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(USAGE); return; }
  if (args.length !== 2 || args[0] !== '--qualification') {
    process.stderr.write(USAGE); process.exitCode = 2; return;
  }
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const qualification = resolve(root, args[1]);
  const info = qualification.startsWith(root + sep) ? await lstat(qualification).catch(() => null) : null;
  if (!info?.isFile() || info.size > 4096 || await realpath(qualification) !== qualification) {
    process.stderr.write('Qualification must be a regular, non-redirected project-local file.\n');
    process.exitCode = 2; return;
  }
  const parent = join(root, 'odd/probes/h1-completion');
  await mkdir(parent, { recursive: true });
  const evidence = await mkdtemp(join(parent, 'bounded-real-e2e-')); await chmod(evidence, 0o700);
  const child = spawn('/opt/homebrew/Cellar/python@3.14/3.14.7/Frameworks/Python.framework/Versions/3.14/bin/python3.14',
    ['-I', '-S', '-B', 'backend/scripts/h1-real-e2e.py', '--execute', '--cleanup-owned', '--qualification', qualification],
    { cwd: root, env: { PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C', HOME: evidence },
      stdio: ['ignore', 'pipe', 'pipe'] });
  const result = await captureChild(child);
  let report;
  try { report = JSON.parse(result.stdout.toString('utf8')); } catch { /* Partial output remains raw evidence. */ }
  const publicCode = result.publicCheckExitStatus === 0 && report?.passed === true ? 0 :
    result.publicCheckExitStatus !== 0 ? result.publicCheckExitStatus : 1;
  const { stdout, stderr, ...metadata } = result;
  const summary = { ...metadata, publicCheckExitStatus: publicCode,
    reportParsed: report !== undefined, reportPassed: report?.passed === true,
    totalBudgetMs: 65000, termAtMs: 63000, killAtMs: 64000,
    evidence: relative(root, evidence) };
  for (const [name, data] of [['stdout.txt', stdout], ['stderr.txt', stderr], ['result.json', JSON.stringify(summary, null, 2) + '\n']]) {
    await writeFile(join(evidence, name), data, { mode: 0o600, flag: 'wx' });
  }
  process.stdout.write(JSON.stringify(summary) + '\n'); process.exitCode = publicCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('H1 E2E capture failed; no success is implied.\n'); process.exitCode = 1;
  });
}
