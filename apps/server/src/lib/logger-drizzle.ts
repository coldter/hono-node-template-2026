import chalk from "chalk";
import { highlight } from "cli-highlight";
import type { Logger } from "drizzle-orm";
import { logger } from "@/lib/logger";

export class DrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    const drizzleLogger = logger.child({ label: "drizzle" });

    if (process.env.NODE_ENV === "production") {
      drizzleLogger.debug(
        `${chalk.cyanBright("DB Query:")} ${highlight(query, {
          language: "sql",
          ignoreIllegals: true,
        })}`,
        { paramsCount: params.length }
      );
      return;
    }

    drizzleLogger.debug(
      `${chalk.cyanBright("DB Query Escaped:")} ${highlight(
        this.replaceSqlPlaceholders(query, params),
        {
          language: "sql",
          ignoreIllegals: true,
        }
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
