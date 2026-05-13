/**
 * Argon2id password helper for the tenant perimeter. Thin wrapper that
 * binds `BETTER_AUTH_SECRET` to the shared `buildArgon2idHasher`. See
 * `@repo/auth-tokens/argon2id` for OWASP parameter rationale.
 */

import { buildArgon2idHasher } from "@repo/auth-tokens";
import { env } from "@/env";

const hasher = buildArgon2idHasher(env.BETTER_AUTH_SECRET);

export const hashPassword = hasher.hash;
