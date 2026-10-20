import type { Prisma } from '../generated/prisma/client';

/** Serialize upload publication against orphan cleanup for the full transaction lifetime. */
export async function lockCatalogImages(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1868787567)`;
}
