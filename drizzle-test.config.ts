import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.TEST_DATABASE_URL!,
    port: 5432,
  },
  verbose: true,
  strict: true,
});
