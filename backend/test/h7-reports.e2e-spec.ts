import { AdminUsersService, getAdminUsersErrorMetadata } from '../src/auth/admin-users.service';
import { CatalogException } from '../src/catalog-shared/catalog-error';
import { csvReport, normalizeReportQuery, reportDateStartUtc, ReportsService } from '../src/reports/reports.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { seedH7ReportsFixture, H7_EXPECTED } from './h7-reports-fixture';

const valid = { from: '2026-10-01', to: '2026-10-04' };

function serviceForRows(rows: unknown[][]) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(rows.shift() ?? [])),
  };
  const prisma = { $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)) };
  const auth = { recheck: jest.fn().mockResolvedValue(undefined) };
  return { service: new ReportsService(prisma as any, {} as any), prisma, tx, auth };
}
function aggregateRows(options: { count?: bigint; subtotal?: bigint; fees?: bigint; total?: bigint } = {}) {
  const count = options.count ?? 0n;
  const subtotal = options.subtotal ?? 0n;
  const fees = options.fees ?? 0n;
  const total = options.total ?? subtotal + fees;
  return [
    [{ createdCount: 0n, activeUnpaidCount: 0n, cancelledUnpaidCount: 0n, rejectedPaymentCount: 0n, rejectedCurrentAttemptCount: 0n }],
    [{ count, subtotal, fees, total }],
    [], [], [], [], [],
  ];
}

