import { createHash } from 'node:crypto';
import { AdminUsersService } from './admin-users.service';
import type { AuthConfig } from './auth.config';
import type { PrismaService } from '../prisma/prisma.service';

const adminId = '00000000-0000-4000-8000-000000000001';
const sessionToken = Buffer.alloc(32, 4).toString('base64url');
const sessionId = createHash('sha256').update(sessionToken).digest('hex');
const nonce = Buffer.alloc(32, 9);
const csrfToken = nonce.toString('base64url');
const timestamp = new Date('2030-01-01T00:00:00.000Z');
const owner = { id: adminId, name: 'Operator', email: 'operator@example.invalid', active: true, mustChangePassword: false, version: 1 };
const sessionRow = {
  id: sessionId, adminUserId: adminId, nonceVersion: 1, nonceCiphertext: Buffer.alloc(32, 1),
  nonceIv: Buffer.alloc(12, 2), nonceTag: Buffer.alloc(16, 3), absoluteExpiresAt: new Date(timestamp.getTime() + 60_000),
  idleExpiresAt: new Date(timestamp.getTime() + 30_000), revokedAt: null, adminUser: owner,
};
const config = { allowedOrigins: ['http://127.0.0.1:4200'], cookieSecure: false } as unknown as AuthConfig;
const validUser = {
  ...owner, createdAt: timestamp, updatedAt: timestamp,
};

function fixture(overrides: Record<string, unknown> = {}) {
  const findUnique = jest.fn(async () => sessionRow);
  const findMany = jest.fn(async () => [validUser]);
  const count = jest.fn(async () => 1);
  const create = jest.fn(async ({ data }: any) => ({ ...data, id: adminId, createdAt: timestamp, updatedAt: timestamp }));
  const transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  const prisma = {
    authSession: { findUnique, updateMany: jest.fn(async () => ({ count: 1 })) },
    adminUser: { findMany, count, findUnique: jest.fn(async () => validUser), create, updateMany: jest.fn(async () => ({ count: 1 })) },
    adminUserAudit: { create: jest.fn(async () => ({})) },
    $queryRaw: jest.fn(async () => [{ id: adminId }]),
    $transaction: transaction,
    ...overrides,
  } as unknown as PrismaService & Record<string, any>;
  const cipher = { available: true, decrypt: jest.fn(() => Buffer.from(nonce)) } as any;
  const hasher = { hash: jest.fn(async () => 'synthetic-hash') } as any;
  const blocklist = { hasDigest: jest.fn(() => false) } as any;
  const service = new AdminUsersService(prisma, cipher, config, hasher, blocklist, () => timestamp.getTime());
  const proof = { cookieHeader: `abar_admin_session=${sessionToken}`, csrfToken, origin: config.allowedOrigins[0] };
  return { service, prisma, cipher, hasher, blocklist, proof, findMany, create };
}

describe('driver-compatible transaction lock projection', () => {
  for (const operation of ['create', 'patch', 'resetPassword'] as const) {
    it(`preserves the ${operation} lock without exposing a void result to the driver`, async () => {
      const f = fixture();
      (f.prisma as any).$queryRaw = jest.fn(async (fragments: TemplateStringsArray) => {
        const sql = fragments.join('');
        if (sql.startsWith('SELECT pg_advisory_xact_lock')) throw new Error('Unsupported column type void');
        return [{ locked: 1 }];
      });
      const request = operation === 'create'
        ? { ...f.proof, body: { name: 'New operator', email: 'new@example.invalid', temporaryPassword: 'a sufficiently long phrase' } }
        : operation === 'patch'
          ? { ...f.proof, id: adminId, body: { expectedVersion: 1, name: 'Operator' } }
          : { ...f.proof, id: adminId, body: { temporaryPassword: 'a sufficiently long phrase', reason: 'Requested reset' } };
      await expect(f.service[operation](request).then(() => true)).resolves.toBe(true);
      expect((f.prisma as any).$queryRaw.mock.calls[0][0].join('')).toBe('SELECT 1 AS locked FROM pg_advisory_xact_lock(1868787565)');
    });
  }
});

