import { createLogger, format, transports } from "winston";
import { env } from "@/env";

type LogLevel = typeof env.LOG_LEVEL;

const appName = env.APP_NAME;

// Error properties are non-enumerable, so an Error passed as metadata
// (e.g. logger.error("msg", { error: err })) serializes to {} under
// format.json(). Replace Error instances with plain objects first.
const serializeErrorMeta = format((info) => {
  for (const key of Object.keys(info)) {
    const value = info[key];
    if (value instanceof Error) {
      info[key] = {
        message: value.message,
        name: value.name,
        stack: value.stack,
      };
    }
  }
  return info;
});

export function getAppLogger(level: LogLevel = "info") {
  return createLogger({
    exitOnError: false,
    format: format.combine(
      format.errors({ stack: true }),
      serializeErrorMeta()
    ),
    level,
    transports: [
      env.NODE_ENV === "production"
        ? new transports.Console({
            format: format.combine(format.timestamp(), format.json()),
          })
        : new transports.Console({
            format: format.combine(
              format.timestamp(),
              format.colorize(),
              format.printf(
                ({ timestamp, level, message, label, ...meta }) =>
                  `[${label || appName}] ${timestamp} ${level}: ${message} ${JSON.stringify(meta)}`
              )
            ),
          }),
    ],
  });
}

export const logger = getAppLogger(env.LOG_LEVEL);
