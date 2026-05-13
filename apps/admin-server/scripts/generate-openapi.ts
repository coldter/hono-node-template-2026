process.env.SKIP_DB = "true";
process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL ??= "postgres://localhost:5432/openapi";
process.env.OPERATOR_BETTER_AUTH_SECRET ??=
  "admin-openapi-generation-secret-admin-openapi-secret";

/**
 * Generate the admin-server OpenAPI cache file consumed by `apps/admin-ui`'s
 * `@hey-api/openapi-ts` codegen. Operator-perimeter only — never mixes
 * tenant routes.
 *
 * The DB-backed routers (`tenants`, `enroll`) mount with stub deps so the
 * route registry populates without booting Postgres. The handlers themselves
 * are never invoked at generation time; the doc snapshot reads OpenAPI
 * metadata from `createRoute`.
 */
import type { Invalidator } from "@repo/tenancy";
import { makeDrizzleStub } from "@repo/test-harness";

(async () => {
  try {
    const [{ app }, { mountAppRoutes }, { docs }] = await Promise.all([
      import("../src/routers/main"),
      import("../src/routers/main"),
      import("../src/lib/docs"),
    ]);

    // Structural stubs satisfy the deps shape for registration. The doc
    // generator never invokes the handlers, so the stub functions are
    // unreachable in this path.
    const stubDb = makeDrizzleStub({});
    const stubInvalidator: Invalidator = {
      bumpDurable: async () => undefined,
      broadcast: async () => undefined,
    };

    mountAppRoutes({
      tenants: {
        db: stubDb,
        invalidator: stubInvalidator,
        resolveHost: (row) => row.slug ?? row.id,
      },
      enroll: {
        db: stubDb,
        hashPassword: async () => "",
      },
    });

    await docs(app, true, true);
    process.exit(0);
  } catch (err) {
    console.error("Failed to generate admin-server OpenAPI cache");
    if (err instanceof Error) {
      console.error(err.stack || err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
})();
