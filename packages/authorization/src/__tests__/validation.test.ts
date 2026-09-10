import { describe, expect, it } from "vitest";
import { createOrgRoleCondition } from "../conditions";
import type { AnyResourceDef } from "../schema";
import { createAuthSchema } from "../schema";
import type { Condition, PolicyRule } from "../types";
import { validateRegistry } from "../validation";

const KEY_MISMATCH_PATTERN = /does not match resource name/i;
const ORG_ROLE_WITHOUT_RESOLVE_PATTERN =
  /uses withOrgRole.*but resolveOrganization is not defined/i;
const UNKNOWN_ROLE_PATTERN = /references role "ghost" not in schema/i;
const UNKNOWN_ORG_ROLE_PATTERN = /references org role "ghost" not in schema/i;
const UNKNOWN_ACTION_PATTERN =
  /references action "fly" not in resource actions/i;
const UNKNOWN_SYSTEM_ADMIN_PATTERN =
  /systemAdminRoles references role "ghost" not in schema/i;
const GLOBAL_ALLOW_PATTERN = /must use deny\(\)/i;
const NO_ACTIONS_PATTERN = /has no actions/i;
const NO_ROLES_PATTERN = /has no roles/i;
const GLOBAL_RESOURCE_CONDITION_PATTERN = /uses a resource condition/i;
const NO_ORG_ROLES_PATTERN = /uses withOrgRole\(\) with no org roles/i;

type ValidateOptions = Parameters<typeof validateRegistry>[1];

function options(overrides: Partial<ValidateOptions> = {}): ValidateOptions {
  return {
    globalPolicies: [],
    orgRoleValues: [],
    schemaRoles: ["admin", "user"],
    systemAdminRoles: [],
    ...overrides,
  };
}

function policy(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    actions: ["read"],
    conditions: [],
    effect: "allow",
    label: "allow:user:read",
    roles: ["user"],
    ...overrides,
  };
}

function docResource(overrides: Partial<AnyResourceDef> = {}): AnyResourceDef {
  return {
    actions: ["read"],
    name: "doc",
    policies: [],
    ...overrides,
  };
}

