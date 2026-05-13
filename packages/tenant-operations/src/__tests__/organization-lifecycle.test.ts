import type { DrizzleClient } from "@repo/db";
import type { Invalidator } from "@repo/tenancy";
import { describe, expect, it, vi } from "vitest";
import {
  type Actor,
  applyOrgTransition,
  createTenant,
  OrganizationLifecycleError,
  restoreTenant,
  softDeleteTenant,
  suspendTenant,
  TRANSITIONS,
} from "../organization-lifecycle";

type OrgRow = {
  id: string;
  slug: string | null;
  name: string;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  sessionVersion: number;
};

type InsertEntry = { table: string; values: Record<string, unknown> };
type UpdateEntry = { table: string; patch: Record<string, unknown> };
type DeleteEntry = { table: string };

type StubState = {
  org: OrgRow | null;
  inserts: InsertEntry[];
  updates: UpdateEntry[];
  deletes: DeleteEntry[];
  cacheBumps: number;
};

function tableName(t: unknown): string {
  // boundary: Drizzle's pgTable object exposes its name via the
  // `Symbol.for("drizzle:Name")` slot. Test-side reflection only.
  const sym = Symbol.for("drizzle:Name");
  const rec = t as Record<symbol, unknown>;
  const name = rec[sym];
  return typeof name === "string" ? name : "<unknown>";
}

