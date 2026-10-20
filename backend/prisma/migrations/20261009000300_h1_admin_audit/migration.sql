CREATE TABLE "AdminUserAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorAdminUserId" UUID NOT NULL,
    "targetAdminUserId" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUserAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminUserAudit_targetAdminUserId_createdAt_idx" ON "AdminUserAudit"("targetAdminUserId", "createdAt");
CREATE INDEX "AdminUserAudit_actorAdminUserId_createdAt_idx" ON "AdminUserAudit"("actorAdminUserId", "createdAt");
