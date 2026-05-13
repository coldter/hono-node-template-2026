import { describe, expect, it, vi } from "vitest";

// The global setup.ts mocks @repo/tenancy middlewares with pass-through stubs.
// We use vi.importActual to load the REAL implementations here.

describe("server + tenancy wiring", () => {
  it("400 on empty Host header (hostHeaderGuard)", async () => {
    const real =
      await vi.importActual<typeof import("@repo/tenancy")>("@repo/tenancy");

    const config = real.loadHostConfig({
      APP_WILDCARD_HOST: "app.localhost",
      ADMIN_HOST: "admin.localhost",
      FALLBACK_HOST: "app.localhost",
      NODE_ENV: "test",
    });

    const guard = real.hostHeaderGuard({ config });

    let capturedStatus: number | undefined;
    // boundary: vendor-SDK generic variance — Hono's `Context<E>` is invariant
    // in its env generic and exposes a large surface; the guard only reads
    // `req.header` / writes via `text`. Structural stub matches the call sites.
    const ctx = {
      req: { header: (_: string) => "" },
      text: (body: string, status: number) => {
        capturedStatus = status;
        return new Response(body, { status });
      },
    } as unknown as Parameters<typeof guard>[0];

    const result = await guard(ctx, async () => undefined);
    expect(result).toBeInstanceOf(Response);
    expect(capturedStatus).toBe(400);
  });

  it("404 on unknown subdomain (tenantMiddleware)", async () => {
    const real =
      await vi.importActual<typeof import("@repo/tenancy")>("@repo/tenancy");

    const config = real.loadHostConfig({
      APP_WILDCARD_HOST: "app.localhost",
      ADMIN_HOST: "admin.localhost",
      FALLBACK_HOST: "app.localhost",
      NODE_ENV: "test",
    });

    const cache = real.createTenancyCache({});
    // boundary: vendor-SDK generic variance — `pg.Pool` carries connection /
    // typed-query generics our minimal stub cannot reproduce; mimics
    // SKIP_DB=true mode by always returning empty rows.
    const stubDb = {
      query: () =>
        Promise.resolve({
          rows: [],
          rowCount: 0,
          command: "",
          oid: 0,
          fields: [],
        }),
    } as unknown as Parameters<typeof real.tenantMiddleware>[0]["db"];

    const mw = real.tenantMiddleware({
      db: stubDb,
      cache,
      config,
      waitUntil: (p) => {
        p.catch(() => undefined);
      },
    });

    let capturedStatus: number | undefined;
    // boundary: vendor-SDK generic variance — see Hono Context note above.
    const ctx = {
      req: { header: (_: string) => "ghost.app.localhost" },
      text: (body: string, status: number) => {
        capturedStatus = status;
        return new Response(body, { status });
      },
      set: (_key: string, _val: unknown) => undefined,
    } as unknown as Parameters<typeof mw>[0];

    const result = await mw(ctx, async () => undefined);
    expect(result).toBeInstanceOf(Response);
    expect(capturedStatus).toBe(404);
  });
});
