/**
 * Branded-ID generator factory for Better Auth's
 * `advanced.database.generateId` slot.
 *
 * Both perimeters consume the same `ID_PREFIXES` map from `@repo/db` and
 * fall back to BA's own generator (`return false`) for unmapped models.
 * Centralising the wrapper here means a future renamed prefix or added
 * model is picked up by both perimeters automatically.
 */

import { generateIdForModel, ID_PREFIXES } from "@repo/db";

/**
 * Minimal logger surface — accepts whatever the caller has. Used only for
 * the dev-mode `Unmapped BA model` warning so the factory doesn't drag
 * winston into the auth-tokens dependency tree.
 */
export type IdGeneratorLogger = Readonly<{
  warn: (message: string, meta?: Record<string, unknown>) => void;
}>;

export type IdGeneratorFn = (options: { model: string }) => string | false;

function isKnownIdModel(model: string): model is keyof typeof ID_PREFIXES {
  return Object.hasOwn(ID_PREFIXES, model);
}

export function buildIdGenerator(logger: IdGeneratorLogger): IdGeneratorFn {
  return (options) => {
    if (isKnownIdModel(options.model)) {
      return generateIdForModel(options.model);
    }
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Unmapped BA model for generateId", { model: options.model });
    }
    return false;
  };
}
