process.env.SKIP_DB = "true";
process.env.DATABASE_URL ??= "postgres://localhost:5432/openapi";
process.env.CORS_ORIGIN ??= "http://localhost:3001";
process.env.BETTER_AUTH_SECRET ??=
  "openapi-generation-secret-openapi-generation-secret";
process.env.VAULT_MASTER_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

(async () => {
  try {
    const [{ app }, { docs }] = await Promise.all([
      import("../src/routers/main"),
      import("../src/lib/docs"),
    ]);

    await docs(app, true, true);
    process.exit(0);
  } catch (err) {
    console.error("Failed to generate fresh OpenAPI cache");
    if (err instanceof Error) {
      console.error(err.stack || err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
})();
