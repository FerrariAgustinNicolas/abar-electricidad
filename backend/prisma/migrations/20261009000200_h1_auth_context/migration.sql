CREATE TABLE "AuthSession" (
    "id" CHAR(64) NOT NULL,
    "adminUserId" UUID NOT NULL,
    "nonceCiphertext" BYTEA NOT NULL,
    "nonceIv" BYTEA NOT NULL,
    "nonceTag" BYTEA NOT NULL,
    "nonceVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "revokedAt" TIMESTAMP(3) WITH TIME ZONE,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuthPreAuthContext" (
    "id" CHAR(64) NOT NULL,
    "nonceCiphertext" BYTEA NOT NULL,
    "nonceIv" BYTEA NOT NULL,
    "nonceTag" BYTEA NOT NULL,
    "nonceVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

    CONSTRAINT "AuthPreAuthContext_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthSession_adminUserId_idx" ON "AuthSession"("adminUserId");
CREATE INDEX "AuthSession_absoluteExpiresAt_idx" ON "AuthSession"("absoluteExpiresAt");
CREATE INDEX "AuthSession_idleExpiresAt_idx" ON "AuthSession"("idleExpiresAt");
CREATE INDEX "AuthPreAuthContext_expiresAt_idx" ON "AuthPreAuthContext"("expiresAt");
