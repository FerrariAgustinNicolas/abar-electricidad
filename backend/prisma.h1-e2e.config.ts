import { defineConfig } from 'prisma/config';
import { validateMigrationTarget } from './scripts/h1-real-e2e.mjs';

function migrationDatasource(env: Record<string, string | undefined>): string {
  try {
    return validateMigrationTarget(env.H1_E2E_RUN_ID, env.H1_E2E_DATABASE_URL);
  } catch {
    // Never expose malformed URLs or credentials in config errors.
    throw new Error('H1 migration configuration is unavailable');
  }
}

// This validates a private migration target only. The host's ownership checks remain authoritative.
const datasourceUrl = migrationDatasource(process.env);
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: datasourceUrl },
});
