/**
 * `liveOrganizations(executor)` — sanctioned read seam for the
 * `organization` table.
 *
 * Every read of `organizations` must filter `WHERE deleted_at IS NULL`; a
 * missing filter would resurface a soft-deleted tenant in a session-creation
 * hook or `/api/tenancy/current`. The shapes returned here pre-bind that
 * predicate so callers cannot accidentally drop it.
 *
 * Bypass is only permitted via the ALLOWLIST in
 * `packages/db/__tests__/live-organizations.spec.ts`; each entry documents
 * why bypassing is justified.
 */

import {
  and,
  type Column,
  count as countFn,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { DrizzleClient, Executor } from "./client";
import { organizations } from "./schema/organizations";

type SelectColumns = NonNullable<Parameters<DrizzleClient["select"]>[0]>;

/**
 * Resolved row shape for a column-projection map. Mirrors the small subset
 * of Drizzle's `SelectResult` we need — only handles `Column`-keyed entries,
 * which covers every callsite in this repo.
 */
type RowOf<TColumns extends SelectColumns> = {
  [K in keyof TColumns]: TColumns[K] extends Column<infer Cfg>
    ? Cfg extends { notNull: true; data: infer D }
      ? D
      : Cfg extends { data: infer D }
        ? D | null
        : unknown
    : unknown;
};

function withLivePredicate(extra?: SQL): SQL {
  const live = isNull(organizations.deletedAt);
  if (!extra) {
    return live;
  }
  const merged = and(live, extra);
  if (!merged) {
    // Defensive: drizzle's and() returns undefined only when both inputs
    // are falsy; impossible here because `live` is always set.
    throw new Error("liveOrganizations: failed to compose predicate");
  }
  return merged;
}

/**
 * Centralized seam for Drizzle's builder-chain generic variance. Drizzle's
 * chained builders resolve to a union of `PgAsyncSelectBase` variants where
 * one branch is `Omit<..., string>` which strips `then`, breaking
 * `await`/`PromiseLike` consumers. Every call below has been verified at
 * runtime to resolve to the awaited row shape, so we cast once here rather
 * than at every method body.
 */
function awaitableQuery<TRow>(builder: unknown): Promise<TRow> {
  // boundary: Drizzle vendor-SDK generic variance — Executor union strips
  // `then` in one branch of PgAsyncSelectBase. Runtime is always thenable.
  return builder as Promise<TRow>;
}

/**
 * Narrows a still-chainable Drizzle builder to a concrete shape. Used when
 * the chain continues past `.where()` (e.g. `.orderBy(...).limit(...)`)
 * and the union branch strips those methods at the type level.
 */
function narrowChain<TShape>(builder: unknown): TShape {
  // boundary: Drizzle vendor-SDK generic variance — see `awaitableQuery`.
  return builder as TShape;
}

export function liveOrganizations(executor: Executor) {
  // boundary: Drizzle vendor-SDK generic variance. The `Executor` union
  // (`DrizzleClient | Transaction`) makes builder chains produce a union of
  // `PgAsyncSelectBase` variants. Both runtime values are equivalent for
  // `.select()` and `.query`, so we narrow to a single concrete shape for
  // builder inference downstream.
  const exec = executor as DrizzleClient;

  return {
    select<TColumns extends SelectColumns>(
      columns: TColumns,
      extraWhere?: SQL
    ): Promise<RowOf<TColumns>[]> {
      return awaitableQuery<RowOf<TColumns>[]>(
        exec
          .select(columns)
          .from(organizations)
          .where(withLivePredicate(extraWhere))
      );
    },

    selectById<TColumns extends SelectColumns>(
      columns: TColumns,
      organizationId: string
    ): Promise<RowOf<TColumns>[]> {
      return awaitableQuery<RowOf<TColumns>[]>(
        exec
          .select(columns)
          .from(organizations)
          .where(withLivePredicate(eq(organizations.id, organizationId)))
      );
    },

    /**
     * Batch lookup by id. Returns rows whose `id` is in `ids` AND that are
     * not soft-deleted. Empty `ids` short-circuits to `[]` so we don't emit
     * an `IN ()` clause Postgres would reject.
     */
    selectByIds<TColumns extends SelectColumns>(
      columns: TColumns,
      ids: readonly string[]
    ): Promise<RowOf<TColumns>[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return awaitableQuery<RowOf<TColumns>[]>(
        exec
          .select(columns)
          .from(organizations)
          .where(withLivePredicate(inArray(organizations.id, ids as string[])))
      );
    },

    selectBySlug<TColumns extends SelectColumns>(
      columns: TColumns,
      slug: string
    ): Promise<RowOf<TColumns>[]> {
      return awaitableQuery<RowOf<TColumns>[]>(
        exec
          .select(columns)
          .from(organizations)
          .where(withLivePredicate(eq(organizations.slug, slug)))
      );
    },

    /**
     * Paginated live-row read ordered by `created_at DESC`. Used by the
     * admin-server tenant list so the seam owns the tombstone filter and
     * order. Callers MUST provide a sane `limit`; this method intentionally
     * does not impose a default to keep the policy at the HTTP layer.
     */
    selectPaginated<TColumns extends SelectColumns>(
      columns: TColumns,
      limit: number,
      offset: number
    ): Promise<RowOf<TColumns>[]> {
      type PaginatedTail = {
        orderBy: (s: SQL) => {
          limit: (n: number) => {
            offset: (n: number) => Promise<RowOf<TColumns>[]>;
          };
        };
      };
      return narrowChain<PaginatedTail>(
        exec.select(columns).from(organizations).where(withLivePredicate())
      )
        .orderBy(sql`${organizations.createdAt} DESC`)
        .limit(limit)
        .offset(offset);
    },

    /**
     * Count live rows. Optionally AND-merge an extra predicate. Result is
     * narrowed from Drizzle's raw `{ count }` shape to a plain `number`.
     */
    async count(extraWhere?: SQL): Promise<number> {
      const rows = await awaitableQuery<{ value: number | string }[]>(
        exec
          .select({ value: countFn() })
          .from(organizations)
          .where(withLivePredicate(extraWhere))
      );
      const raw = rows[0]?.value ?? 0;
      return typeof raw === "number" ? raw : Number(raw);
    },

    /**
     * Existence probe by slug. Backed by the live partial-unique index on
     * `slug` so it's a single index lookup, cheaper than a full row fetch.
     */
    async existsBySlug(slug: string): Promise<boolean> {
      const rows = await awaitableQuery<{ one: number }[]>(
        exec
          .select({ one: sql<number>`1` })
          .from(organizations)
          .where(withLivePredicate(eq(organizations.slug, slug)))
          .limit(1)
      );
      return rows.length > 0;
    },

    findFirst(
      args: NonNullable<
        Parameters<Executor["query"]["organizations"]["findFirst"]>[0]
      >
    ) {
      const callerWhere = args.where;
      // `as const` preserves the `true` literal that the relational query
      // builder requires for the `{ isNull: true }` predicate shape.
      const livePredicate = { deletedAt: { isNull: true } } as const;
      const mergedWhere =
        callerWhere && typeof callerWhere === "object"
          ? { AND: [callerWhere, livePredicate] }
          : livePredicate;
      return exec.query.organizations.findFirst({
        ...args,
        where: mergedWhere,
      });
    },
  };
}

export type LiveOrganizations = ReturnType<typeof liveOrganizations>;
