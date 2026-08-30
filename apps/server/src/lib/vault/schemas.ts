import { createHash } from "node:crypto";

import type { VaultSchema } from "./types";

export interface ApiKeyData {
  readonly key: string;
  readonly metadata?: Record<string, unknown>;
  readonly scopes: readonly string[];
}

export const apiKeySchema: VaultSchema<ApiKeyData> = {
  description: "API key with scopes and metadata",

  deserialize: (plaintext: string): ApiKeyData =>
    JSON.parse(plaintext) as ApiKeyData,

  fingerprint: (data: ApiKeyData): string =>
    createHash("sha256").update(data.key).digest("hex"),
  id: "api-key",

  serialize: (data: ApiKeyData): string => JSON.stringify(data),
};

export interface SecretData {
  readonly type?: string;
  readonly value: string;
}

export const secretSchema: VaultSchema<SecretData> = {
  description: "Generic secret value",

  deserialize: (plaintext: string): SecretData =>
    JSON.parse(plaintext) as SecretData,
  id: "secret",

  serialize: (data: SecretData): string => JSON.stringify(data),
};

export function createSchema<T>(config: {
  id: string;
  description: string;
  fingerprint?: (data: T) => string;
  validate?: (data: T) => void;
}): VaultSchema<T> {
  return {
    description: config.description,
    deserialize: (plaintext: string): T => JSON.parse(plaintext) as T,
    fingerprint: config.fingerprint,
    id: config.id,
    serialize: (data: T): string => JSON.stringify(data),
    validate: config.validate,
  };
}
