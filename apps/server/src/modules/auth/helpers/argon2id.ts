import { hash, verify } from "@node-rs/argon2";
import { env } from "@/env";

export const hashPassword = async (password: string) =>
  await hash(password, {
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    secret: Buffer.from(env.BETTER_AUTH_SECRET, "utf-8"),
    timeCost: 2,
  });

export const verifyPasswordHash = async (hashStr: string, password: string) =>
  await verify(hashStr, password, {
    secret: Buffer.from(env.BETTER_AUTH_SECRET, "utf-8"),
  });
