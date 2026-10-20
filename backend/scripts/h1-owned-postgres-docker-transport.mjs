import { request as httpRequest, Agent } from 'node:http';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';
import { parseDockerImageResponse } from './h1-owned-postgres-docker-image-observations.mjs';

const DENIAL = Object.freeze({ ok: false, error: 'Unable to observe Docker image.' });
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESPONSE_BYTES = 262144;
const MAX_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 262144;
const IMAGE_PATH = '/v1.48/images/postgres:17.11-bookworm/json';
const SELECTED_HEADERS = new Set(['content-type', 'content-encoding', 'content-length', 'transfer-encoding']);
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
  for (const [key, fallback, max] of [
    ['timeoutMs', DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS],
    ['maxResponseBytes', DEFAULT_MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES],
  ]) {
    const field = fields[key];
    if (field && (!Number.isInteger(field.value) || field.value < 1 || field.value > max)) return undefined;
    fields[key] = field ? field.value : fallback;
  }
  return { socketPath, timeoutMs: fields.timeoutMs, maxResponseBytes: fields.maxResponseBytes };
}

function hasSingleRawHeader(response, name) {
  let count = 0;
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    if (response.rawHeaders[index].toLowerCase() === name) count++;
  }
  return count <= 1;
}

function acceptedFraming(response, cap) {
  for (const name of SELECTED_HEADERS) if (!hasSingleRawHeader(response, name)) return undefined;
  const contentType = response.headers['content-type'];
  if (typeof contentType !== 'string' ||
      !/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?[ \t]*$/i.test(contentType)) return undefined;
  const contentEncoding = response.headers['content-encoding'];
  if (contentEncoding !== undefined && contentEncoding.toLowerCase() !== 'identity') return undefined;
  const length = response.headers['content-length'];
  const transfer = response.headers['transfer-encoding'];
  if (length !== undefined && transfer !== undefined) return undefined;
  if (length !== undefined) {
    if (typeof length !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(length)) return undefined;
    const bytes = Number(length);
    if (!Number.isSafeInteger(bytes) || bytes > cap) return undefined;
    return { kind: 'length', length: bytes };
  }
  if (transfer === 'chunked') return { kind: 'chunked' };
  return undefined;
}

/** Make one private, bounded request to the fixed local Docker image endpoint. */
export async function observeDockerImage(input) {
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
      try { socket?.destroy(); } catch {}
      try { agent?.destroy(); } catch {}
      resolve(result);
    };
    const deny = () => { void finish(DENIAL); };
    const atDeadline = () => !expired();

    try {
      timer = setTimeout(deny, Math.max(1, deadline - performance.now()));
      if (!atDeadline()) { deny(); return; }
      agent = new Agent({ keepAlive: false, proxyEnv: undefined, maxSockets: 1, maxTotalSockets: 1 });
      request = httpRequest({
        socketPath: config.socketPath,
        method: 'GET',
        path: IMAGE_PATH,
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
        if (!atDeadline() || incoming.statusCode !== 200) { deny(); return; }
        const framing = acceptedFraming(incoming, config.maxResponseBytes);
        if (!framing) { deny(); return; }
        body = Buffer.alloc(config.maxResponseBytes);
        let byteCount = 0;
        incoming.on('error', deny);
        incoming.on('aborted', deny);
        incoming.on('data', chunk => {
          if (settled) return;
          if (!atDeadline() || !Buffer.isBuffer(chunk) || chunk.length > config.maxResponseBytes - byteCount) {
            deny(); return;
          }
          chunk.copy(body, byteCount);
          byteCount += chunk.length;
        });
        incoming.once('end', () => {
          if (settled) return;
          if (!atDeadline() || !incoming.complete || incoming.rawTrailers.length !== 0) { deny(); return; }
          if (framing.kind === 'length' && byteCount !== framing.length) { deny(); return; }
          let text;
          try {
            if (!atDeadline()) { deny(); return; }
            text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body.subarray(0, byteCount));
            if (!atDeadline()) { deny(); return; }
          } catch { deny(); return; }
          let parsed;
          try {
            if (!atDeadline()) { deny(); return; }
            parsed = JSON.parse(text);
            if (!atDeadline()) { deny(); return; }
          } catch { deny(); return; }
          let projected;
          try {
            projected = parseDockerImageResponse({ imageResponse: parsed });
            if (!atDeadline()) { deny(); return; }
          } catch { deny(); return; }
          if (projected?.ok !== true || !atDeadline()) { deny(); return; }
          void finish(projected);
        });
        incoming.once('close', () => { if (!incoming.complete) deny(); });
      });
      if (!atDeadline()) { deny(); return; }
      request.end();
    } catch { deny(); }
  });
}
