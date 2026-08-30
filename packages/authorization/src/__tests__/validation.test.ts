import { describe, expect, it } from "vitest";
import { createOrgRoleCondition, createRelationCondition } from "../conditions";
import type { AnyResourceDef } from "../schema";
import { createAuthSchema, principalAttribute } from "../schema";
import type { PolicyRule } from "../types";
import { validateRegistry } from "../validation";

const KEY_MISMATCH_PATTERN = /does not match resource name/i;
const ORG_ROLE_WITHOUT_RESOLVE_PATTERN =
  /uses withOrgRole.* but resolveOrganization is not defined/i;
const UNKNOWN_ROLE_PATTERN = /references role "ghost" not in schema/i;
const UNKNOWN_RELATION_PATTERN = /references relation "ghost" not in schema/i;
const UNKNOWN_ORG_ROLE_PATTERN = /references org role "ghost" not in schema/i;

describe("validateRegistry", () => {
  it("throws when registry key does not match resource name", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      principal: { status: principalAttribute<string>() },
      relations: [],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    const res = auth.createResource<{ id: string }>("user", {
      actions: ["list"],
      policies: (p) => [p.allow("admin").to("list")],
    });

    expect(() => auth.buildRegistry({ wrong_key: res })).toThrow(
      KEY_MISMATCH_PATTERN
    );
  });

  it("throws when a policy references a role not in the schema", () => {
    const policy: PolicyRule = {
      actions: ["read"],
      conditions: [],
      effect: "allow",
      label: "allow:ghost:read",
      roles: ["ghost"],
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
    };

    expect(() =>
      validateRegistry({ doc: res }, ["admin", "user"], [], [])
    ).toThrow(UNKNOWN_ROLE_PATTERN);
  });

  it("does not throw when policy roles are wildcard", () => {
    const policy: PolicyRule = {
      actions: "*",
      conditions: [],
      effect: "deny",
      label: "deny:*:*",
      roles: "*",
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
    };

    expect(() =>
      validateRegistry({ doc: res }, ["admin"], [], [])
    ).not.toThrow();
  });

  it("throws when withRelation references a relation not in the schema", () => {
    const badRelation = createRelationCondition<{ id: string }>(
      "ghost",
      "doc",
      (r) => r.id
    );
    const policy: PolicyRule = {
      actions: ["read"],
      conditions: [badRelation],
      effect: "allow",
      label: "allow:user:read:withRelation:ghost:doc",
      roles: ["user"],
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
    };

    expect(() =>
      validateRegistry({ doc: res }, ["user"], ["owner", "member"], [])
    ).toThrow(UNKNOWN_RELATION_PATTERN);
  });

  it("throws when withOrgRole references an org role not in the schema", () => {
    const badOrgRole = createOrgRoleCondition(["ghost"]);
    const policy: PolicyRule = {
      actions: ["read"],
      conditions: [badOrgRole],
      effect: "allow",
      label: "allow:user:read:withOrgRole:ghost",
      roles: ["user"],
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
      resolveOrganization: () => "org_1",
    };

    expect(() =>
      validateRegistry({ doc: res }, ["user"], [], ["owner", "admin", "member"])
    ).toThrow(UNKNOWN_ORG_ROLE_PATTERN);
  });

  it("throws when a resource uses withOrgRole but lacks resolveOrganization", () => {
    const orgRoleCondition = createOrgRoleCondition(["owner"]);
    const policy: PolicyRule = {
      actions: ["read"],
      conditions: [orgRoleCondition],
      effect: "allow",
      label: "allow:user:read:withOrgRole:owner",
      roles: ["user"],
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
      // resolveOrganization intentionally omitted
    };

    expect(() =>
      validateRegistry({ doc: res }, ["user"], [], ["owner"])
    ).toThrow(ORG_ROLE_WITHOUT_RESOLVE_PATTERN);
  });

  it("does not throw when withOrgRole is paired with resolveOrganization", () => {
    const orgRoleCondition = createOrgRoleCondition(["owner"]);
    const policy: PolicyRule = {
      actions: ["read"],
      conditions: [orgRoleCondition],
      effect: "allow",
      label: "allow:user:read:withOrgRole:owner",
      roles: ["user"],
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
      resolveOrganization: () => "org_1",
    };

    expect(() =>
      validateRegistry({ doc: res }, ["user"], [], ["owner"])
    ).not.toThrow();
  });

  it("skips relation validation when schemaRelations is empty", () => {
    const relationCondition = createRelationCondition<{ id: string }>(
      "any",
      "doc",
      (r) => r.id
    );
    const policy: PolicyRule = {
      actions: ["read"],
      conditions: [relationCondition],
      effect: "allow",
      label: "allow:user:read:withRelation:any:doc",
      roles: ["user"],
    };
    const res: AnyResourceDef = {
      actions: ["read"],
      name: "doc",
      policies: [policy],
    };

    expect(() =>
      validateRegistry({ doc: res }, ["user"], [], [])
    ).not.toThrow();
  });
});
