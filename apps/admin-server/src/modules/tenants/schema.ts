/**
 * Wire schemas for the operator-facing tenant CRUD endpoints. The lifecycle
 * itself (state-machine, audit emission, cache invalidation) lives in
 * `@repo/tenant-operations`; this module only describes the JSON shapes the
 * admin UI exchanges with `/api/admin/orgs/*`.
 *
 * `branding` and `enforceSSO` are accepted but treated as future-extension
 * slots: the current lifecycle writer ignores branding (column has a default)
 * and forwards `enforceSSO` verbatim. Wire-level validation lives here so a
 * malformed payload fails before the writer transaction opens.
 */

import { z } from "zod";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const brandingSchema = z.object({
  logoVersion: z.number().int().nonnegative(),
  primaryColor: z.string().min(1),
  appName: z.string().min(1),
});

export const createTenantBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(SLUG_RE, "slug must be kebab-case alphanumerics"),
  name: z.string().min(1).max(120).optional(),
  enforceSSO: z.boolean().optional(),
  branding: brandingSchema.optional(),
});
export type CreateTenantBody = z.infer<typeof createTenantBody>;

export const suspendTenantBody = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .optional();
export type SuspendTenantBody = z.infer<typeof suspendTenantBody>;

export const restoreTenantBody = z.object({}).optional();
export type RestoreTenantBody = z.infer<typeof restoreTenantBody>;

// Soft-delete is destructive and forward-only. The explicit `confirm` flag
// is the wire-level guard against an accidental call from a misclicked UI.
export const softDeleteTenantBody = z.object({
  confirm: z.literal(true),
});
export type SoftDeleteTenantBody = z.infer<typeof softDeleteTenantBody>;

export const tenantRow = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  name: z.string(),
  enforceSSO: z.boolean(),
  sessionVersion: z.number().int().nonnegative(),
  suspendedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TenantRow = z.infer<typeof tenantRow>;

export const listTenantsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuery>;

export const listTenantsResponse = z.object({
  rows: z.array(tenantRow),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type ListTenantsResponse = z.infer<typeof listTenantsResponse>;

export const tenantIdParam = z.object({
  id: z.string().min(1),
});
export type TenantIdParam = z.infer<typeof tenantIdParam>;
