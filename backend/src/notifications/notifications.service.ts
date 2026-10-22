import { Injectable } from '@nestjs/common';
import { AdminUsersService, getAdminUsersErrorMetadata } from '../auth/admin-users.service';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { CatalogException } from '../catalog-shared/catalog-error';
import { PrismaService } from '../prisma/prisma.service';

type Request = { cookieHeader?: string; origin?: string; csrfToken?: string; body?: unknown; query?: Record<string, unknown> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX = 2147483647;
const STATES = ['PENDING', 'PROCESSING', 'RETRY_WAIT', 'SENT', 'FAILED'] as const;
const VIEW_SELECT = {
  id: true, orderId: true, kind: true, state: true, version: true, attemptCount: true,
  nextAttemptAt: true, sentAt: true, lastError: true, createdAt: true,
} as const;
function fail(status: number, code: string): never { throw new CatalogException(status, code); }
function parsePage(query: Record<string, unknown>) {
  const number = (name: string, fallback: number, max: number) => {
    const value = query[name];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) fail(400, 'VALIDATION_ERROR');
    return Number(value);
  };
  const page = number('page', 1, MAX), pageSize = number('pageSize', 20, 100);
  if (!Number.isSafeInteger((page - 1) * pageSize)) fail(400, 'VALIDATION_ERROR');
  return { page, pageSize };
}
function parseDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail(400, 'VALIDATION_ERROR');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) fail(400, 'VALIDATION_ERROR');
  return date;
}
function notificationView(row: any) {
  return {
    id: row.id, orderId: row.orderId, kind: row.kind, state: row.state, version: row.version,
    attemptCount: row.attemptCount, nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null, lastError: row.lastError, createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminUsersService) {}

  async list(request: Request) {
    const auth = await this.admins.authorizeCatalog(request, false);
    const query = request.query ?? {};
    if (Object.keys(query).some((key) => !['page', 'pageSize', 'state', 'orderId', 'from', 'to'].includes(key))) fail(400, 'VALIDATION_ERROR');
    const paging = parsePage(query);
    const where: Record<string, unknown> = {};
    if (query.state !== undefined) {
      if (typeof query.state !== 'string' || !STATES.includes(query.state as typeof STATES[number])) fail(400, 'VALIDATION_ERROR');
      where.state = query.state;
    }
    if (query.orderId !== undefined) {
      if (typeof query.orderId !== 'string' || !UUID.test(query.orderId)) fail(400, 'VALIDATION_ERROR');
      where.orderId = query.orderId.toLowerCase();
    }
    if (query.from !== undefined || query.to !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (query.from !== undefined) createdAt.gte = parseDate(query.from);
      if (query.to !== undefined) createdAt.lte = parseDate(query.to);
      if (createdAt.gte && createdAt.lte && createdAt.gte > createdAt.lte) fail(400, 'VALIDATION_ERROR');
      where.createdAt = createdAt;
    }
    try {
      const [rows, totalItems] = await Promise.all([
        this.prisma.notificationJob.findMany({ where, select: VIEW_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (paging.page - 1) * paging.pageSize, take: paging.pageSize }),
        this.prisma.notificationJob.count({ where }),
      ]);
      await auth.recheck(this.prisma as never);
      return { items: rows.map(notificationView), pageInfo: { ...paging, totalItems, totalPages: Math.ceil(totalItems / paging.pageSize) } };
    } catch (error) {
      if (error instanceof CatalogException || getAdminUsersErrorMetadata(error)) throw error;
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }

  async retry(rawId: string, request: Request) {
    const auth = await this.admins.authorizeCatalog(request, true);
    if (!UUID.test(rawId)) fail(400, 'VALIDATION_ERROR');
    const id = rawId.toLowerCase();
    const body = validateCatalogBody<{ expectedVersion: number }>('H6NotificationRetry', request.body);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await auth.recheck(tx as never);
        await tx.$queryRaw`SELECT id FROM "NotificationJob" WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.notificationJob.findUnique({ where: { id }, select: VIEW_SELECT });
        if (!current) fail(404, 'NOTIFICATION_NOT_FOUND');
        if (current.state !== 'RETRY_WAIT' && current.state !== 'FAILED') fail(409, 'NOT_RETRYABLE');
        if (current.version !== body.expectedVersion) fail(409, 'VERSION_CONFLICT');
        const updated = await tx.notificationJob.update({ where: { id }, data: {
          state: 'PENDING', version: { increment: 1 }, attemptCount: 0, nextAttemptAt: new Date(),
          lastError: null, leaseToken: null, leaseUntil: null,
        }, select: VIEW_SELECT });
        await auth.recheck(tx as never);
        return notificationView(updated);
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error instanceof CatalogException || getAdminUsersErrorMetadata(error)) throw error;
      if ((error as any)?.code === 'P2034') fail(409, 'VERSION_CONFLICT');
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }
}
