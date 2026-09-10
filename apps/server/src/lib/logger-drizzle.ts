import chalk from "chalk";
import type { Logger } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const drizzleLogger = logger.child({ label: "drizzle" });

const highlight = drizzleLogger.isDebugEnabled()
  ? (await import("cli-highlight")).highlight
  : null;

type SqlParam =
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "json"; readonly value: string }
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string };

const sqlNumberSchema = z.union([
  z.number(),
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
]);

const sqlParamSchema = z.union([
  z.boolean().transform((value): SqlParam => ({ kind: "boolean", value })),
  sqlNumberSchema.transform((value): SqlParam => ({ kind: "number", value })),
  z.string().transform((value): SqlParam => ({ kind: "string", value })),
  z.null().transform((): SqlParam => ({ kind: "null" })),
  z.undefined().transform((): SqlParam => ({ kind: "null" })),
  z.unknown().transform(
    (value): SqlParam => ({
      kind: "json",
      value: JSON.stringify(value) ?? "null",
    })
  ),
]);

function highlightSql(query: string): string {
  if (!highlight) {
    return query;
  }
  return highlight(query, { ignoreIllegals: true, language: "sql" });
}

export class DrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    if (!drizzleLogger.isDebugEnabled()) {
      return;
    }

    if (process.env.NODE_ENV === "production") {
      drizzleLogger.debug(
        `${chalk.cyanBright("DB Query:")} ${highlightSql(query)}`,
        { paramsCount: params.length }
      );
      return;
    }

    drizzleLogger.debug(
      `${chalk.cyanBright("DB Query Escaped:")} ${highlightSql(
        this.replaceSqlPlaceholders(query, params)
      )}`
    );
  }

  replaceSqlPlaceholders(sqlTemplate: string, values: unknown[]) {
    const placeholderCount = (sqlTemplate.match(/\$\d+/g) || []).length;
    if (placeholderCount !== values.length) {
      throw new Error(
        `Mismatch between placeholders (${placeholderCount}) and values (${values.length})`
      );
    }

    const params = values.map((value) => sqlParamSchema.parse(value));

    return sqlTemplate.replace(/\$(\d+)/g, (_match, index) => {
      const value = params[Number.parseInt(index, 10) - 1];

      if (value === undefined || value.kind === "null") {
        return "NULL";
      }
      if (value.kind === "string") {
        return `'${value.value.replace(/'/g, "''")}'`;
      }
      if (value.kind === "number") {
        return value.value.toString();
      }
      if (value.kind === "boolean") {
        return value.value ? "true" : "false";
      }
      return `'${value.value.replace(/'/g, "''")}'`;
    });
  }
}
