CREATE TYPE "H4OrderStatus" AS ENUM ('RECEIVED');
CREATE TYPE "H4PaymentStatus" AS ENUM ('PENDING', 'REJECTED');
CREATE TYPE "H4AttemptStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');
CREATE TYPE "H4PaymentMethod" AS ENUM ('DEMO_PAY_ON_PICKUP', 'DEMO_TRANSFER', 'DEMO_SIMULATION');
CREATE TYPE "H4IdempotencyKind" AS ENUM ('CREATE_ORDER', 'PAYMENT_ATTEMPT');
CREATE TYPE "H4NotificationKind" AS ENUM ('ORDER_CREATED_BUYER', 'ORDER_CREATED_ADMIN');
CREATE TYPE "H4NotificationState" AS ENUM ('PENDING');

CREATE TABLE "Order" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderNumber" VARCHAR(64) NOT NULL,
  "quoteId" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "H4OrderStatus" NOT NULL DEFAULT 'RECEIVED', "version" INTEGER NOT NULL DEFAULT 1, "deliveryMode" VARCHAR(16) NOT NULL,
  "customerFirstName" VARCHAR(100) NOT NULL, "customerLastName" VARCHAR(100) NOT NULL,
  "customerEmail" VARCHAR(254) NOT NULL, "customerPhone" VARCHAR(32) NOT NULL,
  "customerNote" VARCHAR(500), "deliveryAddressLine" VARCHAR(200), "deliveryLocality" VARCHAR(100),
  "deliveryInstructions" VARCHAR(500), "acceptedTermsVersion" VARCHAR(64) NOT NULL,
  "subtotalMinor" BIGINT NOT NULL, "deliveryFeeMinor" BIGINT NOT NULL, "totalMinor" BIGINT NOT NULL,
  "accessTokenHash" CHAR(64) NOT NULL, "accessExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"), CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CheckoutQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_amounts_check" CHECK ("subtotalMinor" >= 0 AND "deliveryFeeMinor" >= 0 AND "totalMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "deliveryFeeMinor"),
  CONSTRAINT "Order_delivery_check" CHECK (("deliveryMode" = 'PICKUP' AND "deliveryAddressLine" IS NULL AND "deliveryLocality" IS NULL) OR ("deliveryMode" = 'COORDINATED' AND "deliveryAddressLine" IS NOT NULL AND "deliveryLocality" IS NOT NULL)),
  CONSTRAINT "Order_terms_check" CHECK ("acceptedTermsVersion" = 'demo-2026-10-20-v1'),
  CONSTRAINT "Order_version_check" CHECK ("version" BETWEEN 1 AND 2147483647)
);
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");
CREATE UNIQUE INDEX "Order_accessTokenHash_key" ON "Order"("accessTokenHash");
CREATE INDEX "Order_createdAt_id_idx" ON "Order"("createdAt", "id");
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL, "presentationId" UUID NOT NULL,
  "productId" UUID NOT NULL, "productSlug" VARCHAR(120) NOT NULL, "productName" VARCHAR(200) NOT NULL,
  "unit" VARCHAR(8) NOT NULL, "rollLengthMeters" INTEGER, "quantity" INTEGER NOT NULL,
  "unitPriceMinor" BIGINT NOT NULL, "lineTotalMinor" BIGINT NOT NULL, "snapshot" JSONB NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 2147483647),
  CONSTRAINT "OrderItem_amounts_check" CHECK ("unitPriceMinor" >= 0 AND "lineTotalMinor" >= 0 AND "lineTotalMinor" = "unitPriceMinor" * "quantity"),
  CONSTRAINT "OrderItem_unit_check" CHECK (("unit" = 'ROLL' AND "rollLengthMeters" > 0) OR ("unit" IN ('UNIT','METER') AND "rollLengthMeters" IS NULL))
);
CREATE INDEX "OrderItem_presentationId_orderId_idx" ON "OrderItem"("presentationId", "orderId");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL,
  "status" "H4PaymentStatus" NOT NULL DEFAULT 'PENDING', "amountMinor" BIGINT NOT NULL,
  "currentAttemptId" UUID, CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Payment_amount_check" CHECK ("amountMinor" >= 0)
);
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
CREATE UNIQUE INDEX "Payment_currentAttemptId_key" ON "Payment"("currentAttemptId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "paymentId" UUID NOT NULL,
  "methodCode" "H4PaymentMethod" NOT NULL, "status" "H4AttemptStatus" NOT NULL,
  "sequence" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "demoScenario" "H4AttemptStatus",
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentAttempt_sequence_check" CHECK ("sequence" BETWEEN 1 AND 2147483647),
  CONSTRAINT "PaymentAttempt_scenario_check" CHECK ("methodCode" = 'DEMO_SIMULATION' OR "demoScenario" IS NULL)
);
CREATE UNIQUE INDEX "PaymentAttempt_paymentId_sequence_key" ON "PaymentAttempt"("paymentId", "sequence");
CREATE INDEX "PaymentAttempt_paymentId_createdAt_idx" ON "PaymentAttempt"("paymentId", "createdAt");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currentAttemptId_fkey" FOREIGN KEY ("currentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL, "attemptId" UUID,
  "eventType" VARCHAR(48) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "details" JSONB NOT NULL DEFAULT '{}', CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OrderEvent_orderId_createdAt_id_idx" ON "OrderEvent"("orderId", "createdAt", "id");

CREATE TABLE "OrderIdempotencyKey" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "kind" "H4IdempotencyKind" NOT NULL,
  "scope" VARCHAR(64) NOT NULL, "key" VARCHAR(200) NOT NULL, "fingerprint" CHAR(64) NOT NULL,
  "responseStatus" INTEGER NOT NULL, "responseCiphertext" BYTEA NOT NULL, "responseIv" BYTEA NOT NULL,
  "responseTag" BYTEA NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orderId" UUID, "attemptId" UUID,
  CONSTRAINT "OrderIdempotencyKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderIdempotencyKey_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderIdempotencyKey_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderIdempotencyKey_status_check" CHECK ("responseStatus" BETWEEN 200 AND 299)
);
CREATE UNIQUE INDEX "OrderIdempotencyKey_scope_key_key" ON "OrderIdempotencyKey"("scope", "key");
CREATE INDEX "OrderIdempotencyKey_orderId_idx" ON "OrderIdempotencyKey"("orderId");

CREATE TABLE "NotificationJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL,
  "kind" "H4NotificationKind" NOT NULL, "recipient" VARCHAR(254) NOT NULL,
  "dedupeKey" VARCHAR(200) NOT NULL, "state" "H4NotificationState" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "payload" JSONB NOT NULL,
  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationJob_dedupeKey_key" ON "NotificationJob"("dedupeKey");
CREATE INDEX "NotificationJob_state_createdAt_idx" ON "NotificationJob"("state", "createdAt");
