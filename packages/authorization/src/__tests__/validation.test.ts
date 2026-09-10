import { describe, expect, it } from "vitest";
import { createOrgRoleCondition } from "../conditions";
import { PolicyBuilder } from "../resource";
import type { AnyResourceDef } from "../schema";
import { createAuthSchema } from "../schema";
import type { Condition, PolicyRule } from "../types";
import { validateRegistry } from "../validation";

const GLOBAL_ALLOW_PATTERN = /must use deny\(\)/i;
const NO_ACTIONS_PATTERN = /has no actions/i;
const NO_ROLES_PATTERN = /has no roles/i;
const GLOBAL_RESOURCE_CONDITION_PATTERN = /uses a resource condition/i;
const UNKNOWN_ROLE_PATTERN = /references role "ghost" not in schema/i;
const UNKNOWN_ACTION_PATTERN =
  /references action "fly" not in resource actions/i;
const KEY_MISMATCH_PATTERN = /does not match resource name/i;
const UNKNOWN_SYSTEM_ADMIN_PATTERN =
  /systemAdminRoles references role "ghost" not in schema/i;
const UNKNOWN_ORG_ROLE_PATTERN = /references org role "ghost" not in schema/i;
const NO_ORG_ROLES_PATTERN = /uses withOrgRole\(\) with no org roles/i;
const ORG_ROLE_WITHOUT_RESOLVE_PATTERN =
  /uses withOrgRole.*but resolveOrganization is not defined/i;
const AT_LEAST_ONE_ACTION_PATTERN = /at least one action/i;
const CANNOT_MIX_WILDCARD_PATTERN = /cannot mix the wildcard/i;
const UNKNOWN_BUILDER_ORG_ROLE_PATTERN = /not in schema/i;
const RESOLVE_OWNER_REQUIRED_PATTERN = /requires resolveOwner/i;

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
  it("rejects global policies that allow, omit actions or roles, or use resource conditions", () => {
    expect(() =>
      validateRegistry(
        {},
        options({ globalPolicies: [policy({ effect: "allow", roles: "*" })] })
      )
    ).toThrow(GLOBAL_ALLOW_PATTERN);

    expect(() =>
      validateRegistry(
        {},
        options({
          globalPolicies: [policy({ actions: [], effect: "deny", roles: "*" })],
        })
      )
    ).toThrow(NO_ACTIONS_PATTERN);

    expect(() =>
      validateRegistry(
        {},
        options({
          globalPolicies: [policy({ actions: "*", effect: "deny", roles: [] })],
        })
      )
    ).toThrow(NO_ROLES_PATTERN);

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

  it("rejects resource policies with unknown roles or actions and empty lists", () => {
    expect(() =>
      validateRegistry(
        { doc: docResource({ policies: [policy({ roles: ["ghost"] })] }) },
        options()
      )
    ).toThrow(UNKNOWN_ROLE_PATTERN);

    expect(() =>
      validateRegistry(
        {
          doc: docResource({
            policies: [policy({ actions: ["fly"], label: "allow:user:fly" })],
          }),
        },
        options({ schemaRoles: ["user"] })
      )
    ).toThrow(UNKNOWN_ACTION_PATTERN);

    expect(() =>
      validateRegistry(
        { doc: docResource({ policies: [policy({ actions: [] })] }) },
        options({ schemaRoles: ["user"] })
      )
    ).toThrow(NO_ACTIONS_PATTERN);

    expect(() =>
      validateRegistry(
        { doc: docResource({ policies: [policy({ roles: [] })] }) },
        options({ schemaRoles: ["user"] })
      )
    ).toThrow(NO_ROLES_PATTERN);
  });

  it("rejects registry key mismatches and unknown system admin roles", () => {
    const auth = createAuthSchema({
      globalPolicies: () => [],
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });
    const resource = auth.createResource<{ id: string }>()("user", {
      actions: ["list"],
      policies: (p) => [p.allow("admin").to("list")],
    });

    expect(() => auth.buildRegistry({ wrong_key: resource })).toThrow(
      KEY_MISMATCH_PATTERN
    );

    expect(() =>
      validateRegistry({}, options({ systemAdminRoles: ["ghost"] }))
    ).toThrow(UNKNOWN_SYSTEM_ADMIN_PATTERN);
  });

  it("validates org-role conditions and requires resolveOrganization", () => {
    const unknownOrgRole = docResource({
      policies: [
        policy({
          conditions: [createOrgRoleCondition(["ghost"])],
          label: "allow:user:read:withOrgRole:ghost",
        }),
      ],
      resolveOrganization: () => "org_1",
    });
    expect(() =>
      validateRegistry(
        { doc: unknownOrgRole },
        options({
          orgRoleValues: ["owner", "admin", "member"],
          schemaRoles: ["user"],
        })
      )
    ).toThrow(UNKNOWN_ORG_ROLE_PATTERN);

    const emptyOrgRole: Condition = {
      effect: "principal_only",
      evaluate: () => true,
      label: "withOrgRole:",
      params: { orgRoles: [] },
      type: "withOrgRole",
    };
    const noOrgRoles = docResource({
      policies: [policy({ conditions: [emptyOrgRole] })],
      resolveOrganization: () => "org_1",
    });
    expect(() =>
      validateRegistry(
        { doc: noOrgRoles },
        options({ orgRoleValues: ["owner"], schemaRoles: ["user"] })
      )
    ).toThrow(NO_ORG_ROLES_PATTERN);

    const missingResolver = docResource({
      policies: [
        policy({
          conditions: [createOrgRoleCondition(["owner"])],
          label: "allow:user:read:withOrgRole:owner",
        }),
      ],
    });
    expect(() =>
      validateRegistry(
        { doc: missingResolver },
        options({ orgRoleValues: ["owner"], schemaRoles: ["user"] })
      )
    ).toThrow(ORG_ROLE_WITHOUT_RESOLVE_PATTERN);
  });
});

describe("PolicyBuilder guards", () => {
  it("rejects missing actions, wildcard mixing, missing owners, and unknown org roles", () => {
    const builder = new PolicyBuilder<
      { id: string },
      "admin" | "user",
      "org_owner",
      "list" | "view"
    >({
      resolveOwner: (resource) => resource.id,
      validOrgRoles: ["org_owner"],
    });

    expect(() => {
      // @ts-expect-error
      builder.allow("user").to();
    }).toThrow(AT_LEAST_ONE_ACTION_PATTERN);

    expect(() => {
      // @ts-expect-error
      builder.allow("user").to("*", "view");
    }).toThrow(CANNOT_MIX_WILDCARD_PATTERN);

    expect(() =>
      builder
        .allow("user")
        .to("view")
        .withOrgRole("ghost" as "org_owner")
    ).toThrow(UNKNOWN_BUILDER_ORG_ROLE_PATTERN);

    const withoutOwner = new PolicyBuilder<
      { id: string },
      "user",
      "org_owner",
      "view"
    >({});
    expect(() => withoutOwner.allow("user").to("view").whereOwner()).toThrow(
      RESOLVE_OWNER_REQUIRED_PATTERN
    );
  });
});
