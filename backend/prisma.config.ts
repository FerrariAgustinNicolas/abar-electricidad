import { defineConfig } from 'prisma/config';

const localOnlyDatabaseUrl = 'postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL ?? localOnlyDatabaseUrl },
});
