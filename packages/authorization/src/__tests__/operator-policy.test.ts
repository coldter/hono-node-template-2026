import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  assertPermitted,
  OPERATOR_ACTIONS,
  OPERATOR_PERMISSIONS,
  OPERATOR_SUB_ROLES,
  type OperatorAction,
  type OperatorPrincipal,
  whereGlobalAdminRole,
} from "../operator-policy";

// Real pg table — exercises the same Column overload `inArray` resolves
// against in production. A structural mock would bypass the Column
// generic and miss type drift.
const fakeGlobalAdmins = pgTable("global_admins", {
  subRole: text("sub_role"),
});

describe("OPERATOR_PERMISSIONS matrix", () => {
  it("declares an entry for every sub-role", () => {
    for (const role of OPERATOR_SUB_ROLES) {
      expect(OPERATOR_PERMISSIONS[role]).toBeInstanceOf(Set);
    }
    expect(Object.keys(OPERATOR_PERMISSIONS).sort()).toEqual(
      [...OPERATOR_SUB_ROLES].sort()
    );
  });

  it("references only known actions across every role's set", () => {
    const known = new Set<OperatorAction>(OPERATOR_ACTIONS);
    for (const role of OPERATOR_SUB_ROLES) {
      for (const action of OPERATOR_PERMISSIONS[role]) {
        expect(known.has(action)).toBe(true);
      }
    }
  });

  it("covers every action in at least one role (no orphan actions)", () => {
    const referenced = new Set<OperatorAction>();
    for (const role of OPERATOR_SUB_ROLES) {
      for (const action of OPERATOR_PERMISSIONS[role]) {
        referenced.add(action);
      }
    }
    expect([...referenced].sort()).toEqual([...OPERATOR_ACTIONS].sort());
  });

  it("encodes spec 05 platform_admin baseline (full access)", () => {
    const platform = OPERATOR_PERMISSIONS.platform_admin;
    for (const action of OPERATOR_ACTIONS) {
      expect(platform.has(action)).toBe(true);
    }
  });

  it("restricts sso_provider.read from read_only (secret exposure guard)", () => {
    expect(OPERATOR_PERMISSIONS.read_only.has("sso_provider.read")).toBe(false);
    expect(OPERATOR_PERMISSIONS.support.has("sso_provider.read")).toBe(true);
  });

  it("blocks read_only from write actions like tenant.suspend", () => {
    expect(OPERATOR_PERMISSIONS.read_only.has("tenant.suspend")).toBe(false);
    expect(OPERATOR_PERMISSIONS.support.has("tenant.suspend")).toBe(false);
    expect(OPERATOR_PERMISSIONS.platform_admin.has("tenant.suspend")).toBe(
      true
    );
  });

  it("allows audit_log.read for platform_admin + support only", () => {
    expect(OPERATOR_PERMISSIONS.platform_admin.has("audit_log.read")).toBe(
      true
    );
    expect(OPERATOR_PERMISSIONS.support.has("audit_log.read")).toBe(true);
    expect(OPERATOR_PERMISSIONS.read_only.has("audit_log.read")).toBe(false);
  });
});

describe("assertPermitted", () => {
  const platformAdmin: OperatorPrincipal = {
    kind: "operator",
    operator: { id: "ga_1", subRole: "platform_admin" },
  };
  const support: OperatorPrincipal = {
    kind: "operator",
    operator: { id: "ga_2", subRole: "support" },
  };
  const readOnly: OperatorPrincipal = {
    kind: "operator",
    operator: { id: "ga_3", subRole: "read_only" },
  };

  it("returns null for permitted (platform_admin -> tenant.suspend)", () => {
    expect(assertPermitted(platformAdmin, "tenant.suspend")).toBeNull();
  });

  it("returns null for permitted (support -> audit_log.read)", () => {
    expect(assertPermitted(support, "audit_log.read")).toBeNull();
  });

  it("returns FORBIDDEN for denied (read_only -> tenant.suspend)", () => {
    const result = assertPermitted(readOnly, "tenant.suspend");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("FORBIDDEN");
    expect(result?.message).toContain("read_only");
    expect(result?.message).toContain("tenant.suspend");
  });

  it("returns FORBIDDEN for denied (read_only -> sso_provider.read)", () => {
    const result = assertPermitted(readOnly, "sso_provider.read");
    expect(result?.code).toBe("FORBIDDEN");
  });

  it("returns UNAUTHENTICATED when principal is null", () => {
    const result = assertPermitted(null, "tenant.list");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("UNAUTHENTICATED");
    expect(result?.message).toContain("Operator session");
  });

  it("denies any role for an action whose role-list excludes it (support -> tenant.create)", () => {
    const result = assertPermitted(support, "tenant.create");
    expect(result?.code).toBe("FORBIDDEN");
  });
});

describe("whereGlobalAdminRole", () => {
  it("returns a SQL fragment for a non-empty role list", () => {
    const fragment = whereGlobalAdminRole(fakeGlobalAdmins, [
      "platform_admin",
      "support",
    ]);
    expect(fragment).toBeDefined();
  });

  it("returns undefined for an empty sub-role list (avoids vacuous IN ())", () => {
    const fragment = whereGlobalAdminRole(fakeGlobalAdmins, []);
    expect(fragment).toBeUndefined();
  });
});
