import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DEUCE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DEUCE_DATABASE_URL is required');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
});
