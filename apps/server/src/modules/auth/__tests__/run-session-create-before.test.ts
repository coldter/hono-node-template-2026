// Invariant: credentials sign-in into an enforceSSO=true org must abort BEFORE
// session revocation / notifications / org-stamping side-effects run.

import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it, vi } from "vitest";
import { runSessionCreateBefore } from "../instance";
import { silentLogger } from "./fixtures/logger";

type DeleteSpy = ReturnType<typeof vi.fn>;

function makeStubDb(): { db: DrizzleClient; deleteSpy: DeleteSpy } {
  const deleteSpy = vi.fn(() => ({
    where: () => Promise.resolve(),
  }));
  const stub = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    delete: deleteSpy,
  };
  return { db: makeDrizzleStub(stub), deleteSpy };
}

const SILENT_LOGGER = silentLogger();

describe("runSessionCreateBefore — SSO enforcement composition", () => {
  it("throws when initial-org has enforceSSO=true and path is /sign-in/email", async () => {
    const { deleteSpy } = makeStubDb();
    const resolveInitialOrganizationContext = vi.fn(async () => ({
      activeOrganizationId: "o_1",
      activeOrgRole: "member",
    }));
    const queueNewDeviceNotification = vi.fn();

    // Simulate enforcement: liveOrganizations.selectById returns [{ enforceSSO: true }].
    const ssoSelectStub = {
      from: () => ({ where: () => Promise.resolve([{ enforceSSO: true }]) }),
    };
    const dbWithSso = makeDrizzleStub({
      select: () => ssoSelectStub,
      delete: deleteSpy,
      query: {
        organizations: {
          findFirst: () => Promise.resolve(undefined),
          findMany: () => Promise.resolve([]),
        },
      },
    });

    await expect(
      runSessionCreateBefore(
        { userId: "u_1" },
        { path: "/sign-in/email", headers: new Headers() },
        { db: dbWithSso, logger: SILENT_LOGGER },
        { resolveInitialOrganizationContext, queueNewDeviceNotification }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO required" },
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(queueNewDeviceNotification).not.toHaveBeenCalled();
    expect(resolveInitialOrganizationContext).toHaveBeenCalledWith("u_1");
  });

  it("allows credentials sign-in when the resolved org has enforceSSO=false", async () => {
    let selectCallCount = 0;
    const ssoFalseDb = makeDrizzleStub({
      select: () => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ enforceSSO: false }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => ({ limit: () => Promise.resolve([]) }),
          }),
        };
      },
      delete: () => ({ where: () => Promise.resolve() }),
      query: {
        organizations: {
          findFirst: () => Promise.resolve(undefined),
          findMany: () => Promise.resolve([]),
        },
      },
    });

    const resolveInitialOrganizationContext = vi.fn(async () => ({
      activeOrganizationId: "o_1",
      activeOrgRole: "member",
    }));
    const queueNewDeviceNotification = vi.fn();

    const result = await runSessionCreateBefore(
      { userId: "u_1", token: "t_1" },
      { path: "/sign-in/email", headers: new Headers() },
      { db: ssoFalseDb, logger: SILENT_LOGGER },
      { resolveInitialOrganizationContext, queueNewDeviceNotification }
    );

    expect(result.data).toMatchObject({
      userId: "u_1",
      activeOrganizationId: "o_1",
      activeOrgRole: "member",
      platform: "web",
    });
  });

  it("does NOT enforce SSO for an SSO-callback login even when enforceSSO=true", async () => {
    // SSO-callback paths classify as provider="sso", so the guard short-circuits before the select runs.
    const ssoCallbackDb = makeDrizzleStub({
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
      delete: () => ({ where: () => Promise.resolve() }),
      query: {
        organizations: {
          findFirst: () => Promise.resolve(undefined),
          findMany: () => Promise.resolve([]),
        },
      },
    });

    const resolveInitialOrganizationContext = vi.fn(async () => ({
      activeOrganizationId: "o_1",
      activeOrgRole: "member",
    }));
    const queueNewDeviceNotification = vi.fn();

    const result = await runSessionCreateBefore(
      { userId: "u_1" },
      { path: "/sso/callback/okta", headers: new Headers() },
      { db: ssoCallbackDb, logger: SILENT_LOGGER },
      { resolveInitialOrganizationContext, queueNewDeviceNotification }
    );

    expect(result.data).toMatchObject({ activeOrganizationId: "o_1" });
  });

  it("does NOT enforce SSO when the user has no membership (orgContext is null)", async () => {
    const noOrgDb = makeDrizzleStub({
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
      delete: () => ({ where: () => Promise.resolve() }),
      query: {
        organizations: {
          findFirst: () => Promise.resolve(undefined),
          findMany: () => Promise.resolve([]),
        },
      },
    });

    const resolveInitialOrganizationContext = vi.fn(async () => null);
    const queueNewDeviceNotification = vi.fn();

    const result = await runSessionCreateBefore(
      { userId: "u_1" },
      { path: "/sign-in/email", headers: new Headers() },
      { db: noOrgDb, logger: SILENT_LOGGER },
      { resolveInitialOrganizationContext, queueNewDeviceNotification }
    );

    expect(result.data).toMatchObject({ userId: "u_1", platform: "web" });
    expect(result.data).not.toHaveProperty("activeOrganizationId");
  });
});
