-- H6 is additive. Existing business events, recipients, payloads and snapshots are not rewritten.
ALTER TYPE "H4NotificationKind" ADD VALUE 'ORDER_CANCELLED_ADMIN';
ALTER TYPE "H4NotificationState" ADD VALUE 'PROCESSING';
ALTER TYPE "H4NotificationState" ADD VALUE 'RETRY_WAIT';
ALTER TYPE "H4NotificationState" ADD VALUE 'SENT';
ALTER TYPE "H4NotificationState" ADD VALUE 'FAILED';

ALTER TABLE "CheckoutPolicy" ADD COLUMN "contact" JSONB NOT NULL DEFAULT '{"displayName":"ABAR DEMO","email":"contact@example.test","phone":"","whatsapp":"","hours":"DEMO - hours not confirmed","address":"DEMO - address not confirmed"}';
ALTER TABLE "NotificationJob"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "sentAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastError" VARCHAR(32),
  ADD COLUMN "leaseToken" UUID,
  ADD COLUMN "leaseUntil" TIMESTAMPTZ(3);
ALTER TABLE "NotificationJob"
  ADD CONSTRAINT "NotificationJob_attempts_check" CHECK ("attemptCount" BETWEEN 0 AND 5 AND "totalAttemptCount" >= "attemptCount"),
  ADD CONSTRAINT "NotificationJob_version_check" CHECK ("version" BETWEEN 1 AND 2147483647),
  ADD CONSTRAINT "NotificationJob_lease_check" CHECK (("state"::text = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL) OR ("state"::text <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL)),
  ADD CONSTRAINT "NotificationJob_sent_check" CHECK (("state"::text = 'SENT') = ("sentAt" IS NOT NULL)),
  ADD CONSTRAINT "NotificationJob_error_check" CHECK ("lastError" IS NULL OR "lastError" IN ('SMTP_UNAVAILABLE', 'SMTP_REJECTED', 'INVALID_JOB', 'LEASE_EXPIRED'));
CREATE INDEX "NotificationJob_state_nextAttemptAt_createdAt_idx" ON "NotificationJob"("state", "nextAttemptAt", "createdAt");
CREATE INDEX "NotificationJob_state_leaseUntil_idx" ON "NotificationJob"("state", "leaseUntil");
CREATE INDEX "NotificationJob_orderId_createdAt_idx" ON "NotificationJob"("orderId", "createdAt");
