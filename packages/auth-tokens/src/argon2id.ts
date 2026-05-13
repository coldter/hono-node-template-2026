/**
 * Argon2id password hasher factory shared by the tenant and operator
 * perimeters. Parameters follow OWASP's argon2id guidance and are pinned
 * here so both perimeters produce hashes of identical format; only the
 * `secret` differs.
 *
 * Why a factory: the caller-supplied `secret` is per-perimeter (tenant has
 * `BETTER_AUTH_SECRET`, admin has `OPERATOR_BETTER_AUTH_SECRET`) so a
 * leak in one cannot mint sessions in the other. The factory closes over
 * the secret and returns the same `{ hash, verify }` shape Better Auth's
 * `emailAndPassword.password` expects.
 *
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
 */

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

const ARGON2ID_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export type Argon2idHasher = Readonly<{
  hash: (password: string) => Promise<string>;
  verify: (params: { hash: string; password: string }) => Promise<boolean>;
}>;

export function buildArgon2idHasher(secret: string): Argon2idHasher {
  // Lazy buffer construction: callers (e.g. helpers/argon2id.ts) build
  // the hasher at module-load time, when `env.*` may not yet be
  // populated (Vitest setup, scripts). Computing the buffer on first
  // call keeps the API ergonomic without forcing every caller to defer.
  let secretBuf: Buffer | null = null;
  function getSecretBuf(): Buffer {
    if (secretBuf === null) {
      secretBuf = Buffer.from(secret, "utf-8");
    }
    return secretBuf;
  }
  return {
    hash: (password) =>
      argon2Hash(password, { ...ARGON2ID_OPTIONS, secret: getSecretBuf() }),
    verify: ({ hash, password }) =>
      argon2Verify(hash, password, { secret: getSecretBuf() }),
  };
}
