/**
 * Vault Service Types
 *
 * @module
 */

/**
 * Encrypted envelope containing ciphertext and metadata.
 * This is the serialized format stored in the database.
 */
export interface EncryptedEnvelope {
  readonly alg: "aes-256-gcm";
  /** Base64-encoded ciphertext (includes IV + auth tag + encrypted data) */
  readonly ct: string;
  readonly kid?: string;
  readonly ts: number;
  readonly v: 1;
}

/**
 * Serialized encrypted envelope for database storage.
 */
export type SerializedEnvelope = string;

/**
 * Schema definition for vault-encrypted data types.
 * Provides type-safe encryption with validation.
 *
 * @template T - The data type being encrypted
 */
export interface VaultSchema<T> {
  readonly description: string;
  deserialize: (plaintext: string) => T;
  fingerprint?: (data: T) => string;
  /** Unique schema identifier (e.g., "card-profile", "api-key") */
  readonly id: string;
  serialize: (data: T) => string;
  validate?: (data: T) => void;
}

/**
 * Low-level encryption provider interface.
 * Implement this for different key management solutions.
 */
export interface EncryptionProvider {
  decrypt: (envelope: EncryptedEnvelope) => Promise<Buffer>;
  encrypt: (plaintext: Buffer) => Promise<EncryptedEnvelope>;
  getKeyId: () => string | undefined;
  isConfigured: () => boolean;
  readonly name: string;
}

export interface VaultEncryptResult<T> {
  readonly data: T;
  readonly encrypted: SerializedEnvelope;
  readonly fingerprint?: string;
  /** SHA-256 hash for integrity verification */
  readonly hash: string;
}

export interface VaultDecryptResult<T> {
  readonly data: T;
  readonly metadata: {
    readonly version: number;
    readonly algorithm: string;
    readonly keyId?: string;
    readonly createdAt: Date;
  };
  readonly schema: string;
}

export interface LocalProviderConfig {
  readonly keyId?: string;
  /** 32-byte hex-encoded master key (64 hex chars) */
  readonly masterKey: string;
  readonly provider: "local";
}

export interface AwsKmsProviderConfig {
  /** KMS key ARN or alias */
  readonly keyArn: string;
  readonly provider: "aws-kms";
  readonly region: string;
}

export interface GcpKmsProviderConfig {
  /** Full resource name of the key */
  readonly keyName: string;
  readonly provider: "gcp-kms";
}

export interface AzureKeyVaultProviderConfig {
  readonly keyName: string;
  readonly provider: "azure-keyvault";
  /** Key Vault URL */
  readonly vaultUrl: string;
}

export type ProviderConfig =
  | LocalProviderConfig
  | AwsKmsProviderConfig
  | GcpKmsProviderConfig
  | AzureKeyVaultProviderConfig;

export interface VaultOptions {
  /** Include fingerprint in result (if schema supports it) */
  includeFingerprint?: boolean;
}

export function isLocalConfig(
  config: ProviderConfig
): config is LocalProviderConfig {
  return config.provider === "local";
}

export function isAwsKmsConfig(
  config: ProviderConfig
): config is AwsKmsProviderConfig {
  return config.provider === "aws-kms";
}

export function isGcpKmsConfig(
  config: ProviderConfig
): config is GcpKmsProviderConfig {
  return config.provider === "gcp-kms";
}

export function isAzureKeyVaultConfig(
  config: ProviderConfig
): config is AzureKeyVaultProviderConfig {
  return config.provider === "azure-keyvault";
}

export function isValidEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const envelope = value as Record<string, unknown>;
  return (
    envelope.v === 1 &&
    envelope.alg === "aes-256-gcm" &&
    typeof envelope.ct === "string" &&
    typeof envelope.ts === "number"
  );
}
