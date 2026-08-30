import { describe, expect, it } from "vitest";
import {
  createVault,
  generateMasterKey,
  LocalEncryptionProvider,
  VaultError,
} from "@/lib/vault";

const MASTER_KEY = generateMasterKey();
const MALFORMED_KEY_MESSAGE = /64 characters/;

describe("LocalEncryptionProvider", () => {
  it("should round-trip plaintext through encrypt and decrypt", async () => {
    const provider = new LocalEncryptionProvider(MASTER_KEY, "test-key");
    const plaintext = Buffer.from("super-secret-value", "utf8");

    const envelope = await provider.encrypt(plaintext);
    const decrypted = await provider.decrypt(envelope);

    expect(decrypted.toString("utf8")).toBe("super-secret-value");
    expect(envelope.alg).toBe("aes-256-gcm");
    expect(envelope.kid).toBe("test-key");
  });

  it("should fail to decrypt with a different master key", async () => {
    const provider = new LocalEncryptionProvider(MASTER_KEY);
    const otherProvider = new LocalEncryptionProvider(generateMasterKey());
    const envelope = await provider.encrypt(Buffer.from("secret"));

    await expect(otherProvider.decrypt(envelope)).rejects.toThrow();
  });

  it("should reject tampered ciphertext via the GCM auth tag", async () => {
    const provider = new LocalEncryptionProvider(MASTER_KEY);
    const envelope = await provider.encrypt(Buffer.from("secret"));

    const combined = Buffer.from(envelope.ct, "base64");

    const lastIndex = combined.length - 1;
    const lastByte = combined[lastIndex];
    if (lastByte === undefined) {
      throw new Error("unexpected empty ciphertext");
    }
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional single-bit flip to trip the GCM auth tag
    combined[lastIndex] = lastByte ^ 0x01;
    const tampered = { ...envelope, ct: combined.toString("base64") };

    await expect(provider.decrypt(tampered)).rejects.toThrow();
  });

  it("should reject construction with a malformed master key", () => {
    expect(() => new LocalEncryptionProvider("too-short")).toThrow(
      MALFORMED_KEY_MESSAGE
    );
  });
});

describe("Vault", () => {
  it("should wrap provider failures in VaultError on decrypt", async () => {
    const vault = createVault({ masterKey: MASTER_KEY, provider: "local" });

    await expect(vault.decryptRaw("not-json")).rejects.toBeInstanceOf(
      VaultError
    );
  });

  it("should round-trip via encryptRaw and decryptRaw", async () => {
    const vault = createVault({ masterKey: MASTER_KEY, provider: "local" });

    const encrypted = await vault.encryptRaw("hello");
    const decrypted = await vault.decryptRaw(encrypted);

    expect(decrypted.toString("utf8")).toBe("hello");
  });
});
