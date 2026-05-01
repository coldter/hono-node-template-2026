import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  createAuthSchema,
  principalAttribute,
  principalNotActive,
} from "../index";
import type { Principal } from "../types";

describe("integration: single-tenant", () => {
  const auth = createAuthSchema({
    roles: ["admin", "user"],
    systemAdminRoles: ["admin"],
    relations: [],
    principal: {
      status: principalAttribute<"active" | "inactive">(),
      email: principalAttribute<string>(),
    },
    globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
  });

  interface UserResource {
    createdBy: string;
    email: string;
    id: string;
  }

  const userResource = auth.createResource<UserResource>("user", {
    actions: ["list", "view", "create", "update", "delete", "deactivate"],
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("user").to("list"),
      p.allow("user").to("view", "update").whereOwner(),
      p.deny("*").to("delete").whereTargetIsSelf(),
      p.deny("*").to("deactivate").whereTargetIsSelf(),
    ],
    resolveOwner: (r) => r.createdBy,
  });

  const registry = auth.buildRegistry({ user: userResource });

  const admin: Principal = {
    id: "usr_admin",
    roles: ["admin"],
    attributes: { status: "active", email: "admin@test.com" },
  };

  const user1: Principal = {
    id: "usr_1",
    roles: ["user"],
    attributes: { status: "active", email: "user1@test.com" },
  };

  const inactiveUser: Principal = {
    id: "usr_inactive",
    roles: ["user"],
    attributes: { status: "inactive", email: "inactive@test.com" },
  };

  // Test 1: Admin can do everything
  it("admin can do everything", async () => {
    const actions = ["list", "view", "create", "update", "deactivate"];
    for (const action of actions) {
      const decision = await registry.can(admin, "user", action, {
        resource: {
          id: "usr_other",
          createdBy: "usr_other",
          email: "other@test.com",
        },
      });
      expect(decision.allowed).toBe(true);
    }
  });

  // Test 2: User can list but not delete
  it("user can list but not delete", async () => {
    const listDecision = await registry.can(user1, "user", "list");
    expect(listDecision.allowed).toBe(true);

    const deleteDecision = await registry.can(user1, "user", "delete", {
      resource: { id: "usr_other", createdBy: "usr_other", email: "o@t.com" },
    });
    expect(deleteDecision.allowed).toBe(false);
    if (!deleteDecision.allowed) {
      expect(deleteDecision.reason).toBe("NO_MATCHING_POLICY");
    }
  });

  // Test 3: User can view/update own profile (ownership)
  it("user can view and update own profile via ownership", async () => {
    const ownResource: UserResource = {
      id: "res_1",
      createdBy: "usr_1",
      email: "user1@test.com",
    };

    const viewDecision = await registry.can(user1, "user", "view", {
      resource: ownResource,
    });
    expect(viewDecision.allowed).toBe(true);

    const updateDecision = await registry.can(user1, "user", "update", {
      resource: ownResource,
    });
    expect(updateDecision.allowed).toBe(true);
  });

  it("user cannot view or update another's profile", async () => {
    const otherResource: UserResource = {
      id: "res_other",
      createdBy: "usr_other",
      email: "other@test.com",
    };

    const viewDecision = await registry.can(user1, "user", "view", {
      resource: otherResource,
    });
    expect(viewDecision.allowed).toBe(false);

    const updateDecision = await registry.can(user1, "user", "update", {
      resource: otherResource,
    });
    expect(updateDecision.allowed).toBe(false);
  });

  // Test 4: User cannot delete themselves (deny via whereTargetIsSelf)
  it("user cannot delete themselves (deny with whereTargetIsSelf)", async () => {
    // Admin deleting themselves should also be denied
    const selfResource: UserResource = {
      id: "usr_admin",
      createdBy: "usr_admin",
      email: "admin@test.com",
    };

    const decision = await registry.can(admin, "user", "delete", {
      resource: selfResource,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("EXPLICIT_DENY");
    }
  });

  it("user cannot deactivate themselves (deny with whereTargetIsSelf)", async () => {
    const selfResource: UserResource = {
      id: "usr_1",
      createdBy: "usr_1",
      email: "user1@test.com",
    };

    const decision = await registry.can(user1, "user", "deactivate", {
      resource: selfResource,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("EXPLICIT_DENY");
    }
  });

  // Test 5: Inactive user denied by global policy
  it("inactive user is denied by global policy", async () => {
    const decision = await registry.can(inactiveUser, "user", "list");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("GLOBAL_DENY");
    }
  });

  it("inactive user is denied even for owned resources", async () => {
    const ownResource: UserResource = {
      id: "res_1",
      createdBy: "usr_inactive",
      email: "inactive@test.com",
    };

    const decision = await registry.can(inactiveUser, "user", "view", {
      resource: ownResource,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("GLOBAL_DENY");
    }
  });

  // Test 6: Unknown role is denied (no matching policy)
  it("unknown role is denied due to no matching policy", async () => {
    const unknownRolePrincipal: Principal = {
      id: "usr_unknown",
      roles: ["unknown_role" as string],
      attributes: { status: "active", email: "unknown@test.com" },
    };

    const decision = await registry.can(unknownRolePrincipal, "user", "list");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("NO_MATCHING_POLICY");
    }
  });

  // Test 7: evaluateCapabilities returns correct map for admin
  it("evaluateCapabilities returns all true for admin", async () => {
    const caps = await registry.evaluateCapabilities(admin);
    expect(caps["user:list"]).toBe(true);
    expect(caps["user:view"]).toBe(true);
    expect(caps["user:create"]).toBe(true);
    expect(caps["user:update"]).toBe(true);
    expect(caps["user:delete"]).toBe(true);
    expect(caps["user:deactivate"]).toBe(true);
  });

  // Test 8: evaluateCapabilities returns correct map for user
  it("evaluateCapabilities returns correct map for user", async () => {
    const caps = await registry.evaluateCapabilities(user1);
    expect(caps["user:list"]).toBe(true);
    // create has no allow for user role
    expect(caps["user:create"]).toBe(false);
    // delete has no allow for user role (even though deny for self exists)
    expect(caps["user:delete"]).toBe(false);
    // deactivate has no allow for user role
    expect(caps["user:deactivate"]).toBe(false);
  });

  // Test 9: evaluateCapabilities reports true for conditionally-allowed actions (whereOwner)
  it("evaluateCapabilities reports true for conditionally-allowed actions (whereOwner)", async () => {
    const caps = await registry.evaluateCapabilities(user1);
    // view and update are allowed via whereOwner -- ignoreResourceConditions makes them true
    expect(caps["user:view"]).toBe(true);
    expect(caps["user:update"]).toBe(true);
  });

  // Test 14: AuthorizationError is thrown by assertCan on deny
  it("assertCan throws AuthorizationError on deny", async () => {
    await expect(registry.assertCan(user1, "user", "create")).rejects.toThrow(
      AuthorizationError
    );
  });

  it("assertCan throws AuthorizationError with correct reason", async () => {
    await expect(
      registry.assertCan(user1, "user", "create")
    ).rejects.toMatchObject({ reason: "NO_MATCHING_POLICY" });
  });

  it("assertCan does not throw on allow", async () => {
    await expect(
      registry.assertCan(admin, "user", "list")
    ).resolves.toBeUndefined();
  });

  // Test 15: can().allowed reports the same boolean information that the
  // removed isAllowed/isDenied helpers used to expose.
  it("can() returns allowed=true for permitted actions", async () => {
    expect((await registry.can(admin, "user", "list")).allowed).toBe(true);
    expect((await registry.can(user1, "user", "list")).allowed).toBe(true);
    expect((await registry.can(user1, "user", "create")).allowed).toBe(false);
    expect((await registry.can(inactiveUser, "user", "list")).allowed).toBe(
      false
    );
  });

  it("can() returns allowed=false (denial) for unauthorised actions", async () => {
    expect((await registry.can(admin, "user", "list")).allowed).toBe(true);
    expect((await registry.can(user1, "user", "list")).allowed).toBe(true);
    expect((await registry.can(user1, "user", "create")).allowed).toBe(false);
    expect((await registry.can(inactiveUser, "user", "list")).allowed).toBe(
      false
    );
  });
});

