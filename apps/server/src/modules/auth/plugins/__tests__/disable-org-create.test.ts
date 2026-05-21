import { describe, expect, it } from "vitest";
import { disableOrgCreatePlugin } from "../disable-org-create";

describe("disableOrgCreatePlugin", () => {
  describe("matcher", () => {
    function getMatcher() {
      const plugin = disableOrgCreatePlugin();
      const hook = plugin.hooks?.before?.[0];
      if (!hook) {
        throw new Error("no before hook registered");
      }
      return hook.matcher;
    }

    it("matches /organization/create path", () => {
      const matcher = getMatcher();
      expect(
        matcher({ path: "/organization/create" } as Parameters<
          typeof matcher
        >[0])
      ).toBe(true);
    });

    it("matches a path with a prefix ending in /organization/create", () => {
      const matcher = getMatcher();
      expect(
        matcher({ path: "/api/auth/organization/create" } as Parameters<
          typeof matcher
        >[0])
      ).toBe(true);
    });

    it("does not match /sign-in/email", () => {
      const matcher = getMatcher();
      expect(
        matcher({ path: "/sign-in/email" } as Parameters<typeof matcher>[0])
      ).toBe(false);
    });

    it("does not match /organization/list", () => {
      const matcher = getMatcher();
      expect(
        matcher({ path: "/organization/list" } as Parameters<typeof matcher>[0])
      ).toBe(false);
    });

    it("returns false when path is undefined", () => {
      const matcher = getMatcher();
      expect(matcher({} as Parameters<typeof matcher>[0])).toBe(false);
    });
  });

  describe("handler", () => {
    it("throws APIError(FORBIDDEN) with the disabled-for-tenants message", async () => {
      const plugin = disableOrgCreatePlugin();
      const hook = plugin.hooks?.before?.[0];
      if (!hook) {
        throw new Error("no before hook registered");
      }

      // boundary: handler throws unconditionally before reading its argument,
      // so the stub need not satisfy better-call's MiddlewareInputContext brand.
      type HandlerCtx = Parameters<typeof hook.handler>[0];
      const stub = { context: {} } as unknown as HandlerCtx;
      await expect(hook.handler(stub)).rejects.toMatchObject({
        status: "FORBIDDEN",
        body: { message: "Organization creation disabled for tenants" },
      });
    });
  });
});
