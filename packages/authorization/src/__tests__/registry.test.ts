import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { AuthorizationError } from "../errors";
import { createAuthSchema } from "../schema";
import type { Principal } from "../types";

const auth = createAuthSchema({
  globalPolicies: (p) => [
    p.deny("*").to("*").whereCondition(principalNotActive()),
  ],
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
});

interface TestResource {
  createdBy: string;
  id: string;
}

const testResource = auth.createResource<TestResource>()("test", {
  actions: ["list", "view", "create", "update", "delete"],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
    p.deny("*").to("delete").whereTargetIsSelf(),
  ],
  resolveOwner: (r) => r.createdBy,
});

const registry = auth.buildRegistry({ test: testResource });

const adminPrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_admin",
  roles: ["admin"],
};

const userPrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_1",
  roles: ["user"],
};

const inactivePrincipal: Principal = {
  attributes: { status: "inactive" },
  id: "usr_inactive",
  roles: ["user"],
};

describe("buildRegistry", () => {
  it("enforces allow, deny, owner, and global policies", async () => {
    const adminList = await registry.can(adminPrincipal, "test", "list");
    expect(adminList).toEqual({
      allowed: true,
      matchedPolicy: "allow:admin:*",
    });

    const ownView = await registry.can(userPrincipal, "test", "view", {
      resource: { createdBy: "usr_1", id: "res_1" },
    });
    expect(ownView).toEqual({
      allowed: true,
      matchedPolicy: "allow:user:view,update:whereOwner",
    });

    const otherView = await registry.can(userPrincipal, "test", "view", {
      resource: { createdBy: "usr_other", id: "res_1" },
    });
    expect(otherView).toMatchObject({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const create = await registry.can(userPrincipal, "test", "create");
    expect(create).toMatchObject({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const selfDelete = await registry.can(adminPrincipal, "test", "delete", {
      resource: { createdBy: "usr_admin", id: "usr_admin" },
    });
    expect(selfDelete).toMatchObject({
      allowed: false,
      reason: "EXPLICIT_DENY",
    });

    const otherDelete = await registry.can(adminPrincipal, "test", "delete", {
      resource: { createdBy: "usr_other", id: "res_2" },
    });
    expect(otherDelete.allowed).toBe(true);

    const inactive = await registry.can(inactivePrincipal, "test", "list");
    expect(inactive).toMatchObject({ allowed: false, reason: "GLOBAL_DENY" });
  });

  it("throws AuthorizationError with the deny reason and resolves on allow", async () => {
    const pending = registry.assertCan(userPrincipal, "test", "create");
    await expect(pending).rejects.toBeInstanceOf(AuthorizationError);
    await expect(pending).rejects.toMatchObject({
      reason: "NO_MATCHING_POLICY",
    });

    await expect(
      registry.assertCan(adminPrincipal, "test", "list")
    ).resolves.toBeUndefined();
  });

  it("evaluates capabilities conservatively", async () => {
    const capabilities = await registry.evaluateCapabilities(userPrincipal);
    expect(capabilities["test:list"]).toBe(true);
    expect(capabilities["test:view"]).toBe(true);
    expect(capabilities["test:update"]).toBe(true);
    expect(capabilities["test:create"]).toBe(false);
    expect(capabilities["test:delete"]).toBe(false);
  });

  it("denies unknown resources, actions, and prototype keys without throwing", async () => {
    // @ts-expect-error
    const unknownAction = await registry.can(adminPrincipal, "test", "fly");
    expect(unknownAction).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    // @ts-expect-error
    const unknownResource = await registry.can(adminPrincipal, "ghost", "list");
    expect(unknownResource).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const toStringResource = await registry.can(
      adminPrincipal,
      // @ts-expect-error
      "toString",
      "list"
    );
    expect(toStringResource).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const constructorResource = await registry.can(
      adminPrincipal,
      // @ts-expect-error
      "constructor",
      "list"
    );
    expect(constructorResource).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const toStringAction = await registry.can(
      adminPrincipal,
      "test",
      // @ts-expect-error
      "toString"
    );
    expect(toStringAction).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });

    const constructorAction = await registry.can(
      adminPrincipal,
      "test",
      // @ts-expect-error
      "constructor"
    );
    expect(constructorAction).toEqual({
      allowed: false,
      reason: "NO_MATCHING_POLICY",
    });
  });
});

describe("org scoping through the registry", () => {
  const orgAuth = createAuthSchema({
    globalPolicies: (p) => [
      p.deny("*").to("*").whereCondition(principalNotActive()),
    ],
    organizationRoles: ["owner", "admin", "member"],
    roles: ["admin", "member"],
    systemAdminRoles: ["admin"],
  });

  interface ProjectResource {
    createdBy: string;
    id: string;
    organizationId: string;
  }

  const projectResource = orgAuth.createResource<ProjectResource>()("project", {
    actions: ["list", "view", "create", "update", "delete"],
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("member").to("list", "view").withOrgRole("member"),
      p.allow("member").to("*").withOrgRole("owner", "admin"),
      p.allow("member").to("update").whereOwner(),
    ],
    resolveOrganization: (r) => r.organizationId,
    resolveOwner: (r) => r.createdBy,
  });

  const orgRegistry = orgAuth.buildRegistry({ project: projectResource });

  const orgMember: Principal = {
    attributes: { status: "active" },
    id: "usr_org_member",
    organization: { id: "org_1", role: "member" },
    roles: ["member"],
  };

  const orgOwner: Principal = {
    attributes: { status: "active" },
    id: "usr_org_owner",
    organization: { id: "org_1", role: "owner" },
    roles: ["member"],
  };

  const noOrgUser: Principal = {
    attributes: { status: "active" },
    id: "usr_no_org",
    roles: ["member"],
  };

  const sysAdmin: Principal = {
    attributes: { status: "active" },
    id: "usr_sys_admin",
    roles: ["admin"],
  };

  const project: ProjectResource = {
    createdBy: "usr_org_member",
    id: "proj_1",
    organizationId: "org_1",
  };

  const otherOrgProject: ProjectResource = {
    createdBy: "usr_other",
    id: "proj_2",
    organizationId: "org_2",
  };

  it("enforces org membership, tenant isolation, and system-admin bypass", async () => {
    const ownerDelete = await orgRegistry.can(orgOwner, "project", "delete", {
      resource: project,
    });
    expect(ownerDelete.allowed).toBe(true);

    const wrongOrg = await orgRegistry.can(orgMember, "project", "list", {
      resource: otherOrgProject,
    });
    expect(wrongOrg).toMatchObject({
      allowed: false,
      reason: "TENANT_MISMATCH",
    });

    const missingOrgContext = await orgRegistry.can(
      noOrgUser,
      "project",
      "list",
      {
        resource: project,
      }
    );
    expect(missingOrgContext).toMatchObject({
      allowed: false,
      reason: "ORG_CONTEXT_MISSING",
    });

    const systemAdminBypass = await orgRegistry.can(
      sysAdmin,
      "project",
      "delete",
      { resource: otherOrgProject }
    );
    expect(systemAdminBypass.allowed).toBe(true);
  });
});
