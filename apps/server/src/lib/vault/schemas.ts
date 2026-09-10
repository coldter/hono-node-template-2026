import { createHash } from "node:crypto";
import { z } from "zod";
import type { VaultSchema } from "./types";

export type ApiKeyMetadataValue =
  | boolean
  | null
  | number
  | string
  | ApiKeyMetadataValue[]
  | { [key: string]: ApiKeyMetadataValue };

export type ApiKeyMetadata = { [key: string]: ApiKeyMetadataValue };

export interface ApiKeyData {
  readonly key: string;
  readonly metadata?: ApiKeyMetadata;
  readonly scopes: readonly string[];
}

const apiKeyMetadataValueSchema: z.ZodType<ApiKeyMetadataValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number(),
    z.string(),
    z.array(apiKeyMetadataValueSchema),
    z.record(z.string(), apiKeyMetadataValueSchema),
  ])
);

const apiKeyDataSchema = z.object({
  key: z.string(),
  metadata: z.record(z.string(), apiKeyMetadataValueSchema).optional(),
  scopes: z.array(z.string()),
}) satisfies z.ZodType<ApiKeyData>;

export const apiKeySchema: VaultSchema<ApiKeyData> = createSchema<ApiKeyData>({
  description: "API key with scopes and metadata",
  fingerprint: (data) => createHash("sha256").update(data.key).digest("hex"),
  id: "api-key",
  schema: apiKeyDataSchema,
});

export interface SecretData {
  readonly type?: string;
  readonly value: string;
}

const secretDataSchema = z.object({
  type: z.string().optional(),
  value: z.string(),
}) satisfies z.ZodType<SecretData>;

export const secretSchema: VaultSchema<SecretData> = createSchema<SecretData>({
  description: "Generic secret value",
  id: "secret",
  schema: secretDataSchema,
});

export function createSchema<T>(config: {
  id: string;
  description: string;
  fingerprint?: (data: T) => string;
  validate?: (data: T) => void;
  schema: z.ZodType<T>;
}): VaultSchema<T> {
  return {
    description: config.description,
    deserialize: (plaintext: string): T =>
      config.schema.parse(JSON.parse(plaintext)),
    fingerprint: config.fingerprint,
    id: config.id,
    serialize: (data: T): string => JSON.stringify(data),
    validate: config.validate,
  };
}
