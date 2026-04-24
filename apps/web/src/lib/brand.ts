import { getBrandConfig } from "@repo/shared/brand";

/**
 * Brand configuration resolved from `VITE_*` env vars at build time.
 *
 * Edit `apps/web/.env` (or the root `.env.production`) to rebrand the app
 * without touching source files.
 */
export const brand = getBrandConfig(
  import.meta.env as Record<string, string | undefined>
);
