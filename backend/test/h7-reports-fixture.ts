import { createHash, randomUUID } from 'node:crypto';

export const H7_EXPECTED = Object.freeze({
  confirmedOrders: 2,
  productsSubtotalMinor: '14500',
  deliveryFeesMinor: '500',
  confirmedTotalMinor: '15000',
  averageTicketMinor: '7500',
  createdOrders: 5,
  activeUnpaid: 2,
  cancelledUnpaid: 1,
  rejectedPayments: 1,
  rejectedCurrentAttempts: 1,
});

type FixtureRecord = Readonly<{
  key: string;
  createdAt: string;
  orderStatus: string;
  paymentStatus: string;
  confirmedAt: string | null;
  subtotalMinor: bigint;
  deliveryFeeMinor: bigint;
  totalMinor: bigint;
  methodCode: string;
  attemptStatus: string;
}>;

const RECORDS: readonly FixtureRecord[] = [
  {
    key: 'paid-current', createdAt: '2026-10-01T03:00:00.000Z', orderStatus: 'PREPARING', paymentStatus: 'PAID',
    confirmedAt: '2026-10-01T03:00:00.000Z', subtotalMinor: 9000n, deliveryFeeMinor: 500n, totalMinor: 9500n,
    methodCode: 'DEMO_TRANSFER', attemptStatus: 'APPROVED',
  },
  {
    key: 'paid-cross-period', createdAt: '2026-09-30T12:00:00.000Z', orderStatus: 'DELIVERED', paymentStatus: 'PAID',
    confirmedAt: '2026-10-02T15:00:00.000Z', subtotalMinor: 5500n, deliveryFeeMinor: 0n, totalMinor: 5500n,
    methodCode: 'DEMO_PAY_ON_PICKUP', attemptStatus: 'APPROVED',
  },
  {
    key: 'approved-pending', createdAt: '2026-10-02T12:00:00.000Z', orderStatus: 'RECEIVED', paymentStatus: 'PENDING',
    confirmedAt: null, subtotalMinor: 1200n, deliveryFeeMinor: 0n, totalMinor: 1200n,
    methodCode: 'DEMO_SIMULATION', attemptStatus: 'APPROVED',
  },
  {
    key: 'rejected-current', createdAt: '2026-10-02T13:00:00.000Z', orderStatus: 'RECEIVED', paymentStatus: 'REJECTED',
    confirmedAt: null, subtotalMinor: 800n, deliveryFeeMinor: 0n, totalMinor: 800n,
    methodCode: 'DEMO_TRANSFER', attemptStatus: 'REJECTED',
  },
  {
    key: 'cancelled-unpaid', createdAt: '2026-10-03T12:00:00.000Z', orderStatus: 'CANCELLED', paymentStatus: 'PENDING',
    confirmedAt: null, subtotalMinor: 400n, deliveryFeeMinor: 0n, totalMinor: 400n,
    methodCode: 'DEMO_PAY_ON_PICKUP', attemptStatus: 'PENDING',
  },
  {
    key: 'paid-at-exclusive-end', createdAt: '2026-10-02T16:00:00.000Z', orderStatus: 'READY', paymentStatus: 'PAID',
    confirmedAt: '2026-10-04T03:00:00.000Z', subtotalMinor: 700n, deliveryFeeMinor: 0n, totalMinor: 700n,
    methodCode: 'DEMO_TRANSFER', attemptStatus: 'APPROVED',
  },
  {
    key: 'created-at-exclusive-end', createdAt: '2026-10-04T03:00:00.000Z', orderStatus: 'RECEIVED', paymentStatus: 'PENDING',
    confirmedAt: null, subtotalMinor: 300n, deliveryFeeMinor: 0n, totalMinor: 300n,
    methodCode: 'DEMO_SIMULATION', attemptStatus: 'APPROVED',
  },
  {
    key: 'paid-large-exact', createdAt: '2026-10-05T12:00:00.000Z', orderStatus: 'DELIVERED', paymentStatus: 'PAID',
    confirmedAt: '2026-10-05T12:00:00.000Z', subtotalMinor: 9007199254740993n, deliveryFeeMinor: 0n, totalMinor: 9007199254740993n,
    methodCode: 'DEMO_SIMULATION', attemptStatus: 'APPROVED',
  },
  {
    key: 'paid-rounding-two', createdAt: '2026-10-06T12:00:00.000Z', orderStatus: 'DELIVERED', paymentStatus: 'PAID',
    confirmedAt: '2026-10-06T12:00:00.000Z', subtotalMinor: 2n, deliveryFeeMinor: 0n, totalMinor: 2n,
    methodCode: 'DEMO_SIMULATION', attemptStatus: 'APPROVED',
  },
  {
    key: 'paid-rounding-three', createdAt: '2026-10-06T13:00:00.000Z', orderStatus: 'DELIVERED', paymentStatus: 'PAID',
    confirmedAt: '2026-10-06T13:00:00.000Z', subtotalMinor: 3n, deliveryFeeMinor: 0n, totalMinor: 3n,
    methodCode: 'DEMO_SIMULATION', attemptStatus: 'APPROVED',
  },
];

