import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUTH_RUNTIME, AuthRuntime, AuthRuntimeModule } from './auth-runtime.module';
import * as parser from './auth.config';
import * as loader from './password-blocklist';
import { PasswordHasher } from './password-hasher';
import { PasswordPolicyError } from './password-policy';

const assets = [
  'password-blocklist.bin', 'password-blocklist.manifest.json',
  'LICENSE.pwdb.txt', 'LICENSE.seclists.txt',
];
const packaged = path.resolve(__dirname, '../../dist/resources/auth');
const invalidSettings = [
  { AUTH_UNKNOWN: 'unused' }, { NODE_ENV: 'invalid' },
  { NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'http://localhost:4200' },
  { AUTH_ARGON2_QUEUE_LIMIT: '-1' },
];

describe('AuthRuntimeModule source DI (build prerequisite)', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { NODE_ENV: 'test' };
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('does not validate, load resources or construct a hasher on import', () => {
    const validate = jest.fn();
    const load = jest.fn();
    const construct = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('./auth.config', () => ({ validateAuthConfig: validate }));
      jest.doMock('./password-blocklist', () => ({ loadPasswordBlocklist: load }));
      jest.doMock('./password-hasher', () => ({ PasswordHasher: construct }));
      require('./auth-runtime.module');
    });
    jest.dontMock('./auth.config');
    jest.dontMock('./password-blocklist');
    jest.dontMock('./password-hasher');
    expect(validate).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
  });

  it('snapshots full raw AUTH settings once and shares one real packaged runtime', async () => {
    process.env.AUTH_ARGON2_QUEUE_LIMIT = '0';
    process.env.AUTH_LOGIN_IP_LIMIT = '12';
    process.env.AUTH_ALLOWED_ORIGINS = 'https://admin.example.test';
    const validate = jest.spyOn(parser, 'validateAuthConfig');
    const load = jest.spyOn(loader, 'loadPasswordBlocklist');
    const module = await Test.createTestingModule({ imports: [AuthRuntimeModule] }).compile();
    try {
      const runtime = module.get<AuthRuntime>(AUTH_RUNTIME);
      expect(module.get(AUTH_RUNTIME)).toBe(runtime);
      expect(module.get<AuthRuntime>(AUTH_RUNTIME).hasher).toBe(runtime.hasher);
      expect(runtime.hasher).toBeInstanceOf(PasswordHasher);
      expect(Object.isFrozen(runtime.hasher)).toBe(false);
      expect(runtime.config.argon2QueueLimit).toBe(0);
      expect(runtime.config.loginIpLimit).toBe(12);
      expect(runtime.config.allowedOrigins).toEqual(['https://admin.example.test']);
      expect(Object.isFrozen(runtime)).toBe(true);
      expect(Object.isFrozen(runtime.config)).toBe(true);
      expect(Object.isFrozen(runtime.config.allowedOrigins)).toBe(true);
      expect(typeof runtime.blocklist.hasDigest('0'.repeat(64))).toBe('boolean');
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith(packaged);
      expect(validate).toHaveBeenCalledTimes(1);
      const snapshot = validate.mock.calls[0][0];
      expect(snapshot).not.toBe(process.env);
      process.env.AUTH_LOGIN_IP_LIMIT = '13';
      expect(snapshot.AUTH_LOGIN_IP_LIMIT).toBe('12');
      expect(runtime.config.loginIpLimit).toBe(12);
    } finally {
      await module.close();
    }
  });

  it('keeps H0 runtime construction independent of a missing or synthetic CSRF key and never serializes it', async () => {
    const missing = await Test.createTestingModule({ imports: [AuthRuntimeModule] }).compile();
    try {
      expect(missing.get<AuthRuntime>(AUTH_RUNTIME).config).not.toHaveProperty('csrfEncryptionKey');
    } finally {
      await missing.close();
    }

    process.env.AUTH_CSRF_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString('base64url');
    const configured = await Test.createTestingModule({ imports: [AuthRuntimeModule] }).compile();
    try {
      const runtime = configured.get<AuthRuntime>(AUTH_RUNTIME);
      expect(runtime.config).not.toHaveProperty('AUTH_CSRF_ENCRYPTION_KEY');
      expect(runtime.config).not.toHaveProperty('csrfEncryptionKey');
      expect(JSON.stringify(runtime)).not.toContain(process.env.AUTH_CSRF_ENCRYPTION_KEY);
    } finally {
      await configured.close();
    }
  });

  it('creates a separate runtime and hasher per container', async () => {
    const first = await Test.createTestingModule({ imports: [AuthRuntimeModule] }).compile();
    const second = await Test.createTestingModule({ imports: [AuthRuntimeModule] }).compile();
    try {
      expect(first.get(AUTH_RUNTIME)).not.toBe(second.get(AUTH_RUNTIME));
      expect(first.get<AuthRuntime>(AUTH_RUNTIME).hasher).not.toBe(second.get<AuthRuntime>(AUTH_RUNTIME).hasher);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it.each(invalidSettings)('rejects invalid raw configuration before Nest returns an application %#', async (settings) => {
    Object.assign(process.env, settings);
    const load = jest.spyOn(loader, 'loadPasswordBlocklist');
    let returned = false;
    const creation = NestFactory.create(AuthRuntimeModule, { logger: false, abortOnError: false });
    await expect(creation.then(async (app) => {
      returned = true;
      await app.close();
    })).rejects.toThrow();
    expect(returned).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it.each(assets.flatMap((asset) => ['missing', 'corrupt'].map((kind) => [asset, kind])))(
    'closes before an application is returned for %s %s (private loader isolation)', async () => {
    jest.spyOn(loader, 'loadPasswordBlocklist').mockImplementation(() => {
      throw new PasswordPolicyError('unavailable');
    });
    await expect(NestFactory.create(AuthRuntimeModule, { logger: false, abortOnError: false }))
      .rejects.toThrow(new PasswordPolicyError('unavailable'));
  });
});

// Genuine compiled DI and anchored filesystem proof; never mutates the candidate assets.
describe('compiled standalone AuthRuntimeModule artifact (no Prisma or socket)', () => {
  let root: string;
  let auth: string;
  let resources: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'abar-auth-runtime-'));
    auth = path.join(root, 'backend/dist/auth');
    resources = path.join(root, 'backend/dist/resources/auth');
    fs.mkdirSync(auth, { recursive: true });
    fs.mkdirSync(resources, { recursive: true });
    for (const file of fs.readdirSync(path.resolve(__dirname, '../../dist/auth'))) {
      if (file.endsWith('.js')) fs.copyFileSync(path.resolve(__dirname, '../../dist/auth', file), path.join(auth, file));
    }
    for (const asset of assets) fs.copyFileSync(path.join(packaged, asset), path.join(resources, asset));
    fs.symlinkSync(path.resolve(__dirname, '../../node_modules'), path.join(root, 'backend/node_modules'), 'dir');
  });
  afterEach(() => {
    // Only the unique directory created by this test owns these public fixture copies.
    fs.rmSync(root, { recursive: true, force: true });
  });

  function probe(settings: Record<string, string | undefined> = {}): unknown {
    const script = `
      const assert = require('node:assert/strict');
      const { NestFactory } = require(${JSON.stringify(path.join(root, 'backend/node_modules/@nestjs/core'))});
      const { AUTH_RUNTIME, AuthRuntimeModule } = require(${JSON.stringify(path.join(auth, 'auth-runtime.module.js'))});
      (async () => {
        let returned = false;
        let listened = false;
        let app;
        try {
          app = await NestFactory.create(AuthRuntimeModule, { logger: false, abortOnError: false });
          returned = true;
          const first = app.get(AUTH_RUNTIME);
          const second = app.get(AUTH_RUNTIME);
          assert.equal(first, second);
          assert.equal(first.hasher, second.hasher);
          assert.equal(Object.isFrozen(first), true);
          assert.equal(first.config.argon2QueueLimit, 0);
          assert.equal(typeof first.blocklist.hasDigest('0'.repeat(64)), 'boolean');
          console.log(JSON.stringify({ returned, listened, shared: true, lookupBoolean: true }));
        } catch (error) {
          const safe = /^(Password policy is unavailable|Unknown authentication setting|NODE_ENV must be development, test, or production)$/.test(error.message);
          console.log(JSON.stringify({ returned, listened, rejected: true, safe }));
        } finally { if (app) await app.close(); }
      })().catch(() => { process.exitCode = 1; });
    `;
    return JSON.parse(execFileSync(process.execPath, ['-e', script], {
      cwd: os.tmpdir(), encoding: 'utf8', timeout: 15000,
      env: { NODE_ENV: 'test', AUTH_ARGON2_QUEUE_LIMIT: '0', ...settings },
    }).trim());
  }

  it('resolves the packaged code-owned path from unrelated cwd with singleton identity', () => {
    expect(probe()).toEqual({ returned: true, listened: false, shared: true, lookupBoolean: true });
  });

  it.each([{ AUTH_UNKNOWN: 'unused' }, { NODE_ENV: 'invalid' }])('rejects config before creation returns %#', (settings) => {
    expect(probe(settings)).toEqual({ returned: false, listened: false, rejected: true, safe: true });
  });

  it.each(assets.flatMap((asset) => ['missing', 'corrupt'].map((kind) => [asset, kind])))(
    'rejects genuinely %s %s before creation returns', (asset, kind) => {
    const file = path.join(resources, asset);
    if (kind === 'missing') fs.unlinkSync(file);
    else {
      const bytes = fs.readFileSync(file);
      bytes[0] ^= 1;
      fs.writeFileSync(file, bytes);
    }
    expect(probe()).toEqual({ returned: false, listened: false, rejected: true, safe: true });
  });
});
