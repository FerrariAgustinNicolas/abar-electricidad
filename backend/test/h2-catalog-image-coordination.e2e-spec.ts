import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { validateAuthConfig } from '../src/auth/auth.config';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';
import { CatalogService } from '../src/catalog/catalog.service';
import { FileCatalogImageStorage, pngTestFixture } from '../src/catalog/image-storage';

const databaseUrl = process.env.H2_STOCK_DATABASE_URL;
const containerId = process.env.H2_STOCK_CONTAINER_ID;
const owner = process.env.H2_STOCK_OWNER;
const describeOwned = databaseUrl && containerId && owner ? describe : describe.skip;
const dockerHost = 'unix:///Users/agustin/.docker/run/docker.sock';
const backend = resolve(__dirname, '..');
const imageUrl = databaseUrl ? new URL(databaseUrl) : undefined;
if (imageUrl) imageUrl.pathname = '/h2_catalog';

describeOwned('H2 catalog image publication and cleanup coordination on owned PostgreSQL', () => {
  let prisma: PrismaClient;
  let imageDirectory: string;
  let productId: string;
  let uploadAuth: Awaited<ReturnType<AdminUsersService['authorizeCatalog']>>;
  let fileStorage: FileCatalogImageStorage;
  let actor: { cookieHeader: string; csrfToken: string; origin: string };
  const origin = 'http://127.0.0.1:4200';

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.pathname).toBe('/h2_stock');
    expect(url.username).toBe('h2_stock');
    const container = JSON.parse(execFileSync('docker', ['--host', dockerHost, 'inspect', containerId!], { encoding: 'utf8' }))[0];
    expect(container.Id).toBe(containerId);
    expect(container.Config.Image).toBe('postgres:17.11-bookworm');
    expect(container.Config.Labels['com.abar.h2-stock-owner']).toBe(owner);
    expect(container.Config.Labels['com.abar.h2-stock-purpose']).toBe('integration');
    expect(container.State.Running).toBe(true);
    expect(container.Mounts).toHaveLength(0);
    expect(Object.keys(container.HostConfig.Tmpfs)).toEqual(['/var/lib/postgresql/data']);
    expect(container.HostConfig.Binds ?? []).toHaveLength(0);

    const admin = new pg.Client({ connectionString: databaseUrl! });
    await admin.connect();
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['h2_catalog']);
    expect(existing.rowCount).toBe(0);
    await admin.query('CREATE DATABASE h2_catalog');
    await admin.end();
    const client = new pg.Client({ connectionString: imageUrl!.href });
    await client.connect();
    for (const migration of (await readdir(resolve(backend, 'prisma/migrations'))).filter((name) => /^\d+_/.test(name)).sort()) {
      await client.query(await readFile(resolve(backend, 'prisma/migrations', migration, 'migration.sql'), 'utf8'));
    }
    await client.end();

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: imageUrl!.href }) });
    await prisma.$connect();
    const userId = randomUUID(); const token = randomBytes(32).toString('base64url'); const nonce = randomBytes(32);
    const sessionId = createHash('sha256').update(token).digest('hex');
    const key = randomBytes(32).toString('base64url');
    const cipher = createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: key });
    const envelope = cipher.encrypt('session', sessionId, 1, nonce); const now = new Date();
    await prisma.adminUser.create({ data: { id: userId, name: 'Image race verifier', email: `${randomUUID()}@example.invalid`, passwordHash: 'fixture-only', active: true, mustChangePassword: false } });
    await prisma.authSession.create({ data: {
      id: sessionId, adminUserId: userId, nonceCiphertext: Uint8Array.from(envelope.ciphertext), nonceIv: Uint8Array.from(envelope.iv), nonceTag: Uint8Array.from(envelope.tag),
      nonceVersion: 1, createdAt: now, lastActivityAt: now, absoluteExpiresAt: new Date(now.getTime() + 60_000), idleExpiresAt: new Date(now.getTime() + 60_000),
    } });
    actor = { cookieHeader: `abar_admin_session=${token}`, csrfToken: nonce.toString('base64url'), origin };
    nonce.fill(0);
    const admins = new AdminUsersService(prisma as never, cipher, validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }),
      { hash: async () => 'unused' }, { hasDigest: () => false });
    uploadAuth = await admins.authorizeCatalog(actor, true);
    const category = await prisma.category.create({ data: { name: 'Race test cable', slug: `race-${randomUUID()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: 'Race test cable', slug: `race-${randomUUID()}` } });
    productId = product.id;
    imageDirectory = await mkdtemp(join(tmpdir(), 'h2-catalog-image-race-'));
    fileStorage = new FileCatalogImageStorage(imageDirectory);
  }, 30_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (imageDirectory) await rm(imageDirectory, { recursive: true, force: true });
  });

  it('keeps cleanup waiting until a real upload commits image metadata', async () => {
    const storage = fileStorage;
    let published!: () => void; const filePublished = new Promise<void>((resolvePublished) => { published = resolvePublished; });
    let release!: () => void; const uploadBarrier = new Promise<void>((resolveUpload) => { release = resolveUpload; });
    const coordinatedStorage = {
      put: async (bytes: Buffer) => { const stored = await storage.put(bytes); published(); await uploadBarrier; return stored; },
      read: (key: string) => storage.read(key), remove: (key: string) => storage.remove(key), listKeys: () => storage.listKeys(),
    };
    const uploadService = new CatalogService(prisma as never, {} as any, coordinatedStorage);
    const upload = uploadService.uploadImage(uploadAuth, productId, { alt: 'Race regression', order: 0, isPrimary: true, expectedVersion: 1 }, pngTestFixture());
    await filePublished;
    const cleanup = spawn(process.execPath, ['scripts/h2-image-cleanup.mjs'], {
      cwd: backend, env: { ...process.env, H2_IMAGE_CLEANUP_OWNED: '1', H2_IMAGE_CLEANUP_DATABASE_URL: imageUrl!.href, CATALOG_IMAGE_DIRECTORY: imageDirectory },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = ''; cleanup.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; }); cleanup.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const cleanupExit = new Promise<number>((resolveExit, reject) => { cleanup.once('error', reject); cleanup.once('exit', (code) => resolveExit(code ?? -1)); });
    const observer = new pg.Client({ connectionString: imageUrl!.href }); await observer.connect();
    try {
      const deadline = Date.now() + 10_000; let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const state = await observer.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock(1868787567)%') AS waiting");
        waiting = state.rows[0].waiting;
        if (!waiting && cleanup.exitCode !== null) break;
        if (!waiting) await new Promise((resolveTick) => setTimeout(resolveTick, 10));
      }
      expect(waiting).toBe(true);
      expect(cleanup.exitCode).toBeNull();
      release();
      const uploaded = await upload;
      expect(uploaded.images).toHaveLength(1);
      expect(await cleanupExit).toBe(0);
      const row = await prisma.productImage.findFirst({ where: { productId } });
      expect(row).toBeTruthy();
      expect(await storage.read(row!.storageKey)).toEqual(pngTestFixture());
      expect(stdout).toContain('Removed 0 inaccessible orphan image(s)');
      expect(stderr).toBe('');
    } finally {
      release();
      await observer.end();
      if (cleanup.exitCode === null) { cleanup.kill('SIGTERM'); await cleanupExit.catch(() => undefined); }
      await upload.catch(() => undefined);
    }
  }, 30_000);
});