describe("integration: multi-tenant", () => {
  const auth = createAuthSchema({
    roles: ["admin", "member"],
    systemAdminRoles: ["admin"],
    relations: [],
    organizationRoles: ["owner", "admin", "member"],
    principal: {
      status: principalAttribute<"active" | "inactive">(),
    },
    globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
  });

  interface ProjectResource {
    createdBy: string;
    id: string;
    organizationId: string;
  }

  const projectResource = auth.createResource<ProjectResource>("project", {
    actions: ["list", "view", "create", "update", "delete"],
    resolveOrganization: (r) => r.organizationId,
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("member").to("list", "view").withOrgRole("member"),
      p.allow("member").to("*").withOrgRole("owner", "admin"),
      p.allow("member").to("update").whereOwner(),
    ],
    resolveOwner: (r) => r.createdBy,
  });

  const registry = auth.buildRegistry({ project: projectResource });

  // Org-context principal (org_1, role: member)
  const orgMember: Principal = {
    id: "usr_org_member",
    roles: ["member"],
    attributes: { status: "active" },
    organization: { id: "org_1", role: "member" },
  } as unknown as Principal;

  const orgOwner: Principal = {
    id: "usr_org_owner",
    roles: ["member"],
    attributes: { status: "active" },
    organization: { id: "org_1", role: "owner" },
  } as unknown as Principal;

  const sysAdmin: Principal = {
    id: "usr_sys_admin",
    roles: ["admin"],
    attributes: { status: "active" },
  };

  const noOrgUser: Principal = {
    id: "usr_no_org",
    roles: ["member"],
    attributes: { status: "active" },
  };

  const project1: ProjectResource = {
    id: "proj_1",
    createdBy: "usr_org_member",
    organizationId: "org_1",
  };

  const projectOtherOrg: ProjectResource = {
    id: "proj_2",
    createdBy: "usr_other",
    organizationId: "org_2",
  };

  // Test 10: Org-scoped resource: user in matching org -> ALLOW
  it("org member in matching org can list project", async () => {
    const decision = await registry.can(orgMember, "project", "list", {
      resource: project1,
    });
    expect(decision.allowed).toBe(true);
  });

  it("org member in matching org can view project", async () => {
    const decision = await registry.can(orgMember, "project", "view", {
      resource: project1,
    });
    expect(decision.allowed).toBe(true);
  });

  it("org owner in matching org can delete project", async () => {
    const decision = await registry.can(orgOwner, "project", "delete", {
      resource: project1,
    });
    expect(decision.allowed).toBe(true);
  });

  // Test 11: Org-scoped resource: user in wrong org -> DENY
  it("org member in wrong org is denied", async () => {
    const decision = await registry.can(orgMember, "project", "list", {
      resource: projectOtherOrg,
    });
    expect(decision.allowed).toBe(false);
  });

  it("org owner in wrong org is denied", async () => {
    const decision = await registry.can(orgOwner, "project", "delete", {
      resource: projectOtherOrg,
    });
    expect(decision.allowed).toBe(false);
  });

  // Test 12: Org-scoped resource: no active org -> DENY
  it("user with no org context is denied for org-scoped resource", async () => {
    const decision = await registry.can(noOrgUser, "project", "list", {
      resource: project1,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("ORG_CONTEXT_MISSING");
    }
  });

  it("user with no org context is denied for all org-scoped actions", async () => {
    for (const action of ["list", "view", "create", "update", "delete"]) {
      const decision = await registry.can(noOrgUser, "project", action, {
        resource: project1,
      });
      expect(decision.allowed).toBe(false);
    }
  });

  // Test 13: Org-scoped resource: system admin bypasses org check
  it("system admin bypasses org check and can access any org resource", async () => {
    // sysAdmin has no org context but is a system admin role
    const decision = await registry.can(sysAdmin, "project", "delete", {
      resource: project1,
    });
    expect(decision.allowed).toBe(true);
  });

  it("system admin bypasses org check for cross-org resource", async () => {
    const decision = await registry.can(sysAdmin, "project", "delete", {
      resource: projectOtherOrg,
    });
    expect(decision.allowed).toBe(true);
  });

  it("system admin can perform all actions without org context", async () => {
    for (const action of ["list", "view", "create", "update", "delete"]) {
      const decision = await registry.can(sysAdmin, "project", action, {
        resource: project1,
      });
      expect(decision.allowed).toBe(true);
    }
  });
});
