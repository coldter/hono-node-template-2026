import { hash, verify } from "@node-rs/argon2";
import { env } from "@/env";
/**
 * Hashes a password using argon2id with a secret for enhanced security.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
 *
 * @param password - Plain-text password to be hashed.
 * @returns A hashed password.
 */
export const hashPassword = async (password: string) =>
  await hash(password, {
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    secret: Buffer.from(env.BETTER_AUTH_SECRET, "utf-8"),
    timeCost: 2,
  });

/**
 * Verifies if a password matches its hash using argon2id and a secret.
 *
 * @param hash - Stored password hash.
 * @param password - Plain-text password to verify.
 * @returns Boolean(is password matches the hash)
 */
export const verifyPasswordHash = async (hashStr: string, password: string) =>
  await verify(hashStr, password, {
    secret: Buffer.from(env.BETTER_AUTH_SECRET, "utf-8"),
  });
