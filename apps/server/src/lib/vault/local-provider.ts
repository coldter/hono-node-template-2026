import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { EncryptedEnvelope, EncryptionProvider } from "./types";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const MAX_CACHE_SIZE = 100;

/**
 * Local encryption provider using AES-256-GCM with PBKDF2 key derivation.
 *
 * Security features:
 * - AES-256-GCM authenticated encryption (confidentiality + integrity)
 * - PBKDF2 key derivation with 100k iterations (brute-force resistance)
 * - Random 96-bit IV per encryption (nonce reuse protection)
 * - 128-bit authentication tag (tampering detection)
 *
 * For development and testing. In production, use KMS providers.
 */
export class LocalEncryptionProvider implements EncryptionProvider {
  readonly name = "local";

  private readonly masterKey: Buffer;
  private readonly keyId?: string;
  private readonly derivedKeyCache = new Map<string, Buffer>();

  constructor(masterKeyHex: string, keyId?: string) {
    if (!masterKeyHex || masterKeyHex.length !== 64) {
      throw new Error(
        "LocalEncryptionProvider requires a 32-byte hex-encoded key (64 characters)"
      );
    }

    this.masterKey = Buffer.from(masterKeyHex, "hex");
    this.keyId = keyId;
  }

  isConfigured(): boolean {
    return this.masterKey.length === KEY_LENGTH;
  }

  getKeyId(): string | undefined {
    return this.keyId;
  }

  async encrypt(plaintext: Buffer): Promise<EncryptedEnvelope> {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const derivedKey = await this.deriveKey(salt);

    const cipher = createCipheriv(ALGORITHM, derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: salt (16) + iv (12) + authTag (16) + ciphertext
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return {
      v: 1,
      alg: ALGORITHM,
      ct: combined.toString("base64"),
      kid: this.keyId,
      ts: Date.now(),
    };
  }

  async decrypt(envelope: EncryptedEnvelope): Promise<Buffer> {
    if (envelope.alg !== ALGORITHM) {
      throw new Error(
        `Unsupported algorithm: ${envelope.alg}. Expected: ${ALGORITHM}`
      );
    }

    if (envelope.v !== 1) {
      throw new Error(`Unsupported envelope version: ${envelope.v}`);
    }

    const combined = Buffer.from(envelope.ct, "base64");

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const ciphertext = combined.subarray(
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );

    const derivedKey = await this.deriveKey(salt);

    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private async deriveKey(salt: Buffer): Promise<Buffer> {
    const cacheKey = salt.toString("hex");
    const cached = this.derivedKeyCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const derived = await new Promise<Buffer>((resolve, reject) => {
      pbkdf2(
        this.masterKey,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        "sha256",
        (err, key) => {
          if (err) {
            reject(err);
          } else {
            resolve(key);
          }
        }
      );
    });

    if (this.derivedKeyCache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.derivedKeyCache.keys().next().value;
      if (firstKey) {
        this.derivedKeyCache.delete(firstKey);
      }
    }
    this.derivedKeyCache.set(cacheKey, derived);

    return derived;
  }
}

export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

export function hashData(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function timingSafeHashCompare(
  data: string | Buffer,
  expectedHash: string
): boolean {
  const actualHash = hashData(data);
  if (actualHash.length !== expectedHash.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}
