import winston from "winston";

const { combine, timestamp, printf } = winston.format;

const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

export const logger = winston.createLogger({
  level: "info",
  format: combine(timestamp(), customFormat),
  defaultMeta: { service: "user-service" },
  transports: [
    new winston.transports.Console({ format: combine(timestamp(), customFormat) }),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "warn.log", level: "warn" }),
    new winston.transports.File({ filename: "full.log" }),
  ],
});

export const loggerDB = winston.createLogger({
  level: "info",
  format: combine(timestamp(), customFormat),
  defaultMeta: { service: "db-service" },
  transports: [
    new winston.transports.Console({ format: combine(timestamp(), customFormat) }),
    // new winston.transports.File({ filename: "db.log" }),
  ],
});
