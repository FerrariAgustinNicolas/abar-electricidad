import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AdminUsersService, getAdminUsersErrorMetadata } from '../auth/admin-users.service';
import { CatalogException } from '../catalog-shared/catalog-error';
import { PrismaService } from '../prisma/prisma.service';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'] as const;
const PAYMENT_STATUSES = ['PENDING', 'REJECTED', 'PAID'] as const;
const PAYMENT_METHODS = ['DEMO_SIMULATION', 'DEMO_PAY_ON_PICKUP', 'DEMO_TRANSFER'] as const;
const MAX_MINOR = 9_223_372_036_854_775_807n;
const DAY_MS = 86_400_000;

type OrderStatus = (typeof ORDER_STATUSES)[number];
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
type PaymentMethod = (typeof PAYMENT_METHODS)[number];
type ReportQuery = Readonly<{
  from: string;
  to: string;
  fromUtc: Date;
  toUtc: Date;
  methodCode: PaymentMethod | null;
  orderStatus: OrderStatus | null;
  paymentStatus: PaymentStatus | null;
}>;
type Authorization = Awaited<ReturnType<AdminUsersService['authorizeCatalog']>>;
type RawRow = Record<string, unknown>;
type Money = Readonly<{ amountMinor: string; currency: 'ARS' }>;

const badRequest = (): never => { throw new CatalogException(400, 'VALIDATION_ERROR'); };
const unavailable = (): never => { throw new CatalogException(503, 'SERVICE_UNAVAILABLE'); };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Resolve the first instant of a local date using IANA rules, not process-local time. */
export function reportDateStartUtc(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const partsAt = (instant: number) => Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map(({ type, value: part }) => [type, part]),
  );
  const localTimestamp = (parts: Record<string, string>) => Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsets = new Set<number>();
  for (let instant = localMidnight - 36 * 3_600_000; instant <= localMidnight + 36 * 3_600_000; instant += 6 * 3_600_000) {
    offsets.add(localTimestamp(partsAt(instant)) - instant);
  }

  const matches = [...offsets].map((offset) => localMidnight - offset).filter((instant) => {
    const parts = partsAt(instant);
    return Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day &&
      Number(parts.hour) === 0 && Number(parts.minute) === 0 && Number(parts.second) === 0;
  }).sort((left, right) => left - right);
  if (matches.length > 0) return new Date(matches[0]);

  // Historical clock changes can skip midnight; select the first valid instant on that date.
  const firstValid = [...offsets].map((offset) => localMidnight - offset).filter((instant) => {
    const parts = partsAt(instant);
    return Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day;
  }).sort((left, right) => left - right);
  if (firstValid.length > 0) return new Date(firstValid[0]);
  return unavailable();
}

export function normalizeReportQuery(value: unknown): ReportQuery {
  if (!isRecord(value)) return badRequest();
  const allowedKeys = new Set(['from', 'to', 'methodCode', 'orderStatus', 'paymentStatus']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key)) || !isLocalDate(value.from) || !isLocalDate(value.to)) return badRequest();
  for (const key of ['methodCode', 'orderStatus', 'paymentStatus']) {
    if (Object.hasOwn(value, key) && typeof value[key] !== 'string') return badRequest();
  }

  const from = value.from;
  const to = value.to;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (!Number.isInteger(days) || days < 1 || days > 366) return badRequest();

  const methodCode = value.methodCode as string | undefined;
  const orderStatus = value.orderStatus as string | undefined;
  const paymentStatus = value.paymentStatus as string | undefined;
  if ((methodCode !== undefined && !PAYMENT_METHODS.includes(methodCode as PaymentMethod)) ||
      (orderStatus !== undefined && !ORDER_STATUSES.includes(orderStatus as OrderStatus)) ||
      (paymentStatus !== undefined && !PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus))) return badRequest();

  return Object.freeze({
    from, to,
    fromUtc: reportDateStartUtc(from),
    toUtc: reportDateStartUtc(to),
    methodCode: (methodCode ?? null) as PaymentMethod | null,
    orderStatus: (orderStatus ?? null) as OrderStatus | null,
    paymentStatus: (paymentStatus ?? null) as PaymentStatus | null,
  });
}

/** Keep user data bound as parameters and cast each predicate to its PostgreSQL enum. */
function stateFilters(query: ReportQuery): Prisma.Sql {
  const method = query.methodCode === null
    ? Prisma.empty
    : Prisma.sql`AND attempt."methodCode" = ${query.methodCode}::"H4PaymentMethod"`;
  const order = query.orderStatus === null
    ? Prisma.empty
    : Prisma.sql`AND o."status" = ${query.orderStatus}::"H4OrderStatus"`;
  const payment = query.paymentStatus === null
    ? Prisma.empty
    : Prisma.sql`AND p."status" = ${query.paymentStatus}::"H4PaymentStatus"`;
  return Prisma.sql`${method} ${order} ${payment}`;
}

function safeCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) return unavailable();
  return count;
}

function minor(value: unknown): bigint {
  try {
    const amount = typeof value === 'bigint' ? value : BigInt(String(value));
    if (amount < 0n || amount > MAX_MINOR) return unavailable();
    return amount;
  } catch {
    return unavailable();
  }
}

function quantityString(value: unknown): string {
  try {
    const quantity = BigInt(String(value));
    if (quantity < 0n) return unavailable();
    return quantity.toString();
  } catch {
    return unavailable();
  }
}

const money = (amount: bigint): Money => ({ amountMinor: amount.toString(), currency: 'ARS' });
const averageTicket = (total: bigint, count: bigint): bigint => count === 0n ? 0n : (total + count / 2n) / count;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminUsersService) {}

  async getReport(auth: Authorization, rawQuery: unknown) {
    const query = normalizeReportQuery(rawQuery);
    let report: ReturnType<ReportsService['buildReport']>;
    try {
      report = await this.prisma.$transaction(async (transaction) => {
        // Must precede every query in this transaction; all report sections share this snapshot.
        await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
        await auth.recheck(transaction);
        const filters = stateFilters(query);
        const [orders, totals, statuses, daily, methods, deliveries, presentations] = await Promise.all([
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT count(*)::bigint AS "createdCount",
              count(*) FILTER (WHERE o."status" = 'RECEIVED' AND p."status" IN ('PENDING', 'REJECTED'))::bigint AS "activeUnpaidCount",
              count(*) FILTER (WHERE o."status" = 'CANCELLED' AND p."status" <> 'PAID')::bigint AS "cancelledUnpaidCount",
              count(*) FILTER (WHERE p."status" = 'REJECTED')::bigint AS "rejectedPaymentCount",
              count(*) FILTER (WHERE attempt."status" = 'REJECTED')::bigint AS "rejectedCurrentAttemptCount"
            FROM "Order" o
            LEFT JOIN "Payment" p ON p."orderId" = o.id
            LEFT JOIN "PaymentAttempt" attempt ON attempt.id = p."currentAttemptId" AND attempt."paymentId" = p.id
            WHERE o."createdAt" >= ${query.fromUtc} AND o."createdAt" < ${query.toUtc} ${filters}`),
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT count(*)::bigint AS count,
              coalesce(sum(o."subtotalMinor"), 0)::numeric AS subtotal,
              coalesce(sum(o."deliveryFeeMinor"), 0)::numeric AS fees,
              coalesce(sum(o."totalMinor"), 0)::numeric AS total
            FROM "Order" o
            JOIN "Payment" p ON p."orderId" = o.id
            LEFT JOIN "PaymentAttempt" attempt ON attempt.id = p."currentAttemptId" AND attempt."paymentId" = p.id
            WHERE p."status" = 'PAID' AND p."confirmedAt" IS NOT NULL
              AND p."confirmedAt" >= ${query.fromUtc} AND p."confirmedAt" < ${query.toUtc} ${filters}`),
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT o."status" AS status, count(*)::bigint AS count
            FROM "Order" o
            LEFT JOIN "Payment" p ON p."orderId" = o.id
            LEFT JOIN "PaymentAttempt" attempt ON attempt.id = p."currentAttemptId" AND attempt."paymentId" = p.id
            WHERE o."createdAt" >= ${query.fromUtc} AND o."createdAt" < ${query.toUtc} ${filters}
            GROUP BY o."status"`),
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT to_char(p."confirmedAt" AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD') AS day,
              count(*)::bigint AS count, sum(o."totalMinor")::numeric AS total
            FROM "Order" o
            JOIN "Payment" p ON p."orderId" = o.id
            LEFT JOIN "PaymentAttempt" attempt ON attempt.id = p."currentAttemptId" AND attempt."paymentId" = p.id
            WHERE p."status" = 'PAID' AND p."confirmedAt" IS NOT NULL
              AND p."confirmedAt" >= ${query.fromUtc} AND p."confirmedAt" < ${query.toUtc} ${filters}
            GROUP BY day`),
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT attempt."methodCode" AS key, count(*)::bigint AS count, sum(o."totalMinor")::numeric AS total
            FROM "Order" o
            JOIN "Payment" p ON p."orderId" = o.id
            JOIN "PaymentAttempt" attempt ON attempt.id = p."currentAttemptId" AND attempt."paymentId" = p.id
            WHERE p."status" = 'PAID' AND p."confirmedAt" IS NOT NULL
              AND p."confirmedAt" >= ${query.fromUtc} AND p."confirmedAt" < ${query.toUtc} ${filters}
            GROUP BY attempt."methodCode"
            ORDER BY total DESC, attempt."methodCode"`),
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT o."deliveryMode" AS key, count(*)::bigint AS count,
              sum(o."deliveryFeeMinor")::numeric AS fees, sum(o."totalMinor")::numeric AS total
            FROM "Order" o
            JOIN "Payment" p ON p."orderId" = o.id
            LEFT JOIN "PaymentAttempt" attempt ON attempt.id = p."currentAttemptId" AND attempt."paymentId" = p.id
            WHERE p."status" = 'PAID' AND p."confirmedAt" IS NOT NULL
              AND p."confirmedAt" >= ${query.fromUtc} AND p."confirmedAt" < ${query.toUtc} ${filters}
            GROUP BY o."deliveryMode"
            ORDER BY total DESC, o."deliveryMode"`),
          transaction.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT item."productId", item."presentationId", item."unit", item."rollLengthMeters",
              sum(item.quantity)::numeric AS quantity, sum(item."lineTotalMinor")::numeric AS subtotal,
              (array_agg(item."productName" ORDER BY payment."confirmedAt" DESC, order_row.id ASC, item.id ASC))[1] AS name
            FROM "Order" order_row
            JOIN "Payment" payment ON payment."orderId" = order_row.id
            LEFT JOIN "PaymentAttempt" attempt ON attempt.id = payment."currentAttemptId" AND attempt."paymentId" = payment.id
            JOIN "OrderItem" item ON item."orderId" = order_row.id
            WHERE payment."status" = 'PAID' AND payment."confirmedAt" IS NOT NULL
              AND payment."confirmedAt" >= ${query.fromUtc} AND payment."confirmedAt" < ${query.toUtc}
              ${stateFiltersForItems(query)}
            GROUP BY item."productId", item."presentationId", item."unit", item."rollLengthMeters"
            ORDER BY subtotal DESC, item."productId", item."presentationId", item."unit", item."rollLengthMeters" ASC NULLS FIRST
            LIMIT 10001`),
        ]);
        if (presentations.length > 10_000) return unavailable();
        return this.buildReport(query, orders[0], totals[0], statuses, daily, methods, deliveries, presentations);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (error) {
      if (error instanceof CatalogException || getAdminUsersErrorMetadata(error)) throw error;
      return unavailable();
    }
    // Check on the root client so a revocation committed after the snapshot is visible.
    await auth.recheck(this.prisma);
    return report;
  }

  private buildReport(
    query: ReportQuery,
    order: RawRow,
    totals: RawRow,
    statuses: RawRow[],
    daily: RawRow[],
    methods: RawRow[],
    deliveries: RawRow[],
    groups: RawRow[],
  ) {
    const confirmedCount = safeCount(totals?.count ?? 0);
    const subtotal = minor(totals?.subtotal ?? 0);
    const fees = minor(totals?.fees ?? 0);
    const total = minor(totals?.total ?? 0);
    if (subtotal + fees !== total) return unavailable();

    const statusCounts = new Map(statuses.map((row) => [String(row.status), safeCount(row.count)]));
    const dayGroups = new Map(daily.map((row) => [String(row.day), row]));
    const series = [];
    for (let dateMs = Date.parse(`${query.from}T00:00:00Z`), endMs = Date.parse(`${query.to}T00:00:00Z`); dateMs < endMs; dateMs += DAY_MS) {
      const date = new Date(dateMs).toISOString().slice(0, 10);
      const row = dayGroups.get(date);
      series.push({ date, confirmedOrderCount: safeCount(row?.count ?? 0), confirmedTotal: money(minor(row?.total ?? 0)) });
    }

    return Object.freeze({
      demoMode: true as const,
      period: { from: query.from, to: query.to, timeZone: TIME_ZONE, semantics: '[from,to)' as const },
      filters: { methodCode: query.methodCode, orderStatus: query.orderStatus, paymentStatus: query.paymentStatus },
      totals: {
        confirmedOrderCount: confirmedCount,
        productsSubtotal: money(subtotal),
        deliveryFees: money(fees),
        confirmedTotal: money(total),
        averageTicket: money(averageTicket(total, BigInt(confirmedCount))),
        empty: confirmedCount === 0,
      },
      orders: {
        createdCount: safeCount(order?.createdCount ?? 0),
        activeUnpaidCount: safeCount(order?.activeUnpaidCount ?? 0),
        cancelledUnpaidCount: safeCount(order?.cancelledUnpaidCount ?? 0),
        rejectedPaymentCount: safeCount(order?.rejectedPaymentCount ?? 0),
        rejectedCurrentAttemptCount: safeCount(order?.rejectedCurrentAttemptCount ?? 0),
        byStatus: ORDER_STATUSES.map((orderStatus) => ({ orderStatus, count: statusCounts.get(orderStatus) ?? 0 })),
      },
      series,
      byMethod: methods.map((row) => ({
        methodCode: String(row.key), confirmedOrderCount: safeCount(row.count), confirmedTotal: money(minor(row.total)),
      })),
      byDelivery: deliveries.map((row) => ({
        deliveryMode: String(row.key), confirmedOrderCount: safeCount(row.count),
        deliveryFees: money(minor(row.fees)), confirmedTotal: money(minor(row.total)),
      })),
      presentations: groups.map((row) => ({
        productId: String(row.productId), presentationId: String(row.presentationId), productName: String(row.name),
        unit: String(row.unit), rollLengthMeters: row.rollLengthMeters === null ? null : safeCount(row.rollLengthMeters),
        quantity: quantityString(row.quantity), productsSubtotal: money(minor(row.subtotal)),
      })),
    });
  }
}

function stateFiltersForItems(query: ReportQuery): Prisma.Sql {
  const method = query.methodCode === null
    ? Prisma.empty
    : Prisma.sql`AND attempt."methodCode" = ${query.methodCode}::"H4PaymentMethod"`;
  const order = query.orderStatus === null
    ? Prisma.empty
    : Prisma.sql`AND order_row."status" = ${query.orderStatus}::"H4OrderStatus"`;
  const payment = query.paymentStatus === null
    ? Prisma.empty
    : Prisma.sql`AND payment."status" = ${query.paymentStatus}::"H4PaymentStatus"`;
  return Prisma.sql`${method} ${order} ${payment}`;
}

const CSV_HEADER = [
  'section', 'from', 'to', 'timeZone', 'methodFilter', 'orderStatusFilter', 'paymentStatusFilter', 'key', 'productId',
  'presentationId', 'productName', 'unit', 'rollLengthMeters', 'quantity', 'count', 'productsSubtotalMinor',
  'deliveryFeesMinor', 'confirmedTotalMinor', 'averageTicketMinor', 'activeUnpaidCount', 'cancelledUnpaidCount',
  'rejectedPaymentCount', 'rejectedCurrentAttemptCount', 'currency',
];

function csvCell(value: unknown, textual: boolean): string {
  if (value === null || value === undefined) return '""';
  let cell = String(value);
  const hasControl = Array.from(cell).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
  if (textual && (/^[\s]*[=+\-@]/.test(cell) || hasControl)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

export function csvReport(report: any): string {
  const rows: unknown[][] = [CSV_HEADER];
  const base = [
    report.period.from, report.period.to, report.period.timeZone,
    report.filters.methodCode, report.filters.orderStatus, report.filters.paymentStatus,
  ];
  const addRow = (section: string, fields: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      section, from: base[0], to: base[1], timeZone: base[2], methodFilter: base[3],
      orderStatusFilter: base[4], paymentStatusFilter: base[5], currency: 'ARS', ...fields,
    };
    rows.push(CSV_HEADER.map((key) => values[key] ?? ''));
  };

  const totals = report.totals;
  addRow('totals', {
    count: totals.confirmedOrderCount,
    productsSubtotalMinor: totals.productsSubtotal.amountMinor,
    deliveryFeesMinor: totals.deliveryFees.amountMinor,
    confirmedTotalMinor: totals.confirmedTotal.amountMinor,
    averageTicketMinor: totals.averageTicket.amountMinor,
  });
  const orders = report.orders;
  addRow('orders', {
    count: orders.createdCount,
    activeUnpaidCount: orders.activeUnpaidCount,
    cancelledUnpaidCount: orders.cancelledUnpaidCount,
    rejectedPaymentCount: orders.rejectedPaymentCount,
    rejectedCurrentAttemptCount: orders.rejectedCurrentAttemptCount,
  });
  for (const entry of orders.byStatus) addRow('orderStatus', { key: entry.orderStatus, count: entry.count });
  for (const entry of report.series) addRow('series', { key: entry.date, count: entry.confirmedOrderCount, confirmedTotalMinor: entry.confirmedTotal.amountMinor });
  for (const entry of report.byMethod) addRow('method', { key: entry.methodCode, count: entry.confirmedOrderCount, confirmedTotalMinor: entry.confirmedTotal.amountMinor });
  for (const entry of report.byDelivery) addRow('delivery', { key: entry.deliveryMode, count: entry.confirmedOrderCount, deliveryFeesMinor: entry.deliveryFees.amountMinor, confirmedTotalMinor: entry.confirmedTotal.amountMinor });
  for (const entry of report.presentations) addRow('presentation', {
    productId: entry.productId, presentationId: entry.presentationId, productName: entry.productName,
    unit: entry.unit, rollLengthMeters: entry.rollLengthMeters, quantity: entry.quantity,
    productsSubtotalMinor: entry.productsSubtotal.amountMinor,
  });
  return rows.map((row) => row.map((value, index) => csvCell(value, index < 14)).join(',')).join('\r\n') + '\r\n';
}
