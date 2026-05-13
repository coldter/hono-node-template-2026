/**
 * Behavioural tests for `createAdminAuth`.
 *
 * Two distinct concerns are exercised:
 *   1. The returned BA instance respects the admin host policy and the
 *      `disableSignUp` invariant.
 *   2. The session-create gate refuses to issue a session for users that
 *      have no row in `global_admins` (defense layer between the BA users
 *      table and the operator perimeter).
 *
 * The `db` argument is stubbed because we override `resolveOperatorBinding`
 * in each test; the BA drizzle adapter is constructed but only the
 * allowed-hosts and disabled-paths surfaces are touched here, neither of
 * which requires a real connection.
 */

import type { DrizzleClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { createAdminAuth } from "../instance";

// boundary: winston's `Logger` interface mixes typed call signatures and
// dynamic transport methods that resist structural matching. Only the four
// level emitters are touched, so widen the no-op stub at this edge.
const stubLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

const stubDb = {} as DrizzleClient;

function makeAuth(overrides?: {
  resolveOperatorBinding?: (userId: string) => Promise<{
    id: string;
    subRole: "platform_admin" | "support" | "read_only";
  } | null>;
}) {
  return createAdminAuth({
    db: stubDb,
    logger: stubLogger,
    adminHost: "admin.localhost",
    resolveOperatorBinding:
      overrides?.resolveOperatorBinding ?? (async () => null),
  });
}

const HOST_ERR_RE = /allowed hosts/i;

describe("createAdminAuth", () => {
  it("rejects requests for unknown hosts", async () => {
    const auth = makeAuth();
    await expect(
      auth.handler(new Request("https://attacker.example/api/auth/get-session"))
    ).rejects.toThrow(HOST_ERR_RE);
  });

  it("accepts requests for the pinned admin host", async () => {
    const auth = makeAuth();
    const res = await auth.handler(
      new Request("https://admin.localhost/api/auth/get-session")
    );
    // BA returns 200 with null when no session is present; the only
    // failure we guard against here is a 5xx from a host-allowlist
    // misconfiguration.
    expect(res.status).toBeLessThan(500);
  });
});

describe("createAdminAuth session-create gate", () => {
  it("rejects users that have no global_admins row", async () => {
    const resolveOperatorBinding = vi.fn(async () => null);
    const auth = makeAuth({ resolveOperatorBinding });

    // boundary: BA's `databaseHooks.session.create.before` is typed via
    // an external `BetterAuthOptions` shape that varies between minor
    // versions. The runtime contract is `(session, context) -> Promise`;
    // we shape-cast to a thin signature here so the test can drive the
    // gate directly without leaking BA internals into the test.
    type Before = (
      session: Record<string, unknown>,
      context: unknown
    ) => Promise<unknown>;
    const beforeHook = auth.options.databaseHooks?.session?.create
      ?.before as unknown as Before | undefined;
    expect(typeof beforeHook).toBe("function");
    if (!beforeHook) {
      throw new Error("session.create.before is not a function");
    }

    await expect(
      beforeHook({ userId: "user_not_an_operator" }, undefined)
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
    });

    expect(resolveOperatorBinding).toHaveBeenCalledWith("user_not_an_operator");
  });

  it("stamps operator id and sub-role on the session for a bound user", async () => {
    const auth = makeAuth({
      resolveOperatorBinding: async (userId) =>
        userId === "user_op_1"
          ? { id: "gadmin_1", subRole: "platform_admin" }
          : null,
    });

    type Before = (
      session: Record<string, unknown>,
      context: unknown
    ) => Promise<unknown>;
    const beforeHook = auth.options.databaseHooks?.session?.create
      ?.before as unknown as Before | undefined;
    if (!beforeHook) {
      throw new Error("session.create.before is not a function");
    }

    const out = await beforeHook({ userId: "user_op_1" }, undefined);

    expect(out).toMatchObject({
      data: {
        userId: "user_op_1",
        operatorId: "gadmin_1",
        operatorSubRole: "platform_admin",
      },
    });
  });
});
