import { request as httpRequest, Agent } from 'node:http';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';

const DENIAL = Object.freeze({ ok: false, error: 'Unable to observe Docker daemon version.' });
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESPONSE_BYTES = 262144;
const SELECTED_HEADERS = ['content-type', 'content-encoding', 'content-length', 'transfer-encoding', 'trailer'];
const noop = () => {};

function readInput(input) {
  if (input === null || typeof input !== 'object') return undefined;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const fields = Object.create(null);
  for (const key of ['socketPath', 'timeoutMs', 'maxResponseBytes']) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) continue;
    if (!Object.hasOwn(descriptor, 'value')) return undefined;
    fields[key] = { present: true, value: descriptor.value };
  }
  const socketPath = fields.socketPath?.value;
  if (typeof socketPath !== 'string' || socketPath.length < 2 || socketPath.length > 4096 ||
      socketPath === '/' || !socketPath.startsWith('/') || /[\x00-\x1f\x7f]/.test(socketPath)) return undefined;
  const timeoutMs = fields.timeoutMs ? fields.timeoutMs.value : DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = fields.maxResponseBytes ? fields.maxResponseBytes.value : DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12000 ||
      !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 262144) return undefined;
  return { socketPath, timeoutMs, maxResponseBytes };
}

function selectedHeadersAreSingle(response) {
  for (const name of SELECTED_HEADERS) {
    let count = 0;
    for (let index = 0; index < response.rawHeaders.length; index += 2) {
      if (response.rawHeaders[index].toLowerCase() === name) count++;
    }
    if (count > 1) return false;
  }
  return true;
}

function acceptedFraming(response, cap) {
  if (!selectedHeadersAreSingle(response)) return undefined;
  const contentType = response.headers['content-type'];
  if (typeof contentType !== 'string' ||
      !/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?[ \t]*$/i.test(contentType)) return undefined;
  const encoding = response.headers['content-encoding'];
  if (encoding !== undefined && (typeof encoding !== 'string' || encoding.toLowerCase() !== 'identity')) return undefined;
  if (response.headers.trailer !== undefined) return undefined;
  const length = response.headers['content-length'];
  const transfer = response.headers['transfer-encoding'];
  if (length !== undefined && transfer !== undefined) return undefined;
  if (length !== undefined) {
    if (typeof length !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(length)) return undefined;
    const amount = Number(length);
    if (!Number.isSafeInteger(amount) || amount > cap) return undefined;
    return { kind: 'length', length: amount };
  }
  if (transfer !== undefined) return typeof transfer === 'string' && transfer.toLowerCase() === 'chunked' ? { kind: 'chunked' } : undefined;
  return { kind: 'close-delimited' };
}

function projectDaemon(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const required = ['Version', 'ApiVersion', 'Os', 'Arch'];
  for (const key of required) if (!Object.hasOwn(parsed, key) || typeof parsed[key] !== 'string') return undefined;
  const { Version, ApiVersion, MinAPIVersion, Os, Arch } = parsed;
  if (Version.length < 1 || Version.length > 256 || !/^[A-Za-z0-9._+-]+$/.test(Version)) return undefined;
  if (Os.length < 1 || Os.length > 64 || !/^[A-Za-z0-9._-]+$/.test(Os)) return undefined;
  if (Arch.length < 1 || Arch.length > 64 || !/^[A-Za-z0-9._-]+$/.test(Arch)) return undefined;
  if (ApiVersion.length < 1 || ApiVersion.length > 32 || !/^[0-9]+\.[0-9]+$/.test(ApiVersion)) return undefined;
  let minimumApiVersion;
  if (Object.hasOwn(parsed, 'MinAPIVersion')) {
    if (typeof MinAPIVersion !== 'string' || MinAPIVersion.length < 1 || MinAPIVersion.length > 32 ||
        !/^[0-9]+\.[0-9]+$/.test(MinAPIVersion)) return undefined;
    minimumApiVersion = Object.freeze({ kind: 'present', value: MinAPIVersion });
  } else {
    minimumApiVersion = Object.freeze({ kind: 'absent' });
  }
  const daemon = Object.freeze({ version: Version, apiVersion: ApiVersion, minimumApiVersion, os: Os, architecture: Arch });
  return Object.freeze({ ok: true, daemon });
}

