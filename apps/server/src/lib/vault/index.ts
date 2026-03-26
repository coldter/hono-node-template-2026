export { getVault, vault } from "./instance";
export {
  generateMasterKey,
  hashData,
  LocalEncryptionProvider,
  timingSafeHashCompare,
} from "./local-provider";
export type { ApiKeyData, SecretData } from "./schemas";
export { apiKeySchema, createSchema, secretSchema } from "./schemas";
export type {
  EncryptedEnvelope,
  EncryptionProvider,
  LocalProviderConfig,
  ProviderConfig,
  SerializedEnvelope,
  VaultDecryptResult,
  VaultEncryptResult,
  VaultOptions,
  VaultSchema,
} from "./types";
export { isValidEnvelope } from "./types";
export { createVault, Vault, VaultError } from "./vault";
