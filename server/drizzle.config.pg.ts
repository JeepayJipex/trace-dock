import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/db/schema/logs.ts',
    './src/db/schema/traces.ts',
    './src/db/schema/spans.ts',
    './src/db/schema/errorGroups.ts',
    './src/db/schema/settings.ts',
  ],
  out: './drizzle/postgresql',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/tracedock',
  },
});