/** Observe one bounded version report from a Docker daemon on an explicit Unix socket. */
export async function observeDockerDaemonVersion(input) {
  let config;
  try { config = readInput(input); } catch { return DENIAL; }
  if (!config) return DENIAL;

  const started = performance.now();
  const deadline = started + config.timeoutMs;
  let timer;
  let request;
  let response;
  let agent;
  let body;
  let settled = false;
  return new Promise(resolve => {
    const expired = () => performance.now() >= deadline;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      body = undefined;
      const socket = request?.socket || response?.socket;
      const releaseGuards = () => {
        request?.removeAllListeners();
        response?.removeAllListeners();
        socket?.removeListener('error', noop);
      };
      if (request) request.on('error', noop);
      if (response) response.on('error', noop);
      if (socket) {
        socket.on('error', noop);
        if (!socket.closed) socket.once('close', releaseGuards);
        else releaseGuards();
      } else {
        request?.once('close', releaseGuards);
        response?.once('close', releaseGuards);
      }
      try { response?.destroy(); } catch {}
      try { request?.destroy(); } catch {}
      try { agent?.destroy(); } catch {}
      resolve(result);
    };
    const deny = () => finish(DENIAL);
    const inTime = () => !expired();

    try {
      timer = setTimeout(deny, Math.max(1, deadline - performance.now()));
      if (!inTime()) { deny(); return; }
      agent = new Agent({ keepAlive: false, proxyEnv: undefined, maxSockets: 1, maxTotalSockets: 1 });
      if (!inTime()) { deny(); return; }
      request = httpRequest({
        socketPath: config.socketPath,
        method: 'GET',
        path: '/v1.48/version',
        headers: { Host: 'localhost', Accept: 'application/json', Connection: 'close' },
        agent,
        maxHeaderSize: 8192,
        insecureHTTPParser: false,
      });
      request.on('error', deny);
      request.on('continue', deny);
      request.on('information', info => { if (info.statusCode !== 100) deny(); });
      request.on('connect', (_res, socket) => { socket.destroy(); deny(); });
      request.on('upgrade', (_res, socket) => { socket.destroy(); deny(); });
      request.once('response', incoming => {
        response = incoming;
        if (!inTime() || incoming.statusCode !== 200) { deny(); return; }
        const framing = acceptedFraming(incoming, config.maxResponseBytes);
        if (!framing) { deny(); return; }
        body = Buffer.alloc(config.maxResponseBytes);
        let byteCount = 0;
        incoming.on('error', deny);
        incoming.on('aborted', deny);
        incoming.on('data', chunk => {
          if (settled) return;
          if (!inTime() || !Buffer.isBuffer(chunk) || chunk.length > config.maxResponseBytes - byteCount) { deny(); return; }
          chunk.copy(body, byteCount);
          byteCount += chunk.length;
        });
        incoming.once('end', () => {
          if (settled) return;
          if (!inTime() || !incoming.complete || incoming.rawTrailers.length !== 0) { deny(); return; }
          if (framing.kind === 'length' && byteCount !== framing.length) { deny(); return; }
          let text;
          try {
            if (!inTime()) { deny(); return; }
            text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body.subarray(0, byteCount));
            if (!inTime()) { deny(); return; }
          } catch { deny(); return; }
          let parsed;
          try {
            if (!inTime()) { deny(); return; }
            parsed = JSON.parse(text);
            if (!inTime()) { deny(); return; }
          } catch { deny(); return; }
          let result;
          try {
            if (!inTime()) { deny(); return; }
            result = projectDaemon(parsed);
            if (!inTime()) { deny(); return; }
          } catch { deny(); return; }
          if (!result || !inTime()) { deny(); return; }
          finish(result);
        });
        incoming.once('close', () => { if (!incoming.complete) deny(); });
      });
      if (!inTime()) { deny(); return; }
      request.end();
    } catch { deny(); }
  });
}
