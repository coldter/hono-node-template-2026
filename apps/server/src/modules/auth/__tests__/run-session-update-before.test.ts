/**
 * Behavioural tests for `runSessionUpdateBefore` (extracted from
 * `databaseHooks.session.update.before` in `instance.ts`).
 *
 * Two refresh paths exist; this suite exercises both branches:
 *   1. `activeOrganizationId` change — role lookup + stamp, or clear
 *      (`activeOrgRole: null`) when set to null.
 *   2. `expiresAt` refresh — web sessions get shortened expiry, mobile
 *      sessions pass through with the global default.
 * Other update payloads (no activeOrganizationId, no expiresAt) pass
 * through untouched.
 */

import { describe, expect, it, vi } from "vitest";
import { runSessionUpdateBefore } from "../instance";

function makeCtx(userId: string | undefined, userAgent?: string) {
  return {
    headers: new Headers(userAgent ? { "user-agent": userAgent } : {}),
    context: userId ? { session: { user: { id: userId } } } : undefined,
  };
}

describe("runSessionUpdateBefore", () => {
  describe("activeOrganizationId change", () => {
    it("resolves the role and stamps activeOrgRole when org id changes", async () => {
      const resolveActiveOrganizationRole = vi.fn(async () => "admin");

      const result = await runSessionUpdateBefore(
        { activeOrganizationId: "o_2" },
        makeCtx("u_1"),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(resolveActiveOrganizationRole).toHaveBeenCalledWith("u_1", "o_2");
      expect(result.data).toEqual({
        activeOrganizationId: "o_2",
        activeOrgRole: "admin",
      });
    });

    it("clears activeOrgRole when activeOrganizationId is set to null", async () => {
      const resolveActiveOrganizationRole = vi.fn();

      const result = await runSessionUpdateBefore(
        { activeOrganizationId: null },
        makeCtx("u_1"),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(resolveActiveOrganizationRole).not.toHaveBeenCalled();
      expect(result.data).toEqual({
        activeOrganizationId: null,
        activeOrgRole: null,
      });
    });

    it("passes through unchanged when no user id is on the context", async () => {
      const resolveActiveOrganizationRole = vi.fn(async () => "member");

      const result = await runSessionUpdateBefore(
        { activeOrganizationId: "o_2" },
        makeCtx(undefined),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(resolveActiveOrganizationRole).not.toHaveBeenCalled();
      expect(result.data).toEqual({ activeOrganizationId: "o_2" });
    });

    it("passes through unchanged when the role lookup returns undefined (error path)", async () => {
      const resolveActiveOrganizationRole = vi.fn(async () => undefined);

      const result = await runSessionUpdateBefore(
        { activeOrganizationId: "o_2" },
        makeCtx("u_1"),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(result.data).toEqual({ activeOrganizationId: "o_2" });
    });

    it("stamps activeOrgRole as null when membership lookup returns null", async () => {
      const resolveActiveOrganizationRole = vi.fn(async () => null);

      const result = await runSessionUpdateBefore(
        { activeOrganizationId: "o_2" },
        makeCtx("u_1"),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(result.data).toEqual({
        activeOrganizationId: "o_2",
        activeOrgRole: null,
      });
    });
  });

  describe("expiresAt refresh", () => {
    it("shortens expiresAt for web platform requests", async () => {
      const resolveActiveOrganizationRole = vi.fn();
      const before = Date.now();

      const result = await runSessionUpdateBefore(
        { expiresAt: new Date("2020-01-01T00:00:00Z") },
        makeCtx(undefined, "Mozilla/5.0 (Macintosh)"),
        {
          resolveActiveOrganizationRole,
        }
      );

      const after = Date.now();
      const newExpiresAt = result.data.expiresAt;
      expect(newExpiresAt).toBeInstanceOf(Date);
      // boundary: result.data is Record<string, unknown> by the hook
      // signature; we know we just put a Date there above.
      const ts = (newExpiresAt as Date).getTime();
      // Web sessions: 1 hour = 3600 * 1000 ms.
      expect(ts).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(ts).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it("passes through unchanged for mobile platform requests", async () => {
      const resolveActiveOrganizationRole = vi.fn();
      const originalExpiresAt = new Date("2099-01-01T00:00:00Z");

      const result = await runSessionUpdateBefore(
        { expiresAt: originalExpiresAt },
        makeCtx(undefined, "okhttp/4.10.0"),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(result.data.expiresAt).toBe(originalExpiresAt);
    });
  });

  describe("pass-through paths", () => {
    it("passes through unchanged when neither activeOrganizationId nor expiresAt is present", async () => {
      const resolveActiveOrganizationRole = vi.fn();

      const result = await runSessionUpdateBefore(
        { updatedAt: new Date("2026-05-13T00:00:00Z") },
        makeCtx("u_1"),
        {
          resolveActiveOrganizationRole,
        }
      );

      expect(resolveActiveOrganizationRole).not.toHaveBeenCalled();
      expect(result.data).toEqual({
        updatedAt: new Date("2026-05-13T00:00:00Z"),
      });
    });
  });
});
