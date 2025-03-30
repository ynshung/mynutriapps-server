import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseUrl =
  process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.PROD_DATABASE_URL;
export const db = drizzle(databaseUrl!, { logger: true });