async function createOrder(tx: any, record: FixtureRecord, actorId: string): Promise<{ orderId: string; paymentId: string; currentAttemptId: string; previousAttemptId: string | null }> {
  const orderId = randomUUID();
  const quoteId = randomUUID();
  const paymentId = randomUUID();
  const firstAttemptId = randomUUID();
  const currentAttemptId = record.key === 'paid-current' ? randomUUID() : firstAttemptId;
  const tokenHash = createHash('sha256').update(orderId).digest('hex');
  const fingerprint = createHash('sha256').update(record.key).digest('hex');

  await tx.$executeRaw`INSERT INTO "CheckoutQuote" (id, "policyVersion", "stateFingerprint", response, "expiresAt")
    VALUES (${quoteId}, 1, ${fingerprint}, '{}'::jsonb, now() + interval '1 day')`;
  await tx.$executeRaw`INSERT INTO "Order" (id, "orderNumber", "quoteId", "createdAt", status, version, "deliveryMode",
    "customerFirstName", "customerLastName", "customerEmail", "customerPhone", "acceptedTermsVersion",
    "subtotalMinor", "deliveryFeeMinor", "totalMinor", "accessTokenHash", "accessExpiresAt")
    VALUES (${orderId}, ${`H7-${record.key}`}, ${quoteId}, ${new Date(record.createdAt)}, ${record.orderStatus}::"H4OrderStatus",
      1, 'PICKUP', 'Synthetic', 'Fixture', 'fixture@example.test', '0000000000', 'demo-2026-10-20-v1',
      ${record.subtotalMinor}, ${record.deliveryFeeMinor}, ${record.totalMinor}, ${tokenHash}, now() + interval '1 day')`;
  await tx.$executeRaw`INSERT INTO "Payment" (id, "orderId", status, "amountMinor", "confirmedAt", "confirmedByAdminUserId")
    VALUES (${paymentId}, ${orderId}, ${record.paymentStatus}::"H4PaymentStatus", ${record.totalMinor}, ${record.confirmedAt ? new Date(record.confirmedAt) : null}, ${record.confirmedAt ? actorId : null})`;

  if (record.key === 'paid-current') {
    await tx.$executeRaw`INSERT INTO "PaymentAttempt" (id, "paymentId", "methodCode", status, sequence)
      VALUES (${firstAttemptId}, ${paymentId}, 'DEMO_SIMULATION'::"H4PaymentMethod", 'PENDING'::"H4AttemptStatus", 1)`;
  }
  await tx.$executeRaw`INSERT INTO "PaymentAttempt" (id, "paymentId", "methodCode", status, sequence)
    VALUES (${currentAttemptId}, ${paymentId}, ${record.methodCode}::"H4PaymentMethod",
      ${record.attemptStatus}::"H4AttemptStatus", ${record.key === 'paid-current' ? 2 : 1})`;
  await tx.$executeRaw`UPDATE "Payment" SET "currentAttemptId" = ${currentAttemptId} WHERE id = ${paymentId}`;
  return { orderId, paymentId, currentAttemptId, previousAttemptId: record.key === 'paid-current' ? firstAttemptId : null };
}

