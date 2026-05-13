/**
 * Behavioral tests for `runSessionCreateBefore` (extracted from
 * `databaseHooks.session.create.before` in `instance.ts`).
 *
 * The critical invariant covered here: a credentials sign-in into an
 * organization with `enforceSSO = true` must abort BEFORE any platform /
 * notification / org-stamping side-effects run. This test asserts:
 *
 *   1. SSO enforcement fires when initial-org has `enforceSSO=true` and the
 *      endpoint path is `/sign-in/email`.
 *   2. The pre-existing session row is NOT revoked (DB delete is not called).
 *   3. The new-device notification is NOT queued.
 *
 * If those side-effects ran before the SSO check, a user with credentials
 * could trigger session cleanup or notification spam on a locked-down tenant.
 */

import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it, vi } from "vitest";
import { runSessionCreateBefore } from "../instance";
import { silentLogger } from "./fixtures/logger";

// Permissive stub Drizzle client. The `select(...).from(...).where(...).limit(...)`
// chain in `runSessionCreateBefore` is only reached after SSO enforcement
// passes; we still wire it to a resolving Promise so the positive-path test
// doesn't trip on undefined chains.
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

    // enforceSsoIfRequired queries liveOrganizations(db).selectById(...). We
    // simulate SSO enforcement by making select return [{ enforceSSO: true }].
    // The delete chain is preserved so a leak past the SSO gate would still
    // hit a working spy.
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

    // Side-effects must NOT have fired.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(queueNewDeviceNotification).not.toHaveBeenCalled();
    // The org lookup is the first step and DOES run — that's the lookup we
    // feed into SSO enforcement.
    expect(resolveInitialOrganizationContext).toHaveBeenCalledWith("u_1");
  });

  it("allows credentials sign-in when the resolved org has enforceSSO=false", async () => {
    // Stub select chain such that liveOrganizations returns enforceSSO=false
    // for the SSO check and an empty array for the previous-session lookup.
    let selectCallCount = 0;
    const ssoFalseDb = makeDrizzleStub({
      select: () => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          // First call: enforceSsoIfRequired's selectById.
          return {
            from: () => ({
              where: () => Promise.resolve([{ enforceSSO: false }]),
            }),
          };
        }
        // Subsequent: previous-session lookup.
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
    // SSO-callback paths are classified as provider="sso", so
    // enforceSsoIfRequired short-circuits regardless of org config.
    const ssoCallbackDb = makeDrizzleStub({
      // First call would be enforceSsoIfRequired — but the guard short-circuits
      // BEFORE the select runs because provider !== "credentials".
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

    // Login succeeds — produces a session with the org stamped on it.
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
    // No active org stamped — orgContext was null.
    expect(result.data).not.toHaveProperty("activeOrganizationId");
  });
});
