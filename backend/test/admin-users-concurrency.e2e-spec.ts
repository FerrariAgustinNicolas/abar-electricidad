import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { validateAuthConfig } from '../src/auth/auth.config';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { createCsrfNonceCipher } from '../src/auth/csrf-nonce.cipher';

const databaseUrl = process.env.H1_ADMIN_USERS_CONCURRENCY_DATABASE_URL;
const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : undefined;
const ownedLoopback = databaseUrl !== undefined && ['127.0.0.1', 'localhost', '[::1]'].includes(databaseHost ?? '');
const describeOwned = ownedLoopback ? describe : describe.skip;

describeOwned('admin last-active PostgreSQL concurrency (isolated H1 database only)', () => {
  let prisma: PrismaClient;
  let service: AdminUsersService;
  let csrfToken: string;
  const origin = 'http://127.0.0.1:4200';
  const users: Array<{ id: string; token: string; email: string }> = [];

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: databaseUrl! });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    if (await prisma.adminUser.count() !== 0) {
      throw new Error('Concurrency fixture requires a fresh isolated database with no admin users.');
    }
    const config = validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin });
    const key = randomBytes(32).toString('base64url');
    const cipher = createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: key });
    const runtime = { hash: async () => 'unused-hash' };
    service = new AdminUsersService(prisma as any, cipher, config, runtime, { hasDigest: () => false });
    const now = new Date();
    const nonce = randomBytes(32);
    csrfToken = nonce.toString('base64url');
    for (let index = 0; index < 2; index++) {
      const token = randomBytes(32).toString('base64url');
      const email = `h1-concurrency-${randomBytes(12).toString('hex')}@example.invalid`;
      const user = await prisma.adminUser.create({ data: {
        name: `Concurrency ${index}`, email, passwordHash: 'synthetic-unused-hash', active: true,
        mustChangePassword: false, version: 1,
      } });
      const sessionId = createHash('sha256').update(token).digest('hex');
      const envelope = cipher.encrypt('session', sessionId, 1, nonce);
      await prisma.authSession.create({ data: {
        id: sessionId, adminUserId: user.id, nonceCiphertext: Uint8Array.from(envelope.ciphertext), nonceIv: Uint8Array.from(envelope.iv),
        nonceTag: Uint8Array.from(envelope.tag), nonceVersion: 1, createdAt: now, lastActivityAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000), idleExpiresAt: new Date(now.getTime() + 60_000),
      } });
      users.push({ id: user.id, token, email });
    }
    nonce.fill(0);
  }, 20_000);

  afterAll(async () => { if (prisma) await prisma.$disconnect(); });

  it('serializes concurrent attempts so exactly one of the two active administrators remains active', async () => {
    const attempts = users.map((user) => service.patch({
      id: user.id,
      cookieHeader: `abar_admin_session=${user.token}`,
      origin,
      csrfToken,
      body: { expectedVersion: 1, active: false },
    }));
    const settled = await Promise.allSettled(attempts);
    expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ status: 409 });
    expect(await prisma.adminUser.count({ where: { id: { in: users.map((user) => user.id) }, active: true } })).toBe(1);
    expect(await prisma.adminUserAudit.count({ where: { targetAdminUserId: { in: users.map((user) => user.id) }, action: 'DEACTIVATED' } })).toBe(1);
  }, 20_000);
});
