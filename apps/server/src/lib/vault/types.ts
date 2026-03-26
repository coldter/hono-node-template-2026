/**
 * Vault Service Types
 *
 * Type-safe, secure data encryption with excellent developer experience.
 *
 * @module
 */

// ============================================================
// CORE ENCRYPTION TYPES
// ============================================================

/**
 * Encrypted envelope containing ciphertext and metadata.
 * This is the serialized format stored in the database.
 */
export interface EncryptedEnvelope {
  /** Algorithm identifier */
  readonly alg: "aes-256-gcm";
  /** Base64-encoded ciphertext (includes IV + auth tag + encrypted data) */
  readonly ct: string;
  /** Key ID for multi-key support (optional) */
  readonly kid?: string;
  /** Created timestamp */
  readonly ts: number;
  /** Version for migration support */
  readonly v: 1;
}

/**
 * Serialized encrypted envelope for database storage.
 */
export type SerializedEnvelope = string;

// ============================================================
// VAULT SCHEMA TYPES
// ============================================================

/**
 * Schema definition for vault-encrypted data types.
 * Provides type-safe encryption with validation.
 *
 * @template T - The data type being encrypted
 */
export interface VaultSchema<T> {
  /** Human-readable description */
  readonly description: string;
  /** Deserialize decrypted string back to data */
  deserialize(plaintext: string): T;
  /** Optional: Generate a fingerprint for duplicate detection */
  fingerprint?(data: T): string;
  /** Unique schema identifier (e.g., "card-profile", "api-key") */
  readonly id: string;
  /** Serialize data to string for encryption */
  serialize(data: T): string;
  /** Optional: Validate data before encryption */
  validate?(data: T): void;
}

// ============================================================
// ENCRYPTION PROVIDER INTERFACE
// ============================================================

/**
 * Low-level encryption provider interface.
 * Implement this for different key management solutions.
 */
export interface EncryptionProvider {
  /**
   * Decrypt raw bytes.
   * @param envelope - Encrypted envelope
   * @returns Decrypted data
   */
  decrypt(envelope: EncryptedEnvelope): Promise<Buffer>;

  /**
   * Encrypt raw bytes.
   * @param plaintext - Data to encrypt
   * @returns Encrypted envelope
   */
  encrypt(plaintext: Buffer): Promise<EncryptedEnvelope>;

  /**
   * Get current key ID (for multi-key support).
   */
  getKeyId(): string | undefined;

  /**
   * Check if provider is properly configured.
   */
  isConfigured(): boolean;
  /** Provider identifier */
  readonly name: string;
}

// ============================================================
// VAULT RESULT TYPES
// ============================================================

/**
 * Result of encrypting data through the vault.
 *
 * @template T - Original data type
 */
export interface VaultEncryptResult<T> {
  /** Original data (for chaining operations) */
  readonly data: T;
  /** Serialized envelope for database storage */
  readonly encrypted: SerializedEnvelope;
  /** Optional fingerprint for duplicate detection */
  readonly fingerprint?: string;
  /** SHA-256 hash for integrity verification */
  readonly hash: string;
}

/**
 * Result of decrypting data through the vault.
 *
 * @template T - Decrypted data type
 */
export interface VaultDecryptResult<T> {
  /** Decrypted data */
  readonly data: T;
  /** Envelope metadata */
  readonly metadata: {
    readonly version: number;
    readonly algorithm: string;
    readonly keyId?: string;
    readonly createdAt: Date;
  };
  /** Schema used for decryption */
  readonly schema: string;
}

// ============================================================
// PROVIDER CONFIGURATION
// ============================================================

/**
 * Local provider config (development/testing).
 */
export interface LocalProviderConfig {
  /** Optional: Key ID for multi-key support */
  readonly keyId?: string;
  /** 32-byte hex-encoded master key (64 hex chars) */
  readonly masterKey: string;
  readonly provider: "local";
}

/**
 * AWS KMS provider config (production).
 */
export interface AwsKmsProviderConfig {
  /** KMS key ARN or alias */
  readonly keyArn: string;
  readonly provider: "aws-kms";
  /** AWS region */
  readonly region: string;
}

/**
 * GCP KMS provider config (production).
 */
export interface GcpKmsProviderConfig {
  /** Full resource name of the key */
  readonly keyName: string;
  readonly provider: "gcp-kms";
}

/**
 * Azure Key Vault provider config (production).
 */
export interface AzureKeyVaultProviderConfig {
  /** Key name */
  readonly keyName: string;
  readonly provider: "azure-keyvault";
  /** Key Vault URL */
  readonly vaultUrl: string;
}

/**
 * Union of all provider configurations.
 */
export type ProviderConfig =
  | LocalProviderConfig
  | AwsKmsProviderConfig
  | GcpKmsProviderConfig
  | AzureKeyVaultProviderConfig;

// ============================================================
// VAULT OPTIONS
// ============================================================

/**
 * Options for vault operations.
 */
export interface VaultOptions {
  /** Include fingerprint in result (if schema supports it) */
  includeFingerprint?: boolean;
}

// ============================================================
// TYPE GUARDS
// ============================================================

/**
 * Type guard for local provider config.
 */
export function isLocalConfig(
  config: ProviderConfig
): config is LocalProviderConfig {
  return config.provider === "local";
}

/**
 * Type guard for AWS KMS provider config.
 */
export function isAwsKmsConfig(
  config: ProviderConfig
): config is AwsKmsProviderConfig {
  return config.provider === "aws-kms";
}

/**
 * Type guard for GCP KMS provider config.
 */
export function isGcpKmsConfig(
  config: ProviderConfig
): config is GcpKmsProviderConfig {
  return config.provider === "gcp-kms";
}

/**
 * Type guard for Azure Key Vault provider config.
 */
export function isAzureKeyVaultConfig(
  config: ProviderConfig
): config is AzureKeyVaultProviderConfig {
  return config.provider === "azure-keyvault";
}

/**
 * Validate that a value is a valid encrypted envelope.
 */
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
