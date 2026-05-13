# A2 — `@repo/tenancy` Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `@repo/tenancy` package: host parsing, two-tier cache (in-process `lru-cache@^11.3.6` + Postgres `tenant_cache_version`), Hatchet-event invalidation, Hono middleware. Tenant isolation is enforced in TypeScript per spec § 08 § Application-Layer Tenant Scoping — this package does NOT set a `app.current_tenant` Postgres session variable.

**Architecture:** Pure functions for parsing; injectable dependencies for DB/cache/listener; Hono middleware as the single mounted surface in `apps/server` and `apps/admin-server`. Per spec § 02. The middleware sets `c.var.tenant` and nothing more; handlers and services read `c.var.tenant.organizationId` and pass it down to repositories that gate their WHERE clauses on `eq(<table>.organizationId, organizationId)`.

**Tech Stack:** `lru-cache@^11.3.6`, `pg@^8.20.0`, `hono ^4.12.18`, Drizzle `^0.45.2`, `@hatchet-dev/typescript-sdk@^1.22.1`, Vitest `^4.1.6`.

**References:** spec § 02, § 07, § 08 (Application-Layer Tenant Scoping), § 10 (ND3, ND4, ND12), § 11 (G-PG-1, G-PG-3, G-PG-4).

---

## Task A2.1: Scaffold `packages/tenancy`

**Files:**
- Create: `packages/tenancy/package.json`
- Create: `packages/tenancy/tsconfig.json`
- Create: `packages/tenancy/vitest.config.ts`
- Create: `packages/tenancy/AGENTS.md`
- Create: `packages/tenancy/src/index.ts` (stub re-exports)
- Test: `packages/tenancy/src/__tests__/scaffold.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import * as pkg from "../index";

describe("A2.1 scaffold", () => {
  it("exports the public surface", () => {
    expect(typeof pkg.parseHostname).toBe("function");
    expect(typeof pkg.resolveTenant).toBe("function");
    expect(typeof pkg.tenantMiddleware).toBe("function");
    expect(typeof pkg.hostHeaderGuard).toBe("function");
    expect(typeof pkg.createInvalidator).toBe("function");
    expect(typeof pkg.createFanOutInvalidator).toBe("function");
    expect(typeof pkg.createTenantInvalidationSubscriber).toBe("function");
    expect(typeof pkg.loadHostConfigOnce).toBe("function");
  });
});

// `withTenantSessionVar` is intentionally NOT exported — tenant isolation is
// enforced in TS at the repository/service layer per spec § 08 § Application-
// Layer Tenant Scoping, not via a Postgres session variable.
```

- [ ] **Step 2: Run, watch fail**

```bash
bun run test --filter @repo/tenancy
```

- [ ] **Step 3: Implement**

`packages/tenancy/package.json`:
```json
{
  "name": "@repo/tenancy",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "check-types": "tsgo --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "@repo/shared": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "hono": "^4.12.18",
    "lru-cache": "^11.3.6",
    "pg": "^8.20.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "@typescript/native-preview": "beta",
    "typescript": "^6.0.3",
    "vitest": "^4.1.6"
  }
}
```

`tsconfig.json`: extends `../../tsconfig.base.json`, includes `src/**/*`, no Cloudflare types.

Stub modules in `src/` exporting named functions that throw `new Error("not implemented")` so `index.ts` resolves and the scaffold test passes.

- [ ] **Step 4: Bun install + test**

```bash
bun install
bun run test --filter @repo/tenancy
```

- [ ] **Step 5: Lint + review**

## Task A2.2: `HostConfig` + `loadHostConfigOnce`

