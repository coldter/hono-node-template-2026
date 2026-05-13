import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fakeKekWrapper } from "@/lib/vault/fake";
import {
  bindDek,
  decodeOidcConfig,
  encodeOidcConfig,
  OidcConfigCodecError,
  unbindDek,
} from "../oidc-config-codec";

const fakeVault = fakeKekWrapper;

describe("oidc-config-codec", () => {
  it("round-trips a plain OIDC config through envelope encryption", async () => {
    const v = fakeVault();
    const input = {
      clientId: "client-x",
      clientSecret: "shhh-secret-value",
    };

    const encoded = await encodeOidcConfig(input, "org_1", v);

    expect(encoded.kekVersion).toBe(1);
    expect(Buffer.isBuffer(encoded.encrypted)).toBe(true);
    expect(Buffer.isBuffer(encoded.edek)).toBe(true);
    // iv (12) + tag (16) + at least some ciphertext
    expect(encoded.encrypted.length).toBeGreaterThan(12 + 16);

    const decoded = await decodeOidcConfig(encoded, "org_1", v);
    expect(decoded).toEqual(input);
  });

  it("does not leak plaintext in the encrypted blob", async () => {
    const v = fakeVault();
    const encoded = await encodeOidcConfig(
      { clientSecret: "super-distinct-needle-value" },
      "org_2",
      v
    );
    expect(encoded.encrypted.toString("utf8")).not.toContain(
      "super-distinct-needle-value"
    );
    expect(encoded.encrypted.toString("base64")).not.toContain(
      "super-distinct-needle-value"
    );
  });

  it("round-trips a large config payload (>1KB)", async () => {
    const v = fakeVault();
    const big = {
      clientId: "c",
      clientSecret: "s",
      extra: "x".repeat(2048),
    };
    const encoded = await encodeOidcConfig(big, "org_big", v);
    const back = await decodeOidcConfig(encoded, "org_big", v);
    expect(back).toEqual(big);
  });

  it("throws UNKNOWN_KEK_VERSION when kekVersion is unrecognised", async () => {
    const v = fakeVault();
    const encoded = await encodeOidcConfig({ a: 1 }, "org_3", v);

    await expect(
      decodeOidcConfig({ ...encoded, kekVersion: 999 }, "org_3", v)
    ).rejects.toMatchObject({
      name: "OidcConfigCodecError",
      code: "UNKNOWN_KEK_VERSION",
    });
  });

  it("throws DECRYPT_FAILED when ciphertext is tampered with", async () => {
    const v = fakeVault();
    const encoded = await encodeOidcConfig(
      { clientId: "x", clientSecret: "y" },
      "org_4",
      v
    );

    // Flip a byte well inside the ciphertext region (past iv + authTag).
    const tampered = Buffer.from(encoded.encrypted);
    const targetIdx = tampered.length - 1;
    const original = tampered[targetIdx] ?? 0;
    tampered[targetIdx] = (original + 1) % 256;

    let caught: unknown;
    try {
      await decodeOidcConfig({ ...encoded, encrypted: tampered }, "org_4", v);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OidcConfigCodecError);
    if (caught instanceof OidcConfigCodecError) {
      expect(caught.code).toBe("DECRYPT_FAILED");
    }
  });

  it("throws TENANT_MISMATCH when decoding with the wrong orgId", async () => {
    const v = fakeVault();
    const encoded = await encodeOidcConfig({ clientId: "x" }, "org_a", v);

    await expect(decodeOidcConfig(encoded, "org_b", v)).rejects.toMatchObject({
      name: "OidcConfigCodecError",
      code: "TENANT_MISMATCH",
    });
  });

  it("throws INVALID_ENCRYPTED when the blob is too short", async () => {
    const v = fakeVault();
    const encoded = await encodeOidcConfig({ a: 1 }, "org_x", v);

    await expect(
      decodeOidcConfig({ ...encoded, encrypted: Buffer.alloc(5) }, "org_x", v)
    ).rejects.toMatchObject({
      name: "OidcConfigCodecError",
      code: "INVALID_ENCRYPTED",
    });
  });

  it("throws INVALID_EDEK when the wrapped DEK cannot be unwrapped", async () => {
    const v = fakeVault();
    const encoded = await encodeOidcConfig({ a: 1 }, "org_y", v);

    await expect(
      decodeOidcConfig(
        { ...encoded, edek: Buffer.from("not-a-valid-envelope", "utf8") },
        "org_y",
        v
      )
    ).rejects.toMatchObject({
      name: "OidcConfigCodecError",
      code: "INVALID_EDEK",
    });
  });
});

describe("bindDek / unbindDek", () => {
  it("round-trips a DEK through bind + unbind", () => {
    const dek = randomBytes(32);
    const bound = bindDek(dek, "org_rt", 1);
    const recovered = unbindDek(bound, "org_rt", 1);
    expect(recovered.equals(dek)).toBe(true);
  });

  it("bind output begins with a v<ver>:tenant/<orgId>| prefix", () => {
    const dek = randomBytes(32);
    const bound = bindDek(dek, "org_42", 1);
    expect(bound.subarray(0, "v1:tenant/org_42|".length).toString("utf8")).toBe(
      "v1:tenant/org_42|"
    );
  });

  it("unbind throws TENANT_MISMATCH when the orgId differs", () => {
    const dek = randomBytes(32);
    const bound = bindDek(dek, "org_a", 1);
    expect(() => unbindDek(bound, "org_b", 1)).toThrow(OidcConfigCodecError);
    try {
      unbindDek(bound, "org_b", 1);
    } catch (err) {
      expect(err).toBeInstanceOf(OidcConfigCodecError);
      if (err instanceof OidcConfigCodecError) {
        expect(err.code).toBe("TENANT_MISMATCH");
      }
    }
  });

  it("unbind throws TENANT_MISMATCH when the kekVersion differs", () => {
    const dek = randomBytes(32);
    const bound = bindDek(dek, "org_v", 1);
    expect(() => unbindDek(bound, "org_v", 2)).toThrow(OidcConfigCodecError);
    try {
      unbindDek(bound, "org_v", 2);
    } catch (err) {
      if (err instanceof OidcConfigCodecError) {
        expect(err.code).toBe("TENANT_MISMATCH");
      }
    }
  });

  it("unbind throws TENANT_MISMATCH when the buffer is too short", () => {
    const tooShort = Buffer.from("v1:tenant/org_x|short", "utf8");
    expect(() => unbindDek(tooShort, "org_x", 1)).toThrow(OidcConfigCodecError);
  });

  it("unbind returns a copy that is independent of the input buffer", () => {
    const dek = randomBytes(32);
    const bound = bindDek(dek, "org_iso", 1);
    const recovered = unbindDek(bound, "org_iso", 1);
    bound.fill(0);
    expect(recovered.equals(dek)).toBe(true);
  });
});
