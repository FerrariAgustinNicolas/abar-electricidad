-- Additive H2 migration: no ALTER/DROP/DELETE against existing H1 tables.
CREATE TYPE "PresentationUnit" AS ENUM ('UNIT', 'METER', 'ROLL');
CREATE TYPE "StockOperationType" AS ENUM ('ADJUSTMENT', 'ROLL_OPENING');

CREATE TABLE "Category" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL CHECK (length(btrim("name")) > 0),
  "slug" VARCHAR(120) NOT NULL UNIQUE CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  "description" VARCHAR(1000) NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0 CHECK ("order" >= 0),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0)
);
CREATE INDEX "Category_active_order_idx" ON "Category"("active", "order");

CREATE TABLE "Product" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "categoryId" UUID NOT NULL REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(200) NOT NULL CHECK (length(btrim("name")) > 0),
  "slug" VARCHAR(120) NOT NULL UNIQUE CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  "brand" VARCHAR(100), "sku" VARCHAR(100) UNIQUE,
  "shortDescription" VARCHAR(500) NOT NULL DEFAULT '',
  "description" VARCHAR(10000) NOT NULL DEFAULT '',
  "attributes" JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("attributes") = 'array' AND jsonb_array_length("attributes") <= 40),
  "active" BOOLEAN NOT NULL DEFAULT true, "featured" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Product_categoryId_active_idx" ON "Product"("categoryId", "active");
CREATE INDEX "Product_active_featured_idx" ON "Product"("active", "featured");
CREATE INDEX "Product_name_id_idx" ON "Product"("name", "id");

CREATE TABLE "ProductPresentation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "unit" "PresentationUnit" NOT NULL,
  "rollLengthMeters" INTEGER,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" >= 0),
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 0 CHECK ("lowStockThreshold" >= 0),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false CHECK (NOT "isDefault" OR "active"),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  CONSTRAINT "ProductPresentation_length_check" CHECK (
    ("unit" = 'ROLL' AND "rollLengthMeters" IS NOT NULL AND "rollLengthMeters" > 0)
    OR ("unit" <> 'ROLL' AND "rollLengthMeters" IS NULL)
  ),
  CONSTRAINT "ProductPresentation_productId_unit_key" UNIQUE ("productId", "unit")
);
CREATE INDEX "ProductPresentation_active_unit_amountMinor_idx" ON "ProductPresentation"("active", "unit", "amountMinor");
CREATE UNIQUE INDEX "ProductPresentation_one_default" ON "ProductPresentation"("productId") WHERE "isDefault";

CREATE TABLE "ProductImage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "storageKey" VARCHAR(80) NOT NULL UNIQUE CHECK ("storageKey" ~ '^[a-f0-9-]+[.]png$'),
  "contentType" VARCHAR(40) NOT NULL CHECK ("contentType" = 'image/png'),
  "bytes" INTEGER NOT NULL CHECK ("bytes" BETWEEN 1 AND 5242880),
  "width" INTEGER NOT NULL CHECK ("width" BETWEEN 1 AND 4096),
  "height" INTEGER NOT NULL CHECK ("height" BETWEEN 1 AND 4096),
  "alt" VARCHAR(200) NOT NULL CHECK (length(btrim("alt")) > 0),
  "order" INTEGER NOT NULL DEFAULT 0 CHECK ("order" BETWEEN 0 AND 7),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "ProductImage_productId_order_idx" ON "ProductImage"("productId", "order");
CREATE UNIQUE INDEX "ProductImage_one_primary" ON "ProductImage"("productId") WHERE "isPrimary";

CREATE TABLE "StockBalance" (
  "presentationId" UUID PRIMARY KEY REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "availableQuantity" INTEGER NOT NULL DEFAULT 0 CHECK ("availableQuantity" >= 0),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0)
);
CREATE TABLE "StockOperation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "StockOperationType" NOT NULL,
  "reason" VARCHAR(500) NOT NULL CHECK (length(btrim("reason")) > 0),
  "actorAdminUserId" UUID NOT NULL REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" VARCHAR(200) NOT NULL CHECK ("idempotencyKey" ~ '^[A-Za-z0-9._:-]+$'),
  "requestHash" CHAR(64) NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "metadata" JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof("metadata") = 'object'),
  "result" JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof("result") = 'object'),
  CONSTRAINT "StockOperation_actorAdminUserId_idempotencyKey_key" UNIQUE ("actorAdminUserId", "idempotencyKey")
);
CREATE INDEX "StockOperation_createdAt_id_idx" ON "StockOperation"("createdAt", "id");
CREATE INDEX "StockOperation_actorAdminUserId_createdAt_idx" ON "StockOperation"("actorAdminUserId", "createdAt");
CREATE TABLE "StockEntry" (
  "operationId" UUID NOT NULL REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "presentationId" UUID NOT NULL REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "delta" INTEGER NOT NULL CHECK ("delta" <> 0),
  "resultingQuantity" INTEGER NOT NULL CHECK ("resultingQuantity" >= 0),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  PRIMARY KEY ("operationId", "presentationId")
);
CREATE INDEX "StockEntry_presentationId_operationId_idx" ON "StockEntry"("presentationId", "operationId");
