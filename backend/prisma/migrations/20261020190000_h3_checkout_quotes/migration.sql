CREATE TABLE "CheckoutPolicy" (
    "id" VARCHAR(32) NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "quoteTtlSeconds" INTEGER NOT NULL DEFAULT 600,
    "enabledDeliveryModes" JSONB NOT NULL,
    "paymentMethods" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CheckoutPolicy_feeMinor_check" CHECK ("feeMinor" >= 0),
    CONSTRAINT "CheckoutPolicy_quoteTtlSeconds_check" CHECK ("quoteTtlSeconds" BETWEEN 60 AND 3600),
    CONSTRAINT "CheckoutPolicy_version_check" CHECK ("version" > 0)
);

CREATE TABLE "CheckoutQuote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policyVersion" INTEGER NOT NULL,
    "stateFingerprint" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CheckoutQuote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckoutQuote_expiresAt_idx" ON "CheckoutQuote"("expiresAt");

INSERT INTO "CheckoutPolicy" ("id", "feeMinor", "quoteTtlSeconds", "enabledDeliveryModes", "paymentMethods", "version")
VALUES (
  'default', 0, 600, '["PICKUP","COORDINATED"]'::jsonb,
  '[{"code":"DEMO_PAY_ON_PICKUP","label":"Pago ficticio al retirar","instructions":"Demostración: no se procesa ningún pago.","deliveryModes":["PICKUP"],"demo":true},{"code":"DEMO_TRANSFER","label":"Transferencia ficticia","instructions":"Demostración: no se solicitan ni reciben datos bancarios.","deliveryModes":["PICKUP","COORDINATED"],"demo":true},{"code":"DEMO_SIMULATION","label":"Simulación ficticia","instructions":"Demostración: no se intenta ni confirma ningún pago.","deliveryModes":["PICKUP","COORDINATED"],"demo":true}]'::jsonb,
  1
);
