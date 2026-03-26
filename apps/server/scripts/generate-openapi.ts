process.env.SKIP_DB = "true";

/**
 * Generate OpenAPI documentation and save it to a file.
 *
 * This script initializes the OpenAPI documentation for the application,
 * registers necessary schemas, and writes the generated OpenAPI document
 * to a JSON file.
 */
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
