import { env } from "@/env";

import { generateMasterKey } from "./local-provider";
import { apiKeySchema, secretSchema } from "./schemas";
import type { ProviderConfig } from "./types";
import { Vault } from "./vault";

function buildProviderConfig(): ProviderConfig {
  const provider = env.VAULT_PROVIDER;

  switch (provider) {
    case "local": {
      const key = env.VAULT_MASTER_KEY;
      if (!key) {
        if (env.NODE_ENV === "development") {
          const generatedKey = generateMasterKey();
          console.warn(
            "⚠️  VAULT_MASTER_KEY not set. Using generated key for this session."
          );
          console.warn(`   Add to .env: VAULT_MASTER_KEY=${generatedKey}`);
          return { provider: "local", masterKey: generatedKey };
        }
        throw new Error(
          "VAULT_MASTER_KEY is required for local encryption provider"
        );
      }
      return { provider: "local", masterKey: key };
    }

    case "aws-kms":
      throw new Error("AWS KMS provider requires additional configuration");

    case "gcp-kms":
      throw new Error("GCP KMS provider requires additional configuration");

    case "azure-keyvault":
      throw new Error(
        "Azure Key Vault provider requires additional configuration"
      );

    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown vault provider: ${exhaustiveCheck}`);
    }
  }
}

let _vault: Vault | null = null;

export function getVault(): Vault {
  if (!_vault) {
    const config = buildProviderConfig();
    _vault = new Vault(config);

    _vault.registerSchema(apiKeySchema).registerSchema(secretSchema);
  }
  return _vault;
}

export const vault = {
  get instance(): Vault {
    return getVault();
  },

  encrypt: (
    ...args: Parameters<Vault["encrypt"]>
  ): ReturnType<Vault["encrypt"]> => getVault().encrypt(...args),

  decrypt: (
    ...args: Parameters<Vault["decrypt"]>
  ): ReturnType<Vault["decrypt"]> => getVault().decrypt(...args),

  encryptRaw: (...args: Parameters<Vault["encryptRaw"]>) =>
    getVault().encryptRaw(...args),

  decryptRaw: (...args: Parameters<Vault["decryptRaw"]>) =>
    getVault().decryptRaw(...args),

  hash: (...args: Parameters<Vault["hash"]>) => getVault().hash(...args),

  verifyHash: (...args: Parameters<Vault["verifyHash"]>) =>
    getVault().verifyHash(...args),
};
