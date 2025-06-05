import "dotenv/config";
import { DefaultLogger, LogWriter } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { loggerDB } from "../utils/logger";

const databaseUrl =
  process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.PROD_DATABASE_URL;

class MyLogWriter implements LogWriter {
  write(message: string) {
    loggerDB.info(message);
  }
}
const logger = new DefaultLogger({ writer: new MyLogWriter() });

export const db = drizzle(databaseUrl!, { logger });
