/**
 * Dev-only seed fixtures.
 *
 * SECURITY: `defaultAdminUser` is a hardcoded credential committed to the
 * repository. It must NEVER be inserted in non-development environments.
 * Consumers (`users/seed.ts`) gate insertion behind `NODE_ENV === "development"`
 * AND `SEED_DEV_FIXTURES=1`. Do not add new credential fixtures without the
 * same opt-in.
 */
export const defaultAdminUser = {
  password: "admin123456",
  email: "admin@example.com",
  name: "Admin User",
};
