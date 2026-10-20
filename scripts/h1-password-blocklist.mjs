import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECLISTS_COMMIT = '913b327317496d062bcc7cace524aaad8a693be2';
const PWDB_COMMIT = '9b53917431ed5cd57cd6cbec8c3a19cf9a5cd8dd';
const SOURCE = Object.freeze({
  url: `https://raw.githubusercontent.com/danielmiessler/SecLists/${SECLISTS_COMMIT}/Passwords/Common-Credentials/Pwdb_top-1000000.txt`,
  commit: SECLISTS_COMMIT,
  sha256: 'e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8',
  bytes: 8755171,
  rows: 1000000,
});
const NOTICES = Object.freeze([
  Object.freeze({
    path: 'backend/resources/auth/LICENSE.pwdb.txt',
    url: `https://raw.githubusercontent.com/ignis-sec/Pwdb-Public/${PWDB_COMMIT}/LICENSE`,
    commit: PWDB_COMMIT,
    copyright: '2020 Ata Hakçıl',
    license: 'MIT',
    bytes: 1069,
    sha256: '4088d581cba171b1aa6f880ad3fb5327e2d6de415621cf8b80685ac506c0cae1',
  }),
  Object.freeze({
    path: 'backend/resources/auth/LICENSE.seclists.txt',
    url: `https://raw.githubusercontent.com/danielmiessler/SecLists/${SECLISTS_COMMIT}/LICENSE`,
    commit: SECLISTS_COMMIT,
    copyright: '2018 Daniel Miessler',
    license: 'MIT',
    bytes: 1072,
    sha256: '3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c',
  }),
]);
const RESOURCE_PATH = 'backend/resources/auth/password-blocklist.bin';
const MANIFEST_PATH = 'backend/resources/auth/password-blocklist.manifest.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function requireUnicode17(version = process.versions.unicode) {
  if (version !== '17.0') throw new Error('Unicode 17.0 required');
  return true;
}

function verifyPin(bytes, pin) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) {
    throw new Error('Pinned bytes mismatch');
  }
}

// LF is the only delimiter. Exactly one final LF is removed as framing;
// preceding LFs delimit real (possibly empty) rows. CR/BOM/controls are data.
export function decodeRows(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.at(-1) !== 10) {
    throw new Error('Terminal LF framing required');
  }
  let text;
  try {
    // ignoreBOM=true preserves a legitimate U+FEFF rather than discarding it.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Well-formed UTF8 required');
  }
  return text.slice(0, -1).split('\n');
}

export function validateResource(resource, digestCount) {
  if (!Buffer.isBuffer(resource) || !Number.isSafeInteger(digestCount) || digestCount < 1 ||
      resource.length !== digestCount * 32) {
    throw new Error('Invalid resource count or size');
  }
  for (let offset = 32; offset < resource.length; offset += 32) {
    if (Buffer.compare(resource.subarray(offset - 32, offset), resource.subarray(offset, offset + 32)) >= 0) {
      throw new Error('Resource records must be strictly ordered and unique');
    }
  }
  return true;
}

// Pure fixture-capable kernel. Only generatePinned is the production source gate.
export function generateRows(rows) {
  requireUnicode17();
  if (!Array.isArray(rows)) throw new Error('Rows required');
  let eligibleRows = 0;
  const unique = new Set();
  for (const row of rows) {
    if (typeof row !== 'string' || !row.isWellFormed()) {
      throw new Error('Well-formed string row required');
    }
    const key = row.normalize('NFC').toLowerCase();
    if ([...key].length < 15) continue;
    eligibleRows += 1;
    unique.add(sha256(Buffer.from(key, 'utf8')));
  }
  // Fixed-width hex order equals byte lexicographic order; emit full digests.
  const resource = Buffer.concat([...unique].sort().map((hex) => Buffer.from(hex, 'hex')));
  const digestCount = unique.size;
  validateResource(resource, digestCount);
  return { resource, eligibleRows, digestCount };
}

export function generatePinned(bytes) {
  requireUnicode17();
  verifyPin(bytes, SOURCE);
  const rows = decodeRows(bytes);
  if (rows.length !== SOURCE.rows) throw new Error('Pinned row count mismatch');
  return generateRows(rows);
}

export function canonicalManifest(result) {
  requireUnicode17();
  validateResource(result.resource, result.digestCount);
  if (!Number.isSafeInteger(result.eligibleRows) || result.eligibleRows < result.digestCount ||
      result.eligibleRows > SOURCE.rows) throw new Error('Invalid eligible row count');
  // Field order is intentional. No clock, environment values or machine paths.
  return JSON.stringify({
    format: 'abar-password-blocklist',
    version: 1,
    algorithm: 'NFC -> default String.toLowerCase() -> UTF8 -> SHA256',
    unicode: '17.0',
    source: SOURCE,
    framing: 'LF-delimited; one mandatory terminal LF; all other scalars preserved',
    keyMinimum: 15,
    keyMaximum: null,
    eligibleRows: result.eligibleRows,
    digestCount: result.digestCount,
    recordBytes: 32,
    recordOrder: 'lexicographic ascending, unique',
    outputBytes: result.resource.length,
    outputSha256: sha256(result.resource),
    notices: NOTICES,
  }, null, 2) + '\n';
}

async function main(args) {
  if (args.length !== 2 || args[0] !== '--source' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: node scripts/h1-password-blocklist.mjs --source <pinned-raw-file>');
  }
  requireUnicode17();
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = generatePinned(await readFile(resolve(args[1])));
  // Notices are accepted only as full, byte-exact reviewed license texts.
  for (const notice of NOTICES) verifyPin(await readFile(resolve(root, notice.path)), notice);
  if (result.resource.length > 1024 * 1024) throw new Error('Resource exceeds reviewed 1 MiB budget');
  const manifest = canonicalManifest(result);
  await mkdir(dirname(resolve(root, RESOURCE_PATH)), { recursive: true });
  await writeFile(resolve(root, RESOURCE_PATH), result.resource);
  await writeFile(resolve(root, MANIFEST_PATH), manifest);
  console.log(JSON.stringify({
    sourceBytes: SOURCE.bytes, sourceRows: SOURCE.rows, sourceSha256: SOURCE.sha256,
    eligibleRows: result.eligibleRows, digestCount: result.digestCount,
    outputBytes: result.resource.length, outputSha256: sha256(result.resource),
    manifestSha256: sha256(Buffer.from(manifest)),
  }));
}

// Importing the kernel performs no filesystem/network I/O and writes nothing.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    // Never echo source paths, rows, raw filesystem errors or entered values.
    console.error(error.message.startsWith('Usage:') ? error.message : 'Blocklist generation rejected');
    process.exitCode = 1;
  });
}