describe('H7 report contract normalization', () => {
  it('normalizes valid filters and rejects duplicates, nested keys and unknown query values', () => {
    expect(normalizeReportQuery(valid)).toMatchObject({ from: '2026-10-01', to: '2026-10-04', methodCode: null, orderStatus: null, paymentStatus: null });
    for (const query of [
      { ...valid, methodCode: ['DEMO_TRANSFER', 'DEMO_SIMULATION'] },
      { ...valid, 'methodCode[0]': 'DEMO_TRANSFER' },
      { ...valid, unexpected: 'value' },
      { ...valid, paymentStatus: { nested: 'PAID' } },
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-10-04', to: '2026-10-01' },
      { from: '2026-10-01', to: '2027-10-03' },
    ]) expect(() => normalizeReportQuery(query)).toThrow(CatalogException);
    expect(normalizeReportQuery({ ...valid, methodCode: 'DEMO_TRANSFER', orderStatus: 'PREPARING', paymentStatus: 'PAID' }))
      .toMatchObject({ methodCode: 'DEMO_TRANSFER', orderStatus: 'PREPARING', paymentStatus: 'PAID' });
  });

  it('uses IANA local-midnight boundaries independent of process timezone', () => {
    expect(reportDateStartUtc('2026-10-01').toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(reportDateStartUtc('2026-10-04').toISOString()).toBe('2026-10-04T03:00:00.000Z');
  });
});

describe('H7 exact aggregates', () => {
  it('returns zero amounts and empty=true without division by zero', async () => {
    const fixture = serviceForRows(aggregateRows());
    const report = await fixture.service.getReport(fixture.auth as any, valid);
    expect(report.totals).toMatchObject({ confirmedOrderCount: 0, productsSubtotal: { amountMinor: '0' }, deliveryFees: { amountMinor: '0' }, confirmedTotal: { amountMinor: '0' }, averageTicket: { amountMinor: '0' }, empty: true });
    expect(report.series).toHaveLength(3);
    expect(report.series.every((point) => point.confirmedOrderCount === 0)).toBe(true);
  });

  it('rounds ticket residue half up and preserves money beyond JavaScript safe integers', async () => {
    const residual = serviceForRows(aggregateRows({ count: 2n, subtotal: 5n }));
    expect((await residual.service.getReport(residual.auth as any, valid)).totals.averageTicket.amountMinor).toBe('3');
    const large = serviceForRows(aggregateRows({ count: 1n, subtotal: 9007199254740993n }));
    const report = await large.service.getReport(large.auth as any, valid);
    expect(report.totals.confirmedTotal.amountMinor).toBe('9007199254740993');
    expect(report.totals.averageTicket.amountMinor).toBe('9007199254740993');
  });
});

describe('H7 CSV projection', () => {
  it('uses the frozen 24-column schema, exact integer money, and formula neutralization', () => {
    const report: any = {
      demoMode: true,
      period: { from: '2026-10-01', to: '2026-10-02', timeZone: 'America/Argentina/Buenos_Aires', semantics: '[from,to)' },
      filters: { methodCode: null, orderStatus: null, paymentStatus: null },
      totals: { confirmedOrderCount: 1, productsSubtotal: { amountMinor: '100', currency: 'ARS' }, deliveryFees: { amountMinor: '5', currency: 'ARS' }, confirmedTotal: { amountMinor: '105', currency: 'ARS' }, averageTicket: { amountMinor: '105', currency: 'ARS' }, empty: false },
      orders: { createdCount: 1, activeUnpaidCount: 0, cancelledUnpaidCount: 0, rejectedPaymentCount: 0, rejectedCurrentAttemptCount: 0, byStatus: [{ orderStatus: 'DELIVERED', count: 1 }, { orderStatus: 'RECEIVED', count: 0 }, { orderStatus: 'PREPARING', count: 0 }, { orderStatus: 'READY', count: 0 }, { orderStatus: 'CANCELLED', count: 0 }] },
      series: [{ date: '2026-10-01', confirmedOrderCount: 1, confirmedTotal: { amountMinor: '105', currency: 'ARS' } }],
      byMethod: [], byDelivery: [], presentations: [{ productId: 'a', presentationId: 'b', productName: '=SUM(A1)', unit: 'UNIT', rollLengthMeters: null, quantity: '2', productsSubtotal: { amountMinor: '100', currency: 'ARS' } }],
    };
    const rows = csvReport(report).split('\r\n');
    expect(rows[0].split(',')).toHaveLength(24);
    expect(rows[rows.length - 2]).toContain("'=SUM(A1)");
    expect(rows.join('\r\n')).toContain('"105"');
    expect(rows.join('\r\n')).not.toContain('undefined');
  });
});

const pgDescribe = process.env.H7_DATABASE_URL ? describe : describe.skip;
pgDescribe('H7 real PostgreSQL aggregate fixture', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.H7_DATABASE_URL! }) });
  const reports = new ReportsService(prisma as any, {} as any);
  const rowsHash = async (): Promise<string> => {
    const result = await prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`SELECT md5(
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM "Order" x) || '|' ||
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM "Payment" x) || '|' ||
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM "OrderEvent" x) || '|' ||
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM "OrderItem" x) || '|' ||
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM "NotificationJob" x) || '|' ||
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM "StockOperation" x) || '|' ||
      (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."operationId",x."presentationId")::text,'[]') FROM "StockEntry" x)
    ) AS value`);
    return result[0].value;
  };
  beforeAll(async () => { await prisma.$connect(); await prisma.$transaction((tx) => seedH7ReportsFixture(tx)); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('matches independently declared totals, statuses, series, methods, delivery and ranking', async () => {
    const before = await rowsHash();
    const report = await reports.getReport({ recheck: async () => undefined } as any, valid);
    const after = await rowsHash();
    expect(after).toBe(before);
    expect(report.totals).toMatchObject({ confirmedOrderCount: H7_EXPECTED.confirmedOrders, productsSubtotal: { amountMinor: H7_EXPECTED.productsSubtotalMinor }, deliveryFees: { amountMinor: H7_EXPECTED.deliveryFeesMinor }, confirmedTotal: { amountMinor: H7_EXPECTED.confirmedTotalMinor }, averageTicket: { amountMinor: H7_EXPECTED.averageTicketMinor } });
    expect(report.orders).toMatchObject({ createdCount: H7_EXPECTED.createdOrders, activeUnpaidCount: H7_EXPECTED.activeUnpaid, cancelledUnpaidCount: H7_EXPECTED.cancelledUnpaid, rejectedPaymentCount: H7_EXPECTED.rejectedPayments, rejectedCurrentAttemptCount: H7_EXPECTED.rejectedCurrentAttempts });
    expect(report.orders.byStatus.map((x) => [x.orderStatus, x.count])).toEqual([['RECEIVED', 2], ['PREPARING', 1], ['READY', 1], ['DELIVERED', 0], ['CANCELLED', 1]]);
    expect(report.series.map((x) => [x.date, x.confirmedOrderCount, x.confirmedTotal.amountMinor])).toEqual([['2026-10-01', 1, '9500'], ['2026-10-02', 1, '5500'], ['2026-10-03', 0, '0']]);
    expect(report.byMethod.map((x) => [x.methodCode, x.confirmedOrderCount, x.confirmedTotal.amountMinor])).toEqual([['DEMO_TRANSFER', 1, '9500'], ['DEMO_PAY_ON_PICKUP', 1, '5500']]);
    expect(report.byDelivery.map((x) => [x.deliveryMode, x.confirmedOrderCount, x.deliveryFees.amountMinor, x.confirmedTotal.amountMinor])).toEqual([['PICKUP', 2, '500', '15000']]);
    expect(report.presentations.map((x) => [x.unit, x.quantity, x.productsSubtotal.amountMinor])).toEqual([['UNIT', '2', '6000'], ['ROLL', '1', '5500'], ['METER', '3', '3000']]);
    expect(report.presentations[0].productName).toBe('=DEMO historical name');
  });

  it('counts the same confirmation once after READY/DELIVERED and ignores current policy fees', async () => {
    const policy = await prisma.checkoutPolicy.findFirst();
    expect(policy?.feeMinor).toBe(999999n);
    try {
      for (const status of ['READY', 'DELIVERED']) {
        await prisma.$executeRaw`UPDATE "Order" SET status = ${status}::"H4OrderStatus" WHERE "orderNumber" = 'H7-paid-current'`;
        const before = await rowsHash();
        const report = await reports.getReport({ recheck: async () => undefined } as any, valid);
        expect(report.totals.confirmedOrderCount).toBe(2);
        expect(report.totals.confirmedTotal.amountMinor).toBe('15000');
        expect(report.totals.deliveryFees.amountMinor).toBe('500');
        expect(await rowsHash()).toBe(before);
      }
    } finally {
      await prisma.$executeRaw`UPDATE "Order" SET status = 'PREPARING'::"H4OrderStatus" WHERE "orderNumber" = 'H7-paid-current'`;
    }
  });

  it('applies enum-valued filters and never treats approved pending simulations as sales', async () => {
    const methodFiltered = await reports.getReport({ recheck: async () => undefined } as any, { ...valid, methodCode: 'DEMO_SIMULATION' });
    expect(methodFiltered.filters.methodCode).toBe('DEMO_SIMULATION');
    expect(methodFiltered.totals.confirmedOrderCount).toBe(0);
    expect(methodFiltered.orders.createdCount).toBe(1);

    const statusFiltered = await reports.getReport({ recheck: async () => undefined } as any, { ...valid, orderStatus: 'PREPARING', paymentStatus: 'PAID' });
    expect(statusFiltered.orders.createdCount).toBe(1);
    expect(statusFiltered.totals.confirmedOrderCount).toBe(1);

    const transferFiltered = await reports.getReport({ recheck: async () => undefined } as any, { ...valid, methodCode: 'DEMO_TRANSFER', paymentStatus: 'PAID' });
    expect(transferFiltered.totals.confirmedOrderCount).toBe(1);
    expect(transferFiltered.totals.confirmedTotal.amountMinor).toBe('9500');

    const emptySales = await reports.getReport({ recheck: async () => undefined } as any, { ...valid, paymentStatus: 'PENDING' });
    expect(emptySales.totals.confirmedOrderCount).toBe(0);
    expect(emptySales.totals.confirmedTotal.amountMinor).toBe('0');
  });

  it('keeps large PostgreSQL numeric totals exact and rounds non-integral ticket averages half up', async () => {
    const report = await reports.getReport({ recheck: async () => undefined } as any, {
      from: '2026-10-05', to: '2026-10-07', methodCode: 'DEMO_SIMULATION', paymentStatus: 'PAID',
    });
    expect(report.totals.confirmedOrderCount).toBe(3);
    expect(report.totals.confirmedTotal.amountMinor).toBe('9007199254740998');
    expect(report.totals.averageTicket.amountMinor).toBe('3002399751580333');
  });
});

describe('H7 H1 revalidation failures', () => {
  it('preserves real H1 session errors from the snapshot recheck', async () => {
    const admins = new AdminUsersService({} as any, {} as any, {} as any, {} as any, {} as any);
    let authError: unknown;
    try { await admins.authorizeCatalog({}, false); } catch (error) { authError = error; }
    expect(getAdminUsersErrorMetadata(authError)?.status).toBe(401);
    const fixture = serviceForRows(aggregateRows());
    fixture.auth.recheck.mockRejectedValue(authError);
    await expect(fixture.service.getReport(fixture.auth as any, valid)).rejects.toBe(authError);
  });
});
