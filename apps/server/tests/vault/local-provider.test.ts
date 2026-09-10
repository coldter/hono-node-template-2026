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
  it("should round-trip plaintext and reject malformed keys, wrong master keys, and tampered ciphertext", async () => {
    expect(() => new LocalEncryptionProvider("too-short")).toThrow(
      MALFORMED_KEY_MESSAGE
    );

    const provider = new LocalEncryptionProvider(MASTER_KEY, "test-key");
    const envelope = await provider.encrypt(
      Buffer.from("super-secret-value", "utf8")
    );

    expect((await provider.decrypt(envelope)).toString("utf8")).toBe(
      "super-secret-value"
    );
    expect(envelope.alg).toBe("aes-256-gcm");
    expect(envelope.kid).toBe("test-key");

    const otherProvider = new LocalEncryptionProvider(generateMasterKey());

    await expect(otherProvider.decrypt(envelope)).rejects.toThrow();

    const combined = Buffer.from(envelope.ct, "base64");
    const lastIndex = combined.length - 1;
    const lastByte = combined[lastIndex];
    if (lastByte === undefined) {
      throw new Error("unexpected empty ciphertext");
    }
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional single-bit flip to trip the GCM auth tag
    combined[lastIndex] = lastByte ^ 0x01;

    await expect(
      provider.decrypt({ ...envelope, ct: combined.toString("base64") })
    ).rejects.toThrow();
  });
});

describe("Vault", () => {
  it("should round-trip via encryptRaw and wrap an invalid envelope in VaultError", async () => {
    const vault = createVault({ masterKey: MASTER_KEY, provider: "local" });

    const encrypted = await vault.encryptRaw("hello");
    const decrypted = await vault.decryptRaw(encrypted);

    expect(decrypted.toString("utf8")).toBe("hello");

    await expect(vault.decryptRaw("not-json")).rejects.toBeInstanceOf(
      VaultError
    );
  });
});
