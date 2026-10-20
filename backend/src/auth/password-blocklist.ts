import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { PasswordBlocklistLookup, PasswordPolicyError } from './password-policy';

// Release C03 anchors are code-owned, never supplied by a manifest or caller.
const RESOURCE_BYTES = 170528;
const RECORD_BYTES = 32;
const RECORD_COUNT = 5329;
const MANIFEST_CAP = 32768;
const RESOURCE_SHA = '7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0';
const MANIFEST_SHA = '581027ae246da0bacf0d71a65a35edad5a20a71c5fcfe2d810513b128bfdb510';
const SOURCE_COMMIT = '913b327317496d062bcc7cace524aaad8a693be2';
const PWDB_COMMIT = '9b53917431ed5cd57cd6cbec8c3a19cf9a5cd8dd';
const PWDB_SHA = '4088d581cba171b1aa6f880ad3fb5327e2d6de415621cf8b80685ac506c0cae1';
const SECLISTS_SHA = '3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c';

function fail(): never { throw new PasswordPolicyError('unavailable'); }
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

function validateManifest(bytes: Buffer): void {
  // Authenticate exact raw bytes BEFORE any Unicode decoding or JSON parsing.
  if (sha256(bytes) !== MANIFEST_SHA) fail();
  const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const parsed: unknown = JSON.parse(decoded);
  // Exact schema and values, including provenance and complete notice metadata.
  // Only local objects exist here; none are retained in the returned lookup.
  const expected = {
    format: 'abar-password-blocklist',
    version: 1,
    algorithm: 'NFC -> default String.toLowerCase() -> UTF8 -> SHA256',
    unicode: '17.0',
    source: {
      url: `https://raw.githubusercontent.com/danielmiessler/SecLists/${SOURCE_COMMIT}/Passwords/Common-Credentials/Pwdb_top-1000000.txt`,
      commit: SOURCE_COMMIT,
      sha256: 'e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8',
      bytes: 8755171,
      rows: 1000000,
    },
    framing: 'LF-delimited; one mandatory terminal LF; all other scalars preserved',
    keyMinimum: 15,
    keyMaximum: null,
    eligibleRows: 5406,
    digestCount: RECORD_COUNT,
    recordBytes: RECORD_BYTES,
    recordOrder: 'lexicographic ascending, unique',
    outputBytes: RESOURCE_BYTES,
    outputSha256: RESOURCE_SHA,
    notices: [
      {
        path: 'backend/resources/auth/LICENSE.pwdb.txt',
        url: `https://raw.githubusercontent.com/ignis-sec/Pwdb-Public/${PWDB_COMMIT}/LICENSE`,
        commit: PWDB_COMMIT,
        copyright: '2020 Ata Hakçıl',
        license: 'MIT',
        bytes: 1069,
        sha256: PWDB_SHA,
      },
      {
        path: 'backend/resources/auth/LICENSE.seclists.txt',
        url: `https://raw.githubusercontent.com/danielmiessler/SecLists/${SOURCE_COMMIT}/LICENSE`,
        commit: SOURCE_COMMIT,
        copyright: '2018 Daniel Miessler',
        license: 'MIT',
        bytes: 1072,
        sha256: SECLISTS_SHA,
      },
    ],
  };
  if (JSON.stringify(parsed) !== JSON.stringify(expected)) fail();
}

export function createPasswordBlocklist(
  resource: Buffer,
  manifest: Buffer,
): PasswordBlocklistLookup {
  try {
    if (!Buffer.isBuffer(resource) || !Buffer.isBuffer(manifest)) fail();
    if (resource.length !== RESOURCE_BYTES || manifest.length === 0 || manifest.length > MANIFEST_CAP) fail();
    // Copy before validation: no mutable caller-owned bytes enter the closure.
    const records = Buffer.from(resource);
    const metadata = Buffer.from(manifest);
    validateManifest(metadata);
    if (records.length !== RECORD_COUNT * RECORD_BYTES || sha256(records) !== RESOURCE_SHA) fail();
    for (let offset = RECORD_BYTES; offset < records.length; offset += RECORD_BYTES) {
      if (records.subarray(offset - RECORD_BYTES, offset).compare(records.subarray(offset, offset + RECORD_BYTES)) >= 0) fail();
    }
    return Object.freeze({
      hasDigest(digest: string): boolean {
        if (typeof digest !== 'string' || digest.length !== 64 || !/^[0-9a-f]{64}$/.test(digest)) fail();
        const key = Buffer.from(digest, 'hex');
        let low = 0;
        let high = RECORD_COUNT - 1;
        while (low <= high) {
          const middle = low + Math.floor((high - low) / 2);
          const offset = middle * RECORD_BYTES;
          const comparison = key.compare(records.subarray(offset, offset + RECORD_BYTES));
          if (comparison === 0) return true;
          if (comparison < 0) high = middle - 1;
          else low = middle + 1;
        }
        return false;
      },
    });
  } catch {
    // Never expose input values, paths, native errors, causes or partial state.
    return fail();
  }
}

function readBounded(filename: string, cap: number, exact?: number): Buffer {
  const descriptor = fs.openSync(filename, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0 || stat.size > cap) fail();
    if (exact !== undefined && stat.size !== exact) fail();
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, { offset, length: bytes.length - offset, position: null });
      if (count <= 0 || count > bytes.length - offset) fail();
      offset += count;
    }
    // Detect growth beyond the stat-sized allocation without unbounded reads.
    if (fs.readSync(descriptor, Buffer.alloc(1), { position: null }) !== 0) fail();
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

// The caller owns directory trust and distribution; no default, env or discovery.
export function loadPasswordBlocklist(trustedDirectory: string): PasswordBlocklistLookup {
  try {
    if (typeof trustedDirectory !== 'string' || trustedDirectory.length === 0) fail();
    const resource = readBounded(path.join(trustedDirectory, 'password-blocklist.bin'), RESOURCE_BYTES, RESOURCE_BYTES);
    const manifest = readBounded(path.join(trustedDirectory, 'password-blocklist.manifest.json'), MANIFEST_CAP);
    const pwdb = readBounded(path.join(trustedDirectory, 'LICENSE.pwdb.txt'), 1069, 1069);
    const seclists = readBounded(path.join(trustedDirectory, 'LICENSE.seclists.txt'), 1072, 1072);
    if (sha256(pwdb) !== PWDB_SHA || sha256(seclists) !== SECLISTS_SHA) fail();
    return createPasswordBlocklist(resource, manifest);
  } catch {
    return fail();
  }
}
