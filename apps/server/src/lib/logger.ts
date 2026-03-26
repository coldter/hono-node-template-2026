import { createLogger, format, transports } from "winston";
import { env } from "@/env";

type LogLevel = typeof env.LOG_LEVEL;

const appName = env.APP_NAME;

export function getAppLogger(level: LogLevel = "info") {
  return createLogger({
    level,
    format: format.json(),
    transports: [
      env.NODE_ENV === "production"
        ? new transports.Console()
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
    exitOnError: false,
  });
}

export const logger = getAppLogger(env.LOG_LEVEL);
