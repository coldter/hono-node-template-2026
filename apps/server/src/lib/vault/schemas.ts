import { createHash } from "node:crypto";

import type { VaultSchema } from "./types";

export interface ApiKeyData {
  readonly key: string;
  readonly metadata?: Record<string, unknown>;
  readonly scopes: readonly string[];
}

export const apiKeySchema: VaultSchema<ApiKeyData> = {
  id: "api-key",
  description: "API key with scopes and metadata",

  serialize: (data: ApiKeyData): string => JSON.stringify(data),

  deserialize: (plaintext: string): ApiKeyData =>
    JSON.parse(plaintext) as ApiKeyData,

  fingerprint: (data: ApiKeyData): string =>
    createHash("sha256").update(data.key).digest("hex"),
};

export interface SecretData {
  readonly type?: string;
  readonly value: string;
}

export const secretSchema: VaultSchema<SecretData> = {
  id: "secret",
  description: "Generic secret value",

  serialize: (data: SecretData): string => JSON.stringify(data),

  deserialize: (plaintext: string): SecretData =>
    JSON.parse(plaintext) as SecretData,
};

export function createSchema<T>(config: {
  id: string;
  description: string;
  fingerprint?: (data: T) => string;
  validate?: (data: T) => void;
}): VaultSchema<T> {
  return {
    id: config.id,
    description: config.description,
    serialize: (data: T): string => JSON.stringify(data),
    deserialize: (plaintext: string): T => JSON.parse(plaintext) as T,
    fingerprint: config.fingerprint,
    validate: config.validate,
  };
}
