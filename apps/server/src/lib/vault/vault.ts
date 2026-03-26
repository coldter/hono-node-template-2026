import {
  hashData,
  LocalEncryptionProvider,
  timingSafeHashCompare,
} from "./local-provider";
import {
  type EncryptedEnvelope,
  type EncryptionProvider,
  isValidEnvelope,
  type ProviderConfig,
  type SerializedEnvelope,
  type VaultDecryptResult,
  type VaultEncryptResult,
  type VaultOptions,
  type VaultSchema,
} from "./types";

type VaultErrorCode =
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "VALIDATION_FAILED"
  | "INVALID_ENVELOPE"
  | "PROVIDER_ERROR"
  | "SCHEMA_MISMATCH";

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  override readonly cause?: Error;

  constructor(message: string, code: VaultErrorCode, cause?: Error) {
    super(message);
    this.name = "VaultError";
    this.code = code;
    this.cause = cause;
  }
}

export class Vault {
  private readonly provider: EncryptionProvider;
  private readonly schemas = new Map<string, VaultSchema<unknown>>();

  constructor(config: ProviderConfig) {
    this.provider = this.createProvider(config);
  }

  registerSchema<T>(schema: VaultSchema<T>): this {
    this.schemas.set(schema.id, schema as VaultSchema<unknown>);
    return this;
  }

  async encrypt<T>(
    schema: VaultSchema<T>,
    data: T,
    options: VaultOptions = {}
  ): Promise<VaultEncryptResult<T>> {
    try {
      if (schema.validate) {
        schema.validate(data);
      }

      const plaintext = schema.serialize(data);
      const plaintextBuffer = Buffer.from(plaintext, "utf8");
      const envelope = await this.provider.encrypt(plaintextBuffer);
      const encrypted = JSON.stringify(envelope);
      const hash = hashData(encrypted);

      const result: VaultEncryptResult<T> = {
        encrypted,
        hash,
        data,
      };

      if (options.includeFingerprint && schema.fingerprint) {
        return {
          ...result,
          fingerprint: schema.fingerprint(data),
        };
      }

      return result;
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "ENCRYPTION_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async decrypt<T>(
    schema: VaultSchema<T>,
    encrypted: SerializedEnvelope
  ): Promise<VaultDecryptResult<T>> {
    try {
      const envelope = this.parseEnvelope(encrypted);
      const plaintextBuffer = await this.provider.decrypt(envelope);
      const plaintext = plaintextBuffer.toString("utf8");
      const data = schema.deserialize(plaintext);

      return {
        data,
        schema: schema.id,
        metadata: {
          version: envelope.v,
          algorithm: envelope.alg,
          keyId: envelope.kid,
          createdAt: new Date(envelope.ts),
        },
      };
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DECRYPTION_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async encryptRaw(data: string | Buffer): Promise<SerializedEnvelope> {
    const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    const envelope = await this.provider.encrypt(buffer);
    return JSON.stringify(envelope);
  }

  async decryptRaw(encrypted: SerializedEnvelope): Promise<Buffer> {
    const envelope = this.parseEnvelope(encrypted);
    return this.provider.decrypt(envelope);
  }

  hash(data: string | Buffer): string {
    return hashData(data);
  }

  verifyHash(data: string | Buffer, expectedHash: string): boolean {
    return timingSafeHashCompare(data, expectedHash);
  }

  getSchema<T>(schemaId: string): VaultSchema<T> | undefined {
    return this.schemas.get(schemaId) as VaultSchema<T> | undefined;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  getProviderName(): string {
    return this.provider.name;
  }

  private createProvider(config: ProviderConfig): EncryptionProvider {
    switch (config.provider) {
      case "local":
        return new LocalEncryptionProvider(config.masterKey, config.keyId);

      case "aws-kms":
        throw new Error("AWS KMS provider not yet implemented");

      case "gcp-kms":
        throw new Error("GCP KMS provider not yet implemented");

      case "azure-keyvault":
        throw new Error("Azure Key Vault provider not yet implemented");

      default: {
        const exhaustiveCheck: never = config;
        throw new Error(`Unknown provider: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }
  }

  private parseEnvelope(encrypted: SerializedEnvelope): EncryptedEnvelope {
    let parsed: unknown;
    try {
      parsed = JSON.parse(encrypted);
    } catch {
      throw new VaultError(
        "Invalid JSON in encrypted envelope",
        "INVALID_ENVELOPE"
      );
    }

    if (!isValidEnvelope(parsed)) {
      throw new VaultError("Invalid envelope format", "INVALID_ENVELOPE");
    }

    return parsed;
  }
}

export function createVault(config: ProviderConfig): Vault {
  return new Vault(config);
}