/** Seeds only the dedicated disposable H7 database created by h7-postgres.mjs. */
export async function seedH7ReportsFixture(tx: any): Promise<void> {
  const actorId = randomUUID();
  await tx.$executeRaw`INSERT INTO "AdminUser" (id,name,email,"passwordHash",active,"mustChangePassword",version,"updatedAt") VALUES (${actorId},'H7 synthetic confirmation actor','h7-actor@example.test','disabled-fixture-account',false,true,1,now())`;
  const categoryId = randomUUID();
  const productId = randomUUID();
  const unitId = randomUUID();
  const meterId = randomUUID();
  const rollId = randomUUID();

  await tx.$executeRaw`INSERT INTO "Category" (id, name, slug) VALUES (${categoryId}, 'H7 synthetic', 'h7-synthetic')`;
  await tx.$executeRaw`INSERT INTO "Product" (id, "categoryId", name, slug, "createdAt", "updatedAt")
    VALUES (${productId}, ${categoryId}, 'Current catalog name', 'h7-synthetic-product', now(), now())`;
  await tx.$executeRaw`INSERT INTO "ProductPresentation" (id, "productId", unit, "rollLengthMeters", "amountMinor") VALUES
    (${unitId}, ${productId}, 'UNIT'::"PresentationUnit", NULL, 99999),
    (${meterId}, ${productId}, 'METER'::"PresentationUnit", NULL, 99999),
    (${rollId}, ${productId}, 'ROLL'::"PresentationUnit", 10, 99999)`;

  const seeded = new Map<string, string>();
  for (const record of RECORDS) {
    const { orderId, currentAttemptId, previousAttemptId } = await createOrder(tx, record, actorId);
    seeded.set(record.key, orderId);
    if (record.key === 'paid-current') {
      await tx.$executeRaw`INSERT INTO "OrderItem" (id, "orderId", "presentationId", "productId", "productSlug", "productName", unit, quantity, "unitPriceMinor", "lineTotalMinor", snapshot) VALUES
        (${randomUUID()}, ${orderId}, ${unitId}, ${productId}, 'h7-synthetic-product', '=DEMO historical name', 'UNIT', 2, 3000, 6000, '{}'::jsonb),
        (${randomUUID()}, ${orderId}, ${meterId}, ${productId}, 'h7-synthetic-product', 'Historical meter name', 'METER', 3, 1000, 3000, '{}'::jsonb)`;
    } else if (record.key === 'paid-cross-period') {
      await tx.$executeRaw`INSERT INTO "OrderItem" (id, "orderId", "presentationId", "productId", "productSlug", "productName", unit, "rollLengthMeters", quantity, "unitPriceMinor", "lineTotalMinor", snapshot)
        VALUES (${randomUUID()}, ${orderId}, ${rollId}, ${productId}, 'h7-synthetic-product', 'Historical roll name', 'ROLL', 10, 1, 5500, 5500, '{}'::jsonb)`;
    }
    if (record.key !== 'paid-current' && record.key !== 'paid-cross-period') {
      await tx.$executeRaw`INSERT INTO "OrderItem" (id,"orderId","presentationId","productId","productSlug","productName",unit,quantity,"unitPriceMinor","lineTotalMinor",snapshot) VALUES (${randomUUID()},${orderId},${unitId},${productId},'h7-synthetic-product','Synthetic snapshot','UNIT',1,${record.subtotalMinor},${record.subtotalMinor},'{}'::jsonb)`;
    }
    if (record.key === 'paid-current') {
      await tx.$executeRaw`INSERT INTO "OrderEvent" (id, "orderId", "attemptId", "eventType", details) VALUES
        (${randomUUID()}, ${orderId}, ${previousAttemptId}, 'PAYMENT_ATTEMPT_RECORDED', '{}'::jsonb),
        (${randomUUID()}, ${orderId}, ${currentAttemptId}, 'PAYMENT_CONFIRMED', '{}'::jsonb)`;
      for (const kind of ['ORDER_CREATED_BUYER', 'PAYMENT_CONFIRMED_BUYER']) {
        await tx.$executeRaw`INSERT INTO "NotificationJob" (id, "orderId", kind, recipient, "dedupeKey", payload)
          VALUES (${randomUUID()}, ${orderId}, ${kind}::"H4NotificationKind", 'fixture@example.test', ${`${orderId}:${kind}`}, '{}'::jsonb)`;
      }
    }
  }

  // Mutate current catalog facts after order creation; historical report values remain snapshots.
  await tx.$executeRaw`UPDATE "Product" SET name = 'Changed current product', "updatedAt" = now() WHERE id = ${productId}`;
  await tx.$executeRaw`UPDATE "ProductPresentation" SET "amountMinor" = 1 WHERE "productId" = ${productId}`;
  await tx.$executeRaw`UPDATE "CheckoutPolicy" SET "feeMinor" = 999999, version = version + 1, "updatedAt" = now()`;
  if (seeded.size !== RECORDS.length) throw new Error('H7 fixture did not seed every scenario');
}
