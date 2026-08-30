import chalk from "chalk";
import type { Logger } from "drizzle-orm";
import { logger } from "@/lib/logger";

// Created once: the label is static, so there is no need to allocate a child
// logger per query.
const drizzleLogger = logger.child({ label: "drizzle" });

// cli-highlight pulls in highlight.js (~150ms import, several MB RSS), so only
// load it when debug logging can actually emit queries.
const highlight = drizzleLogger.isDebugEnabled()
  ? (await import("cli-highlight")).highlight
  : null;

function highlightSql(query: string): string {
  if (!highlight) {
    return query;
  }
  return highlight(query, { ignoreIllegals: true, language: "sql" });
}

export class DrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    // Winston evaluates the message arguments before filtering by level, so the
    // syntax-highlight and placeholder-substitution work below would run for
    // every query even when debug logging is disabled. Guard it explicitly.
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

    return sqlTemplate.replace(/\$(\d+)/g, (_match, index) => {
      const value = values[Number.parseInt(index, 10) - 1];

      if (value === null || value === undefined) {
        return "NULL";
      }
      if (typeof value === "string") {
        return `'${value.replace(/'/g, "''")}'`;
      }
      if (typeof value === "number") {
        return value.toString();
      }
      if (typeof value === "boolean") {
        return value ? "true" : "false";
      }
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    });
  }
}