describe('AdminUsersService public operations', () => {
  it('lists only sanitized users with bounded default pagination and stable sorting', async () => {
    const f = fixture();
    await expect(f.service.list({ ...f.proof })).resolves.toEqual({
      items: [{ id: adminId, name: 'Operator', email: 'operator@example.invalid', active: true,
        mustChangePassword: false, version: 1, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }));
  });

  it('applies requested sort/page bounds without accepting arbitrary sort fields', async () => {
    const f = fixture();
    await f.service.list({ ...f.proof, query: { page: '2', pageSize: '7', sort: '-email' } });
    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 7, take: 7, orderBy: [{ email: 'desc' }, { id: 'asc' }],
    }));
    await expect(f.service.list({ ...f.proof, query: { sort: 'passwordHash' } })).rejects.toMatchObject({ status: 400 });
    await expect(f.service.list({ ...f.proof, query: { pageSize: '101' } })).rejects.toMatchObject({ status: 400 });
  });

  it('normalizes unique email and stores only a temporary-password hash with an audit event', async () => {
    const f = fixture();
    const result = await f.service.create({ ...f.proof, body: {
      name: 'New operator', email: ' New@Example.Invalid ', temporaryPassword: 'a sufficiently long phrase',
    } });
    expect((result as any).email).toBe('new@example.invalid');
    expect(f.hasher.hash).toHaveBeenCalledWith('a sufficiently long phrase');
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      email: 'new@example.invalid', passwordHash: 'synthetic-hash', active: true, mustChangePassword: true, version: 1,
    }) }));
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('maps the database unique-email constraint to the contract conflict', async () => {
    const f = fixture();
    f.create.mockRejectedValueOnce(Object.assign(new Error('private database detail'), { code: 'P2002' }));
    await expect(f.service.create({ ...f.proof, body: {
      name: 'New operator', email: 'new@example.invalid', temporaryPassword: 'a sufficiently long phrase',
    } })).rejects.toMatchObject({ status: 409 });
  });

  it('treats an identical patch as a no-op without changing its version or adding audit', async () => {
    const f = fixture();
    const updateMany = jest.fn();
    const auditCreate = jest.fn();
    f.prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      ...f.prisma,
      adminUser: { ...f.prisma.adminUser, findUnique: jest.fn(async () => validUser), updateMany },
      adminUserAudit: { create: auditCreate },
    })) as any;
    await expect(f.service.patch({ ...f.proof, id: adminId, body: { expectedVersion: 1, name: 'Operator' } }))
      .resolves.toMatchObject({ version: 1 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects stale patch versions before updating', async () => {
    const f = fixture();
    const updateMany = jest.fn();
    f.prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      ...f.prisma,
      adminUser: { ...f.prisma.adminUser, findUnique: jest.fn(async () => validUser), updateMany },
    })) as any;
    await expect(f.service.patch({ ...f.proof, id: adminId, body: { expectedVersion: 2, name: 'Renamed' } }))
      .rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('revokes target sessions and audits a successful non-final deactivation transactionally', async () => {
    const f = fixture();
    const sessionUpdate = jest.fn(async () => ({ count: 2 }));
    const auditCreate = jest.fn(async () => ({}));
    const activeLock = jest.fn(async () => [{ id: adminId }]);
    const tx = {
      ...f.prisma,
      $queryRaw: activeLock,
      adminUser: { ...f.prisma.adminUser, findUnique: jest.fn(async () => validUser), count: jest.fn(async () => 2),
        updateMany: jest.fn(async () => ({ count: 1 })) },
      authSession: { ...f.prisma.authSession, updateMany: sessionUpdate },
      adminUserAudit: { create: auditCreate },
    };
    const after = { ...validUser, active: false, version: 2 };
    tx.adminUser.findUnique = jest.fn().mockResolvedValueOnce(validUser).mockResolvedValueOnce(after) as any;
    f.prisma.$transaction = jest.fn(async (callback: (value: any) => unknown) => callback(tx)) as any;
    await expect(f.service.patch({ ...f.proof, id: adminId, body: { expectedVersion: 1, active: false } }))
      .resolves.toMatchObject({ active: false, version: 2 });
    expect(activeLock).toHaveBeenCalledTimes(4);
    expect(sessionUpdate).toHaveBeenCalledWith({ where: { adminUserId: adminId, revokedAt: null }, data: { revokedAt: timestamp } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'DEACTIVATED' }) }));
  });

  it('requires exact Origin, bound CSRF, active ordinary session and rejects restricted users', async () => {
    const f = fixture();
    await expect(f.service.create({ ...f.proof, origin: 'https://attacker.invalid', body: {} }))
      .rejects.toMatchObject({ status: 403 });
    await expect(f.service.create({ ...f.proof, csrfToken: Buffer.alloc(32, 8).toString('base64url'), body: {} }))
      .rejects.toMatchObject({ status: 403 });
    const restricted = fixture();
    (sessionRow.adminUser as any).mustChangePassword = true;
    await expect(restricted.service.list({ ...restricted.proof })).rejects.toMatchObject({ status: 403 });
    (sessionRow.adminUser as any).mustChangePassword = false;
  });

  it('serializes last-active changes and records deactivation plus target-session revocation atomically', async () => {
    const f = fixture();
    f.prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback({
      ...f.prisma,
      $queryRaw: jest.fn(async () => [{ id: adminId }]),
      adminUser: { ...f.prisma.adminUser, findUnique: jest.fn(async () => validUser), updateMany: jest.fn(async () => ({ count: 1 })) },
      authSession: { ...f.prisma.authSession, updateMany: jest.fn(async () => ({ count: 2 })) },
    })) as any;
    await expect(f.service.patch({ ...f.proof, id: adminId, body: { expectedVersion: 1, active: false } }))
      .rejects.toMatchObject({ status: 409 });
    expect(f.prisma.$transaction).toHaveBeenCalled();
  });

  it('does not persist a reset password if it appears in the audit reason', async () => {
    const f = fixture();
    const auditCreate = jest.fn(async () => ({}));
    const tx = {
      ...f.prisma,
      adminUser: { ...f.prisma.adminUser, findUnique: jest.fn(async () => validUser), updateMany: jest.fn(async () => ({ count: 1 })) },
      authSession: { ...f.prisma.authSession, updateMany: jest.fn(async () => ({ count: 1 })) },
      adminUserAudit: { create: auditCreate },
    };
    f.prisma.$transaction = jest.fn(async (callback: (value: any) => unknown) => callback(tx)) as any;
    await f.service.resetPassword({ ...f.proof, id: adminId, body: {
      temporaryPassword: 'a sufficiently long phrase', reason: 'Password reset: a sufficiently long phrase',
    } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: 'Redacted audit reason' }) }));
  });

  it('resets credentials, increments version, revokes all target sessions and audits a sanitized reason in one transaction', async () => {
    const f = fixture();
    const auditCreate = jest.fn(async () => ({}));
    const tx = {
      ...f.prisma,
      adminUser: { ...f.prisma.adminUser, findUnique: jest.fn(async () => validUser), updateMany: jest.fn(async () => ({ count: 1 })) },
      authSession: { ...f.prisma.authSession, updateMany: jest.fn(async () => ({ count: 2 })) },
      adminUserAudit: { create: auditCreate },
    };
    f.prisma.$transaction = jest.fn(async (callback: (value: any) => unknown) => callback(tx)) as any;
    await expect(f.service.resetPassword({ ...f.proof, id: adminId, body: {
      temporaryPassword: 'a sufficiently long phrase', reason: 'Support request\nverified',
    } })).resolves.toBeUndefined();
    expect(f.hasher.hash).toHaveBeenCalledWith('a sufficiently long phrase');
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: 'Support request verified' }) }));
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { adminUserId: adminId, revokedAt: null } }));
  });
});