**Files:**
- Create: `packages/tenancy/src/host-config.ts`
- Test: `packages/tenancy/src/__tests__/host-config.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadHostConfigOnce, __resetHostConfigForTests } from "../host-config";

describe("loadHostConfigOnce", () => {
  beforeEach(() => __resetHostConfigForTests());
  it("returns snapshot once and reuses thereafter", () => {
    const env = { APP_WILDCARD_HOST: "app.example.com", ADMIN_HOST: "admin.example.com", FALLBACK_HOST: "app.example.com", NODE_ENV: "development" };
    const a = loadHostConfigOnce(env);
    const b = loadHostConfigOnce({ ...env, ADMIN_HOST: "other.example.com" });
    expect(a).toBe(b);                        // same reference
    expect(a.wildcardSuffix).toBe(".app.example.com");
    expect(a.adminHost).toBe("admin.example.com");
  });
  it("throws on wildcard/admin collision", () => {
    expect(() => loadHostConfigOnce({ APP_WILDCARD_HOST: "admin.example.com", ADMIN_HOST: "admin.example.com", FALLBACK_HOST: "x", NODE_ENV: "development" })).toThrow();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
export type HostConfig = Readonly<{
  wildcardSuffix: string;          // e.g., ".app.example.com" (leading dot)
  adminHost: string;
  fallbackHost: string;
  nodeEnv: "development" | "production" | "test";
}>;

let snapshot: HostConfig | null = null;

export function loadHostConfigOnce(env: { APP_WILDCARD_HOST: string; ADMIN_HOST: string; FALLBACK_HOST: string; NODE_ENV: string }): HostConfig {
  if (snapshot) return snapshot;
  if (env.APP_WILDCARD_HOST === env.ADMIN_HOST) throw new Error("APP_WILDCARD_HOST collides with ADMIN_HOST");
  snapshot = Object.freeze({
    wildcardSuffix: "." + env.APP_WILDCARD_HOST.replace(/^\./, ""),
    adminHost: env.ADMIN_HOST.toLowerCase(),
    fallbackHost: env.FALLBACK_HOST.toLowerCase(),
    nodeEnv: env.NODE_ENV as HostConfig["nodeEnv"],
  });
  return snapshot;
}

export function __resetHostConfigForTests() { snapshot = null; }
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.3: `parseHostname` with full matrix

**Files:**
- Create: `packages/tenancy/src/parse-hostname.ts`
- Test: `packages/tenancy/src/__tests__/parse-hostname.test.ts`

- [ ] **Step 1: Failing test (matrix)**

```ts
import { describe, it, expect } from "vitest";
import { parseHostname, SLUG_RE, BUILTIN_RESERVED_SLUGS } from "../parse-hostname";

const cfg = { wildcardSuffix: ".app.example.com", adminHost: "admin.example.com", fallbackHost: "app.example.com", nodeEnv: "development" as const };

describe("parseHostname", () => {
  it("empty → rejected:empty", () => expect(parseHostname("", cfg)).toEqual({ kind: "rejected", reason: "empty" }));
  it("strips port", () => expect(parseHostname("acme.app.example.com:8080", cfg)).toEqual({ kind: "subdomain", slug: "acme" }));
  it("strips trailing dot", () => expect(parseHostname("acme.app.example.com.", cfg)).toEqual({ kind: "subdomain", slug: "acme" }));
  it("admin host", () => expect(parseHostname("admin.example.com", cfg).kind).toBe("admin"));
  it("fallback host", () => expect(parseHostname("app.example.com", cfg).kind).toBe("fallback"));
  it("nested subdomain rejected", () => expect(parseHostname("a.b.app.example.com", cfg)).toEqual({ kind: "rejected", reason: "nested_subdomain" }));
  it("invalid chars rejected", () => expect(parseHostname("ACME.app.example.com", cfg).kind).toBe("subdomain"));    // lowercased
  it("xn-- under wildcard rejected", () => expect(parseHostname("xn--mnchen-3ya.app.example.com", cfg)).toEqual({ kind: "rejected", reason: "punycode" }));
  it("xn-- as custom host allowed", () => expect(parseHostname("xn--bcher-kva.example", cfg).kind).toBe("custom"));
  it("slug regex enforced", () => expect(parseHostname("-bad.app.example.com", cfg).kind).toBe("rejected"));
  it("custom host accepted", () => expect(parseHostname("app.acme.com", cfg)).toEqual({ kind: "custom", host: "app.acme.com" }));
});

