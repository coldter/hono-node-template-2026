/**
 * Read-side projection helpers for the operator-facing tenant CRUD.
 *
 * `READ_COLUMNS` is the canonical column-projection passed to
 * `liveOrganizations(db).select*` so each handler returns the same shape.
 * `serializeRow` turns the drizzle row (Dates, nullable slug) into the
 * JSON shape the wire schema expects (ISO strings, slug nullable
 * preserved).
 *
 * These lived inline in `apps/admin-server/src/modules/tenants/routes.ts`
 * — promoting them next to the lifecycle writer keeps every code path
 * that reads from `organizations` for an operator perimeter in one
 * vocabulary. If a future column needs the operator-visible projection,
 * it's added once here and every reader picks it up.
 */

import { organizations } from "@repo/db/schema";

export const READ_COLUMNS = {
  id: organizations.id,
  slug: organizations.slug,
  name: organizations.name,
  enforceSSO: organizations.enforceSSO,
  sessionVersion: organizations.sessionVersion,
  suspendedAt: organizations.suspendedAt,
  deletedAt: organizations.deletedAt,
  createdAt: organizations.createdAt,
} as const;

/**
 * Drizzle-row shape returned when `READ_COLUMNS` is the selection. Mirrors
 * the projection above 1:1; declared explicitly (not inferred) so a column
 * rename in `READ_COLUMNS` forces a paired update here and any consumer
 * shape-matching against `OrgSelection` fails to compile until reconciled.
 */
export type OrgSelection = Readonly<{
  id: string;
  slug: string | null;
  name: string;
  enforceSSO: boolean;
  sessionVersion: number;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}>;

/**
 * JSON projection of `OrgSelection` for `/api/admin/orgs/*` responses. The
 * wire schema lives in the admin-server (`schema.ts`); this helper
 * produces a value that satisfies it. Dates are emitted as ISO strings;
 * `slug` is forwarded as-is (operator readers see the original — only
 * `liveOrganizations` enforces the live-row predicate, not the slug).
 */
export type SerializedOrgRow = Readonly<{
  id: string;
  slug: string | null;
  name: string;
  enforceSSO: boolean;
  sessionVersion: number;
  suspendedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}>;

export function serializeRow(row: OrgSelection): SerializedOrgRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    enforceSSO: row.enforceSSO,
    sessionVersion: row.sessionVersion,
    suspendedAt: row.suspendedAt ? row.suspendedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
