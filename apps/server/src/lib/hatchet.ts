import type { LogConstructor } from "@hatchet-dev/typescript-sdk/clients/hatchet-client/client-config";
import type {
  LogExtra,
  LogLevel,
} from "@hatchet-dev/typescript-sdk/util/logger/logger";
import { HatchetClient as Hatchet } from "@hatchet-dev/typescript-sdk/v1";
import { env } from "@/env";
import { getAppLogger, logger } from "@/lib/logger";

type HatchetClient = ReturnType<typeof Hatchet.init>;

let hatchetClient: HatchetClient | null = null;

function toHatchetLogLevel(level: typeof env.LOG_LEVEL): LogLevel {
  switch (level) {
    case "silent":
      return "OFF";
    case "fatal":
    case "error":
      return "ERROR";
    case "warn":
      return "WARN";
    case "info":
      return "INFO";
    case "debug":
    case "trace":
      return "DEBUG";

    default:
      return "INFO";
  }
}

const hatchetLogger: LogConstructor = (context) => {
  const workFlowLogger = getAppLogger(env.WORK_FLOWS_LOG_LEVEL);
  const label = `hatchet:${context}`;

  const withMeta = (extra?: LogExtra) => ({
    label,
    extra,
  });

  return {
    debug(message, extra) {
      workFlowLogger.debug(message, withMeta(extra));
    },
    info(message, extra) {
      workFlowLogger.info(message, withMeta(extra));
    },
    green(message, extra) {
      workFlowLogger.info(message, withMeta(extra));
    },
    warn(message, error, extra) {
      workFlowLogger.warn(message, {
        ...withMeta(extra),
        error,
      });
    },
    error(message, error, extra) {
      workFlowLogger.error(message, {
        ...withMeta(extra),
        error,
      });
    },
  };
};

export function getHatchet(): HatchetClient | null {
  if (!env.HATCHET_ENABLED) {
    return null;
  }

  if (!hatchetClient) {
    hatchetClient = Hatchet.init({
      token: env.HATCHET_CLIENT_TOKEN,
      log_level: toHatchetLogLevel(env.WORK_FLOWS_LOG_LEVEL),
      logger: hatchetLogger,
    });
    logger.info("Hatchet client initialized");
  }

  return hatchetClient;
}

export function requireHatchet(): HatchetClient {
  const client = getHatchet();
  if (!client) {
    throw new Error("Hatchet is not enabled. Set HATCHET_ENABLED=true");
  }
  return client;
}

export function isHatchetEnabled(): boolean {
  return env.HATCHET_ENABLED;
}

export type { HatchetClient };