function makeStubDb(initial?: OrgRow): {
  db: DrizzleClient;
  state: StubState;
} {
  const state: StubState = {
    org: initial ?? null,
    inserts: [],
    updates: [],
    deletes: [],
    cacheBumps: 0,
  };

  const tx = {
    select(_columns: Record<string, unknown>) {
      return {
        from(table: unknown) {
          const name = tableName(table);
          return {
            where(_pred: unknown) {
              if (name === "organization") {
                if (state.org && !state.org.deletedAt) {
                  return Promise.resolve([
                    {
                      id: state.org.id,
                      suspendedAt: state.org.suspendedAt,
                      deletedAt: state.org.deletedAt,
                      sessionVersion: state.org.sessionVersion,
                      slug: state.org.slug,
                    },
                  ]);
                }
                return Promise.resolve([]);
              }
              if (name === "tenant_cache_version") {
                return Promise.resolve([{ version: "1" }]);
              }
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          state.inserts.push({ table: name, values });
          if (name === "organization") {
            const id = String(values.id);
            const slug = typeof values.slug === "string" ? values.slug : null;
            const orgName = String(values.name);
            state.org = {
              id,
              slug,
              name: orgName,
              suspendedAt: null,
              deletedAt: null,
              sessionVersion:
                typeof values.sessionVersion === "number"
                  ? values.sessionVersion
                  : 0,
            };
            // Promise extended with `.returning()` so both call shapes
            // (with and without `.returning(...)`) work without a cast.
            const p = Promise.resolve(undefined);
            return Object.assign(p, {
              returning: () => Promise.resolve([{ id, slug, name: orgName }]),
              onConflictDoNothing: () => Promise.resolve(undefined),
            });
          }
          const p = Promise.resolve(undefined);
          return Object.assign(p, {
            onConflictDoNothing: () => Promise.resolve(undefined),
            returning: () => Promise.resolve([]),
          });
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(patch: Record<string, unknown>) {
          state.updates.push({ table: name, patch });
          if (name === "organization" && state.org) {
            const current = state.org;
            const next: OrgRow = { ...current };
            if ("suspendedAt" in patch) {
              next.suspendedAt =
                patch.suspendedAt instanceof Date ? patch.suspendedAt : null;
            }
            if ("deletedAt" in patch) {
              next.deletedAt =
                patch.deletedAt instanceof Date ? patch.deletedAt : null;
            }
            if ("sessionVersion" in patch) {
              const sv = patch.sessionVersion;
              if (typeof sv === "number") {
                next.sessionVersion = sv;
              } else {
                // SQL fragment — the writer only ever emits `+ 1`.
                next.sessionVersion = current.sessionVersion + 1;
              }
            }
            state.org = next;
          }
          if (name === "tenant_cache_version") {
            state.cacheBumps += 1;
            return {
              where: (_p: unknown) => ({
                returning: (_cols?: unknown) =>
                  Promise.resolve([{ version: "2" }]),
              }),
            };
          }
          return {
            where: (_p: unknown) => Promise.resolve(undefined),
          };
        },
      };
    },
    delete(table: unknown) {
      const name = tableName(table);
      return {
        where: (_p: unknown) => {
          state.deletes.push({ table: name });
          return Promise.resolve(undefined);
        },
      };
    },
  };

  const db = {
    transaction: async <T>(cb: (t: typeof tx) => Promise<T>): Promise<T> =>
      await cb(tx),
  };

  return {
    // boundary: structural DrizzleClient stub for the transaction wrapper;
    // @repo/test-harness can't be a devDep here without a cycle through
    // its own @repo/tenancy dep.
    db: db as unknown as DrizzleClient,
    state,
  };
}

function makeInvalidator(): Invalidator & {
  bumpDurable: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
} {
  return {
    bumpDurable: vi.fn(async () => undefined),
    broadcast: vi.fn(async () => undefined),
  };
}

const GA_ACTOR: Actor = { type: "GLOBAL_ADMIN", id: "ga_1" };

function activeRow(overrides?: Partial<OrgRow>): OrgRow {
  return {
    id: "org_1",
    slug: "acme",
    name: "Acme",
    suspendedAt: null,
    deletedAt: null,
    sessionVersion: 0,
    ...overrides,
  };
}

describe("TRANSITIONS table", () => {
  it("active has suspended + soft_deleted as outgoing arrows", () => {
    expect(TRANSITIONS.active.has("suspended")).toBe(true);
    expect(TRANSITIONS.active.has("soft_deleted")).toBe(true);
  });

  it("suspended only restores to active", () => {
    expect(TRANSITIONS.suspended.has("active")).toBe(true);
    expect(TRANSITIONS.suspended.has("soft_deleted")).toBe(false);
  });

  it("soft_deleted is terminal", () => {
    expect(TRANSITIONS.soft_deleted.size).toBe(0);
  });
});

describe("applyOrgTransition — create", () => {
  it("inserts an org row, audits, bumps tenant-cache, calls invalidator once", async () => {
    const { db, state } = makeStubDb();
    const inv = makeInvalidator();

    const out = await createTenant(
      {
        data: { slug: "acme", name: "Acme" },
        actor: GA_ACTOR,
        host: "acme.app.example.com",
      },
      { db, invalidator: inv }
    );

    expect(out?.slug).toBe("acme");
    expect(out?.name).toBe("Acme");

    const orgInserts = state.inserts.filter((i) => i.table === "organization");
    expect(orgInserts).toHaveLength(1);
    expect(orgInserts[0]?.values.slug).toBe("acme");
    expect(orgInserts[0]?.values.sessionVersion).toBe(0);

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.values.event).toBe("tenancy.org.created");
    expect(auditInserts[0]?.values.actorType).toBe("GLOBAL_ADMIN");
    expect(auditInserts[0]?.values.targetType).toBe("organization");

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledWith("acme.app.example.com");
  });
});

describe("applyOrgTransition — suspend", () => {
  it("sets suspendedAt, bumps sessionVersion N → N+1, cascades sessions, writes TWO audit rows", async () => {
    const { db, state } = makeStubDb(activeRow({ sessionVersion: 3 }));
    const inv = makeInvalidator();
    const now = new Date("2026-05-13T12:00:00Z");

    await suspendTenant(
      { orgId: "org_1", actor: GA_ACTOR, host: "acme.app.example.com" },
      { db, invalidator: inv },
      now
    );

    const orgUpdate = state.updates.find((u) => u.table === "organization");
    expect(orgUpdate?.patch.suspendedAt).toEqual(now);
    expect(orgUpdate?.patch.sessionVersion).toBeDefined();

    expect(state.org?.sessionVersion).toBe(4);
    expect(state.org?.suspendedAt).toEqual(now);

    const sessionDeletes = state.deletes.filter((d) => d.table === "sessions");
    expect(sessionDeletes).toHaveLength(1);

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(2);
    const events = auditInserts.map((i) => i.values.event);
    expect(events).toContain("tenancy.org.suspended");
    expect(events).toContain("tenancy.user.session_revoked_mass");

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
  });

  it("denies when org is already tombstoned (live-org returns 0 rows)", async () => {
    const { db, state } = makeStubDb(
      activeRow({ deletedAt: new Date("2026-05-12T00:00:00Z") })
    );
    const inv = makeInvalidator();

    await expect(
      suspendTenant(
        { orgId: "org_1", actor: GA_ACTOR, host: "acme.app.example.com" },
        { db, invalidator: inv }
      )
    ).rejects.toBeInstanceOf(OrganizationLifecycleError);

    expect(
      state.updates.find((u) => u.table === "organization")
    ).toBeUndefined();
    expect(state.inserts.find((i) => i.table === "audit_logs")).toBeUndefined();
    expect(inv.bumpDurable).not.toHaveBeenCalled();
    expect(inv.broadcast).not.toHaveBeenCalled();
  });
});

describe("applyOrgTransition — restore", () => {
  it("clears suspendedAt without decrementing sessionVersion, writes one audit row", async () => {
    const suspendedAt = new Date("2026-05-10T00:00:00Z");
    const { db, state } = makeStubDb(
      activeRow({ suspendedAt, sessionVersion: 5 })
    );
    const inv = makeInvalidator();

    await restoreTenant(
      { orgId: "org_1", actor: GA_ACTOR, host: "acme.app.example.com" },
      { db, invalidator: inv }
    );

    const orgUpdate = state.updates.find((u) => u.table === "organization");
    expect(orgUpdate?.patch.suspendedAt).toBeNull();
    expect("sessionVersion" in (orgUpdate?.patch ?? {})).toBe(false);

    expect(state.org?.suspendedAt).toBeNull();
    expect(state.org?.sessionVersion).toBe(5);

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.values.event).toBe("tenancy.org.restored");

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
  });

  it("denies when org isn't suspended (active row)", async () => {
    const { db, state } = makeStubDb(activeRow());
    const inv = makeInvalidator();

    await expect(
      restoreTenant(
        { orgId: "org_1", actor: GA_ACTOR, host: "acme.app.example.com" },
        { db, invalidator: inv }
      )
    ).rejects.toBeInstanceOf(OrganizationLifecycleError);

    expect(
      state.updates.find((u) => u.table === "organization")
    ).toBeUndefined();
    expect(inv.bumpDurable).not.toHaveBeenCalled();
    expect(inv.broadcast).not.toHaveBeenCalled();
  });
});

describe("applyOrgTransition — softDelete", () => {
  it("sets deletedAt, tombstones slug, cascades sessions, audits, bumps cache once", async () => {
    const { db, state } = makeStubDb(activeRow());
    const inv = makeInvalidator();
    const now = new Date("2026-05-13T13:00:00Z");

    await softDeleteTenant(
      { orgId: "org_1", actor: GA_ACTOR, host: "acme.app.example.com" },
      { db, invalidator: inv },
      now
    );

    const orgUpdate = state.updates.find((u) => u.table === "organization");
    expect(orgUpdate?.patch.deletedAt).toEqual(now);

    const tombstone = state.inserts.find((i) => i.table === "reserved_slugs");
    expect(tombstone?.values.slug).toBe("acme");
    expect(tombstone?.values.reason).toBe("tombstone");
    expect(tombstone?.values.organizationId).toBe("org_1");

    const sessionDeletes = state.deletes.filter((d) => d.table === "sessions");
    expect(sessionDeletes).toHaveLength(1);

    const auditInserts = state.inserts.filter((i) => i.table === "audit_logs");
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.values.event).toBe("tenancy.org.softDeleted");

    expect(inv.bumpDurable).toHaveBeenCalledTimes(1);
    expect(inv.broadcast).toHaveBeenCalledTimes(1);
  });

  it("is one-way: applying softDelete to a tombstoned row throws not_found", async () => {
    const { db, state } = makeStubDb(
      activeRow({ deletedAt: new Date("2026-05-12T00:00:00Z") })
    );
    const inv = makeInvalidator();

    await expect(
      softDeleteTenant(
        { orgId: "org_1", actor: GA_ACTOR, host: "acme.app.example.com" },
        { db, invalidator: inv }
      )
    ).rejects.toBeInstanceOf(OrganizationLifecycleError);

    expect(
      state.updates.find((u) => u.table === "organization")
    ).toBeUndefined();
    expect(inv.bumpDurable).not.toHaveBeenCalled();
    expect(inv.broadcast).not.toHaveBeenCalled();
  });
});

describe("applyOrgTransition — exhaustiveness", () => {
  it("rejects an unknown discriminant at runtime", async () => {
    const { db } = makeStubDb(activeRow());
    const inv = makeInvalidator();

    await expect(
      // boundary: deliberately invalid Transition to exercise the
      // exhaustiveness switch's default branch.
      applyOrgTransition(
        { kind: "bogus" } as unknown as Parameters<
          typeof applyOrgTransition
        >[0],
        { db, invalidator: inv }
      )
    ).rejects.toBeInstanceOf(Error);
  });
});
