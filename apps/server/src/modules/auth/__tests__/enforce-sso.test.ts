import type { Executor } from "@repo/db";
import { makeExecutorStub } from "@repo/test-harness";
import { describe, expect, it } from "vitest";
import { type EnforceSsoSession, enforceSsoIfRequired } from "../enforce-sso";

function makeStubDb(rows: Array<{ enforceSSO: boolean }>): Executor {
  const stub = {
    select: (_columns: unknown) => ({
      from: (_table: unknown) => ({
        where: (_pred: unknown) => Promise.resolve(rows),
      }),
    }),
    query: {
      organizations: {
        findFirst: () => Promise.resolve(undefined),
        findMany: () => Promise.resolve([]),
      },
    },
  };
  return makeExecutorStub(stub);
}

describe("enforceSsoIfRequired", () => {
  describe("when activeOrganizationId is absent", () => {
    it("resolves immediately without querying the DB", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: undefined,
        provider: "credentials",
      };
      const db = makeStubDb([{ enforceSSO: true }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });

    it("resolves when activeOrganizationId is null", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: null,
        provider: "credentials",
      };
      const db = makeStubDb([{ enforceSSO: true }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });
  });

  describe("when provider is not credentials", () => {
    it("resolves when provider is 'oidc' even if SSO is enforced", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: "o_1",
        provider: "oidc",
      };
      const db = makeStubDb([{ enforceSSO: true }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });

    it("resolves when provider is 'google'", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: "o_1",
        provider: "google",
      };
      const db = makeStubDb([{ enforceSSO: true }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });

    it("resolves when provider is null", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: "o_1",
        provider: null,
      };
      const db = makeStubDb([{ enforceSSO: true }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });
  });

  describe("when provider is 'credentials'", () => {
    it("throws FORBIDDEN when enforceSSO=true", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: "o_1",
        provider: "credentials",
      };
      const db = makeStubDb([{ enforceSSO: true }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).rejects.toMatchObject({
        status: "FORBIDDEN",
        body: { message: "SSO required" },
      });
    });

    it("resolves when enforceSSO=false", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: "o_1",
        provider: "credentials",
      };
      const db = makeStubDb([{ enforceSSO: false }]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });

    it("resolves when the organization row is not found (empty result)", async () => {
      const session: EnforceSsoSession = {
        activeOrganizationId: "o_nonexistent",
        provider: "credentials",
      };
      const db = makeStubDb([]);
      await expect(
        enforceSsoIfRequired(session, undefined, db)
      ).resolves.toBeUndefined();
    });
  });
});
