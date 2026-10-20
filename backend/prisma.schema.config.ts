import { defineConfig } from 'prisma/config';

// Ordinary generation and validation need the schema, not a database target.
export default defineConfig({
  schema: 'prisma/schema.prisma',
});
