import * as schema from "@repo/db/schema";
import { getAuthTables } from "better-auth/db";
import { getTableColumns, is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "@/modules/auth/instance";

function drizzleColumnsByName(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const [name, table] of Object.entries(schema)) {
    if (!is(table, Table)) {
      continue;
    }
    tables.set(name, new Set(Object.keys(getTableColumns(table))));
  }
  return tables;
}

describe("better auth schema contract", () => {
  it("maps every better auth model to a drizzle table with all written fields", () => {
    const expectedTables = Object.values(getAuthTables(auth.options));
    const actualTables = drizzleColumnsByName();
    const missing: string[] = [];

    for (const table of expectedTables) {
      const name = `${table.modelName}s`;
      const fields = actualTables.get(name);
      if (!fields) {
        missing.push(`table ${name}`);
        continue;
      }

      const written = new Set([
        "id",
        ...Object.entries(table.fields).map(
          ([key, field]) => field.fieldName || key
        ),
      ]);
      for (const field of written) {
        if (!fields.has(field)) {
          missing.push(`field ${name}.${field}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
