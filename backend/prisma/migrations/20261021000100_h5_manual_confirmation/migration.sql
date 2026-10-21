-- Additive H5: historical rows and types retain their identity.
ALTER TYPE "H4OrderStatus" ADD VALUE 'PREPARING';
ALTER TYPE "H4OrderStatus" ADD VALUE 'READY';
ALTER TYPE "H4OrderStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "H4OrderStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "H4PaymentStatus" ADD VALUE 'PAID';
ALTER TYPE "StockOperationType" ADD VALUE 'PAYMENT_CONFIRMATION';
ALTER TYPE "H4IdempotencyKind" ADD VALUE 'PAYMENT_CONFIRMATION';
ALTER TYPE "H4IdempotencyKind" ADD VALUE 'ORDER_STATUS';
ALTER TYPE "H4IdempotencyKind" ADD VALUE 'ORDER_CANCEL';
ALTER TYPE "H4IdempotencyKind" ADD VALUE 'ORDER_NOTE';
ALTER TYPE "H4NotificationKind" ADD VALUE 'PAYMENT_CONFIRMED_BUYER';
ALTER TYPE "H4NotificationKind" ADD VALUE 'PAYMENT_CONFIRMED_ADMIN';
ALTER TYPE "H4NotificationKind" ADD VALUE 'ORDER_READY_BUYER';
ALTER TYPE "H4NotificationKind" ADD VALUE 'ORDER_CANCELLED_BUYER';
ALTER TABLE "Payment" ADD COLUMN "confirmedAt" TIMESTAMPTZ(3), ADD COLUMN "confirmedByAdminUserId" UUID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedByAdminUserId_fkey" FOREIGN KEY ("confirmedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmation_check" CHECK (
  ("status"::text = 'PAID' AND "confirmedAt" IS NOT NULL AND "confirmedByAdminUserId" IS NOT NULL) OR
  ("status"::text <> 'PAID' AND "confirmedAt" IS NULL AND "confirmedByAdminUserId" IS NULL)
);
CREATE UNIQUE INDEX "Payment_id_orderId_key" ON "Payment"("id", "orderId");
ALTER TABLE "StockOperation" ADD COLUMN "paymentId" UUID, ADD COLUMN "orderId" UUID;
CREATE UNIQUE INDEX "StockOperation_paymentId_key" ON "StockOperation"("paymentId");
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_paymentId_orderId_fkey" FOREIGN KEY ("paymentId", "orderId") REFERENCES "Payment"("id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_payment_link_check" CHECK (
  ("type"::text = 'PAYMENT_CONFIRMATION' AND "paymentId" IS NOT NULL AND "orderId" IS NOT NULL) OR
  ("type"::text <> 'PAYMENT_CONFIRMATION' AND "paymentId" IS NULL AND "orderId" IS NULL)
);
ALTER TABLE "OrderEvent" ADD COLUMN "actorAdminUserId" UUID;
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "OrderNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL, "actorAdminUserId" UUID NOT NULL,
  "text" VARCHAR(2000) NOT NULL, "version" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderNote_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderNote_text_check" CHECK (length(btrim("text")) BETWEEN 1 AND 2000),
  CONSTRAINT "OrderNote_version_check" CHECK ("version" BETWEEN 1 AND 2147483647)
);
CREATE INDEX "OrderNote_orderId_createdAt_id_idx" ON "OrderNote"("orderId", "createdAt", "id");
-- Audit rows are append-only, including pre-existing H4 history.
CREATE FUNCTION "h5_immutable_order_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Order history is append-only' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER "OrderEvent_immutable" BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION "h5_immutable_order_history"();
CREATE TRIGGER "OrderNote_immutable" BEFORE UPDATE OR DELETE ON "OrderNote" FOR EACH ROW EXECUTE FUNCTION "h5_immutable_order_history"();
