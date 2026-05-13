/**
 * Argon2id password helper for the operator perimeter. Thin wrapper that
 * binds `OPERATOR_BETTER_AUTH_SECRET` to the shared `buildArgon2idHasher`.
 * Operator perimeter uses a separate BA secret so a leak in one perimeter
 * cannot mint sessions in the other. See `@repo/auth-tokens/argon2id`
 * for OWASP parameter rationale.
 */

import { buildArgon2idHasher } from "@repo/auth-tokens";
import { env } from "@/env";

const hasher = buildArgon2idHasher(env.OPERATOR_BETTER_AUTH_SECRET);

export const hashPassword = hasher.hash;