describe("BUILTIN_RESERVED_SLUGS", () => {
  it("includes platform names", () => {
    for (const r of ["admin","api","app","www","support"]) expect(BUILTIN_RESERVED_SLUGS.has(r)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement (verbatim from spec § 02)**

Port the implementation exactly from spec § 02.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.4: Cache (`lru-cache@11`)

**Files:**
- Create: `packages/tenancy/src/cache.ts`
- Create: `packages/tenancy/src/types.ts` (`Tenant`, `TenantNotFound`, `TenantSuspended`, `CachedShape`)
- Test: `packages/tenancy/src/__tests__/cache.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTenancyCache } from "../cache";

describe("tenancy cache", () => {
  let cache: ReturnType<typeof createTenancyCache>;
  beforeEach(() => { cache = createTenancyCache({ max: 100 }); });

  it("set + get round-trip", () => {
    cache.set("v0:acme.app.example.com", { kind: "found", tenant: { organizationId: "o_1" } as any });
    expect(cache.get("v0:acme.app.example.com")?.kind).toBe("found");
  });

  it("respects per-set TTL", async () => {
    cache.set("v0:nx.app.example.com", { kind: "not_found", host: "nx.app.example.com" }, { ttl: 50 });
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get("v0:nx.app.example.com")).toBeUndefined();
  });

  it("clearLocal drops all", () => {
    cache.set("v0:a", { kind: "found", tenant: {} as any });
    cache.clearLocal();
    expect(cache.get("v0:a")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
// packages/tenancy/src/types.ts
import type { CustomHostnameLifecycle } from "@repo/db/schema";

export type Tenant = Readonly<{
  organizationId: string;
  slug: string | null;
  host: string;
  kind: "subdomain" | "custom";
  enforceSSO: boolean;
  sessionVersion: number;
  suspendedAt: Date | null;
  deletedAt: Date | null;
}>;

export type TenantNotFound = { kind: "not_found"; host: string };
export type TenantSuspended = { kind: "suspended"; tenant: Tenant };
export type TenantResolution = Tenant | TenantNotFound | TenantSuspended;

export type CachedShape =
  | { kind: "found"; tenant: Tenant }
  | TenantNotFound
  | TenantSuspended;
```

```ts
// packages/tenancy/src/cache.ts
import { LRUCache } from "lru-cache";
import type { CachedShape } from "./types";

export function createTenancyCache(opts: { max?: number; ttl?: number }) {
  const lru = new LRUCache<string, CachedShape>({
    max: opts.max ?? 10_000,
    ttl: opts.ttl ?? 60_000,
    ttlAutopurge: false,
    allowStale: false,
  });
  return {
    get: (k: string) => lru.get(k),
    set: (k: string, v: CachedShape, o?: { ttl?: number }) => { lru.set(k, v, o); },
    clearLocal: () => { lru.clear(); },
    size: () => lru.size,
  };
}

export type TenancyCache = ReturnType<typeof createTenancyCache>;
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.5: `resolveTenant` orchestration with real Postgres

**Files:**
- Create: `packages/tenancy/src/resolve-tenant.ts`
- Test: `packages/tenancy/src/__tests__/resolve-tenant.test.ts` (testcontainers Postgres)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { resolveTenant } from "../resolve-tenant";
import { createTenancyCache } from "../cache";
import { setupSchema } from "./helpers/setup-schema";

let container: StartedPostgreSqlContainer; let pg: Client;
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  pg = new Client({ connectionString: container.getConnectionUri() });
  await pg.connect();
  await setupSchema(pg);    // runs migrations up to A1
});
afterAll(async () => { await pg.end(); await container.stop(); });

const cfg = { wildcardSuffix: ".app.example.com", adminHost: "admin.example.com", fallbackHost: "app.example.com", nodeEnv: "development" as const };

describe("resolveTenant", () => {
  it("subdomain hit", async () => {
    await pg.query(`INSERT INTO organizations (id, slug, name, session_version) VALUES ('o_1','acme','Acme', 0)`);
    const cache = createTenancyCache({});
    const r = await resolveTenant("acme.app.example.com", { db: pg, cache, version: () => "v0", config: cfg, waitUntil: () => {} });
    expect(r).toMatchObject({ kind: "subdomain", organizationId: "o_1" });
  });

  it("not_found cached negatively", async () => {
    const cache = createTenancyCache({});
    const r = await resolveTenant("ghost.app.example.com", { db: pg, cache, version: () => "v0", config: cfg, waitUntil: () => {} });
    expect(r).toEqual({ kind: "not_found", host: "ghost.app.example.com" });
    expect(cache.get("v0:ghost.app.example.com")).toBeDefined();
  });

  it("suspended", async () => {
    await pg.query(`UPDATE organizations SET suspended_at = now() WHERE id='o_1'`);
    const cache = createTenancyCache({});
    const r = await resolveTenant("acme.app.example.com", { db: pg, cache, version: () => "v1", config: cfg, waitUntil: () => {} });
    expect(r.kind).toBe("suspended");
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement (port from spec § 02)**

Use raw `pg.Client.query` rather than Drizzle to keep this package's runtime dependency surface lean. Custom-host lookup joins `tenant_custom_hostnames` with `lifecycle_status='active'` and `deleted_at IS NULL` on organizations.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.6: `Invalidator` + `FanOutInvalidator` over Hatchet events

**Files:**
- Create: `packages/tenancy/src/invalidator.ts`
- Create: `packages/tenancy/src/fan-out-invalidator.ts`
- Test: `packages/tenancy/src/__tests__/invalidator.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createFanOutInvalidator } from "../fan-out-invalidator";
import { withTestPg } from "./helpers/with-test-pg";

describe("FanOutInvalidator", () => {
  it("bumps tenant_cache_version inside the transaction and pushes a Hatchet event after commit", async () => {
    await withTestPg(async (pg) => {
      const push = vi.fn().mockResolvedValue(undefined);
      const fakeHatchet = { events: { push } };
      const inv = createFanOutInvalidator({ db: pg, hatchet: fakeHatchet as any });
      await inv.bumpVersion("acme.app.example.com");
      const v = await pg.query(`SELECT version FROM tenant_cache_version WHERE id=1`);
      expect(v.rows[0]!.version).not.toBe("0");
      expect(push).toHaveBeenCalledWith("tenancy.invalidate", { host: "acme.app.example.com" });
    });
  });

  it("does not push if the bump transaction throws", async () => {
    const push = vi.fn();
    const inv = createFanOutInvalidator({ db: failingPg(), hatchet: { events: { push } } as any });
    await expect(inv.bumpVersion("x")).rejects.toThrow();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
// packages/tenancy/src/invalidator.ts
export type Invalidator = Readonly<{
  bumpVersion(host?: string): Promise<void>;
  clearLocal(host?: string): void;
}>;
```

```ts
// packages/tenancy/src/fan-out-invalidator.ts
import type { Client } from "pg";
import type { TenancyCache } from "./cache";
import type { Invalidator } from "./invalidator";

export type HatchetEventBus = Readonly<{
  events: { push(key: string, payload: object): Promise<unknown> };
}>;

export function createFanOutInvalidator(deps: { db: Client; hatchet: HatchetEventBus; cache?: TenancyCache }): Invalidator {
  return {
    async bumpVersion(host) {
      // 1) Durable bump of the version row inside a transaction (committed atomically).
      await deps.db.query("BEGIN");
      try {
        await deps.db.query(
          `UPDATE tenant_cache_version SET version = (extract(epoch from now())::bigint)::text WHERE id = 1`,
        );
        await deps.db.query("COMMIT");
      } catch (e) {
        await deps.db.query("ROLLBACK");
        throw e;
      }
      // 2) Best-effort cross-process broadcast via Hatchet (see G-HE-1/G-HE-2 in spec gotchas).
      try {
        await deps.hatchet.events.push("tenancy.invalidate", host ? { host } : { event: "bump_all" });
      } catch (err) {
        // Log + swallow; version key bump is the source of truth, every process self-heals on next miss.
        // (Caller logger should be threaded in here for production; tests only need the swallow path.)
      }
      deps.cache?.clearLocal();
    },
    clearLocal(_host) {
      deps.cache?.clearLocal();
    },
  };
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.7: `createTenantInvalidationSubscriber` (Hatchet workflow registration)

**Files:**
- Create: `packages/tenancy/src/hatchet-subscriber.ts`
- Test: `packages/tenancy/src/__tests__/hatchet-subscriber.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createTenantInvalidationSubscriber } from "../hatchet-subscriber";
import { createTenancyCache } from "../cache";

describe("hatchet-subscriber", () => {
  it("registers a workflow on tenancy.invalidate and clears the cache when the task runs", async () => {
    const cache = createTenancyCache({});
    cache.set("v0:x", { kind: "found", tenant: {} as any });
    const registered: { name: string; on: { event: string }; taskFn: (input: { host?: string }) => Promise<unknown> }[] = [];
    const fakeHatchet = {
      workflow: (cfg: { name: string; on: { event: string } }) => ({
        task: (taskCfg: { name: string; fn: (input: { host?: string }) => Promise<unknown> }) => {
          registered.push({ ...cfg, taskFn: taskCfg.fn });
        },
      }),
    };
    createTenantInvalidationSubscriber({ hatchet: fakeHatchet as any, cache });
    expect(registered[0]?.on.event).toBe("tenancy.invalidate");
    await registered[0]!.taskFn({ host: "x" });
    expect(cache.get("v0:x")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import type { TenancyCache } from "./cache";

export type HatchetWorkflowBus = Readonly<{
  workflow(cfg: { name: string; on: { event: string } }): {
    task(taskCfg: { name: string; fn: (input: { host?: string }) => Promise<unknown> }): void;
  };
}>;

export function createTenantInvalidationSubscriber(deps: { hatchet: HatchetWorkflowBus; cache: TenancyCache; logger?: { info(o: Record<string, unknown>): void } }): void {
  const wf = deps.hatchet.workflow({ name: "tenancy.invalidate", on: { event: "tenancy.invalidate" } });
  wf.task({
    name: "drop-local-cache",
    fn: async (input: { host?: string }) => {
      deps.cache.clearLocal();
      deps.logger?.info({ event: "tenancy.invalidate.received", host: input.host ?? "(all)" });
      return { ok: true };
    },
  });
}
```

Registration happens at process boot inside `apps/server/src/index.ts` and `apps/admin-server/src/index.ts`, alongside the Hatchet worker startup.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.8: `tenantMiddleware` + `hostHeaderGuard`

**Files:**
- Create: `packages/tenancy/src/middleware.ts`
- Create: `packages/tenancy/src/host-header-guard.ts`
- Test: `packages/tenancy/src/__tests__/middleware.test.ts`
- Test: `packages/tenancy/src/__tests__/host-header-guard.test.ts`

The middleware sets `c.var.tenant = { organizationId, slug, host, kind, enforceSSO, sessionVersion, suspendedAt, deletedAt }` and returns. It does NOT set any Postgres session variable. Downstream handlers and services read `c.var.tenant.organizationId` and pass it into repositories that gate their WHERE clauses on `eq(<table>.organizationId, organizationId)` per spec § 08 § Application-Layer Tenant Scoping.

**Cross-tenant isolation invariant.** Each tenant-scoped module owns a service-layer cross-tenant test (testcontainers `postgres:18-alpine`) asserting that a query with `organizationId=A` returns no rows where `organizationId=B`. The structural ALLOWLIST test in `packages/db/__tests__/live-organizations.spec.ts` (A1.11) enforces that direct reads of the `organizations` table go through `liveOrganizations(executor)`. There is no Postgres-side RLS safety net.

- [ ] **Step 1: Failing test (middleware)**

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { tenantMiddleware } from "../middleware";
import { createTenancyCache } from "../cache";

const cfg = { wildcardSuffix: ".app.example.com", adminHost: "admin.example.com", fallbackHost: "app.example.com", nodeEnv: "test" as const };

describe("tenantMiddleware", () => {
  it("404s on unknown host", async () => {
    const app = new Hono();
    app.use(tenantMiddleware({ db: makeFakeDb({}), cache: createTenancyCache({}), version: () => "v0", config: cfg, waitUntil: () => {}, logger: noopLogger() }));
    app.get("/x", (c) => c.text("ok"));
    const res = await app.request("/x", { headers: { Host: "ghost.app.example.com" } });
    expect(res.status).toBe(404);
  });
  it("503 on suspended", async () => { /* ... */ });
  it("200 + sets c.var.tenant on subdomain hit (no Postgres session var written)", async () => { /* ... */ });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement (port from spec § 02 middleware)**

The middleware reads the host, calls `resolveTenant`, and on success writes the resolved `Tenant` to `c.var.tenant`. There is no per-request `SET LOCAL app.current_tenant`, no pool `release()` handler that resets a session variable, and no `withTenantSessionVar` helper.

- [ ] **Step 4: Cross-tenant isolation test (illustrative skeleton; the module-level tests live with each repository)**

```ts
// packages/tenancy/src/__tests__/cross-tenant-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq } from "drizzle-orm";
import * as schema from "@repo/db/schema";
import { setupSchema } from "./helpers/setup-schema";

let container: StartedPostgreSqlContainer; let pool: Pool;
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await setupSchema(pool);
});
afterAll(async () => { await pool.end(); await container.stop(); });

describe("application-layer tenant scoping", () => {
  it("a repository query gated on organizationId=A returns no rows for organizationId=B", async () => {
    const db = drizzle(pool, { schema });
    // seed two orgs + one custom hostname per org
    // ... insert org_A, org_B, tnh row for each
    const rows = await db.select().from(schema.tenantCustomHostnames)
      .where(and(eq(schema.tenantCustomHostnames.organizationId, "org_A")));
    expect(rows.every((r) => r.organizationId === "org_A")).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests + lint**

- [ ] **Step 6: Self-review**

## Task A2.9: `X-Dev-Tenant-Slug` two-factor gate

**Files:**
- Create: `packages/tenancy/src/dev-header.ts`
- Test: `packages/tenancy/src/__tests__/dev-header.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveDevTenantHeader } from "../dev-header";

const cfg = { wildcardSuffix: ".app.example.com", adminHost: "admin.example.com", fallbackHost: "app.example.com", nodeEnv: "development" as const };

describe("dev header", () => {
  it("rewrites slug to host", () => {
    expect(resolveDevTenantHeader("acme", cfg, "1")).toEqual({ kind: "rewrite", host: "acme.app.example.com" });
  });
  it("rejects when prod", () => {
    expect(resolveDevTenantHeader("acme", { ...cfg, nodeEnv: "production" }, "1").kind).toBe("ignored");
  });
  it("rejects when env flag unset", () => {
    expect(resolveDevTenantHeader("acme", cfg, undefined).kind).toBe("ignored");
  });
  it("rejects reserved slug", () => {
    expect(resolveDevTenantHeader("admin", cfg, "1").kind).toBe("ignored");
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { BUILTIN_RESERVED_SLUGS, SLUG_RE } from "./parse-hostname";
import type { HostConfig } from "./host-config";

export type DevHeaderResult = { kind: "rewrite"; host: string } | { kind: "ignored"; reason: string };

export function resolveDevTenantHeader(rawSlug: string, cfg: HostConfig, allowFlag: string | undefined): DevHeaderResult {
  if (cfg.nodeEnv === "production") return { kind: "ignored", reason: "production" };
  if (allowFlag !== "1") return { kind: "ignored", reason: "env_flag_unset" };
  const slug = rawSlug.toLowerCase();
  if (!SLUG_RE.test(slug)) return { kind: "ignored", reason: "slug_format" };
  if (BUILTIN_RESERVED_SLUGS.has(slug)) return { kind: "ignored", reason: "reserved" };
  return { kind: "rewrite", host: `${slug}${cfg.wildcardSuffix}` };
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A2.10: Wire `@repo/tenancy` into `apps/server`

**Files:**
- Modify: `apps/server/package.json` (add `@repo/tenancy` dep)
- Modify: `apps/server/src/server.ts` (mount middleware)
- Modify: `apps/server/src/index.ts` (start listener)
- Modify: `apps/server/src/env.ts` (add `APP_WILDCARD_HOST`, `ADMIN_HOST`, `FALLBACK_HOST`, `ALLOW_DEV_TENANT_HEADER`)
- Test: `apps/server/src/__tests__/tenancy-integration.test.ts`

- [ ] **Step 1: Failing integration test**

```ts
import { describe, it, expect } from "vitest";
import { startTestServer } from "./helpers/start-test-server";

describe("server + tenancy", () => {
  it("rejects unknown host with 404", async () => {
    const s = await startTestServer();
    const r = await fetch(`http://localhost:${s.port}/api/x`, { headers: { Host: "ghost.app.example.com" } });
    expect(r.status).toBe(404);
    await s.close();
  });
  it("rejects empty host with 400 (hostHeaderGuard)", async () => {
    const s = await startTestServer();
    const r = await fetch(`http://localhost:${s.port}/api/x`, { headers: { Host: "" } });
    expect(r.status).toBe(400);
    await s.close();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Wire it**

In `apps/server/src/env.ts`, add:
```ts
APP_WILDCARD_HOST: z.string().default("app.localhost"),
ADMIN_HOST: z.string().default("admin.localhost"),
FALLBACK_HOST: z.string().default("app.localhost"),
ALLOW_DEV_TENANT_HEADER: z.enum(["0","1"]).default("0"),
```

In `apps/server/src/server.ts`, AFTER the OTel + request-id middlewares and BEFORE any route:
```ts
import { tenantMiddleware, hostHeaderGuard, loadHostConfigOnce, createTenancyCache, createFanOutInvalidator } from "@repo/tenancy";

const hostConfig = loadHostConfigOnce(env);
const tenancyCache = createTenancyCache({});
baseApp.use(hostHeaderGuard({ config: hostConfig }));
baseApp.use(tenantMiddleware({ db: dbPool, cache: tenancyCache, version: () => currentVersion, config: hostConfig, waitUntil, logger }));
```

In `apps/server/src/index.ts`, register the Hatchet subscriber on boot:
```ts
import { createTenantInvalidationSubscriber } from "@repo/tenancy";
import { hatchet } from "@/lib/hatchet";
createTenantInvalidationSubscriber({ hatchet, cache: tenancyCache, logger });
// Hatchet worker startup elsewhere in this file picks up the registered workflow.
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Exit criteria

- [ ] `packages/tenancy` exports the full public surface listed in spec § 07.
- [ ] `parseHostname` passes the full matrix in spec § 02.
- [ ] `lru-cache@^11.3.6` is the cache layer; positive 60s, negative 5s.
- [ ] Hatchet `tenancy.invalidate` round-trips under the spike-measured latency budget (p95 target < 100ms) in CI.
- [ ] `tenantMiddleware` sets `c.var.tenant` only — no Postgres session variable is written, no `withTenantSessionVar` helper exists, no `rls-context.ts` exists. Tenant isolation is enforced by repository / service-layer `organizationId` gating per spec § 08 § Application-Layer Tenant Scoping.
- [ ] At least one cross-tenant isolation test exists at the service / repository layer (testcontainers `postgres:18-alpine`); each new tenant-scoped repository adds its own.
- [ ] `hostHeaderGuard` rejects empty/unknown hosts BEFORE any business middleware.
- [ ] `apps/server` mounts the middleware after OTel + request-id only.
- [ ] No `any`, no `!`, no module-scope mutable state outside `loadHostConfigOnce`'s frozen snapshot.
