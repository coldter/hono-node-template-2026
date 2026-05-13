/**
 * Typed factories for `OperatorPrincipal`. Shared across tenants/enroll
 * route tests so each subRole is constructed in exactly one place and the
 * production type drives test data, not vice-versa.
 *
 * The fixtures intentionally re-use `OperatorPrincipal` from `@/lib/context`
 * — when a new field is added to the principal envelope, the compiler flags
 * the factory rather than silently letting tests drift.
 */

import type { OperatorSubRole } from "@repo/authorization";
import type { OperatorPrincipal } from "@/lib/context";

type OperatorOverrides = Partial<OperatorPrincipal["operator"]>;

/**
 * Construct an `OperatorPrincipal` with the given sub-role. Defaults reflect
 * a deterministic id/email pair so assertions can match exactly.
 */
export function buildOperatorPrincipal(
  subRole: OperatorSubRole,
  overrides?: OperatorOverrides
): OperatorPrincipal {
  return {
    kind: "operator",
    operator: {
      id: `gadmin_${subRole}`,
      subRole,
      email: `${subRole}@example.com`,
      ...overrides,
    },
  };
}

/** Pre-built platform_admin principal. Permitted for write operations. */
export const platformAdmin: OperatorPrincipal = buildOperatorPrincipal(
  "platform_admin",
  { id: "gadmin_1", email: "op@example.com" }
);

/** Pre-built read_only principal. Should be denied write operations. */
export const readOnly: OperatorPrincipal = buildOperatorPrincipal("read_only", {
  id: "gadmin_2",
  email: "ro@example.com",
});