describe("validateRegistry", () => {
  it("throws when registry key does not match resource name", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    const res = auth.createResource<{ id: string }>()("user", {
      actions: ["list"],
      policies: (p) => [p.allow("admin").to("list")],
    });

    expect(() => auth.buildRegistry({ wrong_key: res })).toThrow(
      KEY_MISMATCH_PATTERN
    );
  });

  it("throws when a policy references a role not in the schema", () => {
    const res = docResource({ policies: [policy({ roles: ["ghost"] })] });

    expect(() => validateRegistry({ doc: res }, options())).toThrow(
      UNKNOWN_ROLE_PATTERN
    );
  });

  it("does not throw when policy roles are wildcard", () => {
    const res = docResource({
      policies: [policy({ actions: "*", effect: "deny", roles: "*" })],
    });

    expect(() =>
      validateRegistry({ doc: res }, options({ schemaRoles: ["admin"] }))
    ).not.toThrow();
  });

  it("throws when a policy action is not declared on the resource", () => {
    const res = docResource({
      policies: [policy({ actions: ["fly"], label: "allow:user:fly" })],
    });

    expect(() =>
      validateRegistry({ doc: res }, options({ schemaRoles: ["user"] }))
    ).toThrow(UNKNOWN_ACTION_PATTERN);
  });

  it("throws when a resource policy has no actions", () => {
    const res = docResource({ policies: [policy({ actions: [] })] });

    expect(() =>
      validateRegistry({ doc: res }, options({ schemaRoles: ["user"] }))
    ).toThrow(NO_ACTIONS_PATTERN);
  });

  it("throws when a resource policy has no roles", () => {
    const res = docResource({ policies: [policy({ roles: [] })] });

    expect(() =>
      validateRegistry({ doc: res }, options({ schemaRoles: ["user"] }))
    ).toThrow(NO_ROLES_PATTERN);
  });

  it("throws when a global policy allows instead of denies", () => {
    expect(() =>
      validateRegistry(
        {},
        options({ globalPolicies: [policy({ effect: "allow", roles: "*" })] })
      )
    ).toThrow(GLOBAL_ALLOW_PATTERN);
  });

  it("throws when a global policy has no actions", () => {
    expect(() =>
      validateRegistry(
        {},
        options({
          globalPolicies: [policy({ actions: [], effect: "deny", roles: "*" })],
        })
      )
    ).toThrow(NO_ACTIONS_PATTERN);
  });

  it("throws when a global policy has no roles", () => {
    expect(() =>
      validateRegistry(
        {},
        options({
          globalPolicies: [policy({ actions: "*", effect: "deny", roles: [] })],
        })
      )
    ).toThrow(NO_ROLES_PATTERN);
  });

  it("throws when a global policy uses a requires_resource condition", () => {
    const resourceCondition: Condition = {
      effect: "requires_resource",
      evaluate: () => true,
      label: "whereOwner",
      type: "whereOwner",
    };

    expect(() =>
      validateRegistry(
        {},
        options({
          globalPolicies: [
            policy({
              actions: "*",
              conditions: [resourceCondition],
              effect: "deny",
              roles: "*",
            }),
          ],
        })
      )
    ).toThrow(GLOBAL_RESOURCE_CONDITION_PATTERN);
  });

  it("throws when systemAdminRoles references a role not in schema", () => {
    expect(() =>
      validateRegistry({}, options({ systemAdminRoles: ["ghost"] }))
    ).toThrow(UNKNOWN_SYSTEM_ADMIN_PATTERN);
  });

  it("throws when withOrgRole references an org role not in the schema", () => {
    const badOrgRole = createOrgRoleCondition(["ghost"]);
    const res = docResource({
      policies: [
        policy({
          conditions: [badOrgRole],
          label: "allow:user:read:withOrgRole:ghost",
        }),
      ],
      resolveOrganization: () => "org_1",
    });

    expect(() =>
      validateRegistry(
        { doc: res },
        options({
          orgRoleValues: ["owner", "admin", "member"],
          schemaRoles: ["user"],
        })
      )
    ).toThrow(UNKNOWN_ORG_ROLE_PATTERN);
  });

  it("throws when withOrgRole has an empty org role list", () => {
    const emptyOrgRoleCondition: Condition = {
      effect: "principal_only",
      evaluate: () => true,
      label: "withOrgRole:",
      params: { orgRoles: [] },
      type: "withOrgRole",
    };
    const res = docResource({
      policies: [policy({ conditions: [emptyOrgRoleCondition] })],
      resolveOrganization: () => "org_1",
    });

    expect(() =>
      validateRegistry(
        { doc: res },
        options({ orgRoleValues: ["owner"], schemaRoles: ["user"] })
      )
    ).toThrow(NO_ORG_ROLES_PATTERN);
  });

  it("throws when withOrgRole has no org role params", () => {
    const missingParamsCondition: Condition = {
      effect: "principal_only",
      evaluate: () => true,
      label: "withOrgRole:",
      type: "withOrgRole",
    };
    const res = docResource({
      policies: [policy({ conditions: [missingParamsCondition] })],
      resolveOrganization: () => "org_1",
    });

    expect(() =>
      validateRegistry(
        { doc: res },
        options({ orgRoleValues: ["owner"], schemaRoles: ["user"] })
      )
    ).toThrow(NO_ORG_ROLES_PATTERN);
  });

  it("throws when a resource uses withOrgRole but lacks resolveOrganization", () => {
    const orgRoleCondition = createOrgRoleCondition(["owner"]);
    const res = docResource({
      policies: [
        policy({
          conditions: [orgRoleCondition],
          label: "allow:user:read:withOrgRole:owner",
        }),
      ],
    });

    expect(() =>
      validateRegistry(
        { doc: res },
        options({ orgRoleValues: ["owner"], schemaRoles: ["user"] })
      )
    ).toThrow(ORG_ROLE_WITHOUT_RESOLVE_PATTERN);
  });

  it("does not throw when withOrgRole is paired with resolveOrganization", () => {
    const orgRoleCondition = createOrgRoleCondition(["owner"]);
    const res = docResource({
      policies: [
        policy({
          conditions: [orgRoleCondition],
          label: "allow:user:read:withOrgRole:owner",
        }),
      ],
      resolveOrganization: () => "org_1",
    });

    expect(() =>
      validateRegistry(
        { doc: res },
        options({ orgRoleValues: ["owner"], schemaRoles: ["user"] })
      )
    ).not.toThrow();
  });
});
