/**
 * Envelope encryption codec for OIDC provider configs.
 *
 * Two-layer scheme:
 *   1. A fresh 256-bit DEK encrypts the OIDC config JSON with AES-256-GCM.
 *   2. The DEK is wrapped via a `KekWrapper` (the vault's master KEK in
 *      production) with a tenant-binding prefix (`orgId|kekVersion`) baked
 *      INSIDE the wrapped plaintext, so a leaked wrapped DEK cannot be
 *      replayed across tenants or KEK versions.
 *
 * Output column layout:
 *   - `encrypted` (bytea): iv (12) | authTag (16) | ciphertext
 *   - `edek`      (bytea): UTF-8 bytes of the wrapped-DEK envelope (JSON)
 *   - `kekVersion` (int) : currently always 1.
 *
 * Why not in `Vault`? The codec wraps a raw DEK, a different concern from
 * `Vault.encrypt(schema, data)` (schema-bound application secrets).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { vault as defaultVault } from "@/lib/vault";
import type { KekWrapper } from "@/lib/vault/types";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DEK_LENGTH = 32;
const CURRENT_KEK_VERSION = 1 as const;

export type OidcConfigCodecErrorCode =
  | "UNKNOWN_KEK_VERSION"
  | "TENANT_MISMATCH"
  | "DECRYPT_FAILED"
  | "INVALID_EDEK"
  | "INVALID_ENCRYPTED";

export class OidcConfigCodecError extends Error {
  readonly code: OidcConfigCodecErrorCode;
  override readonly cause?: Error;

  constructor(message: string, code: OidcConfigCodecErrorCode, cause?: Error) {
    super(message);
    this.name = "OidcConfigCodecError";
    this.code = code;
    this.cause = cause;
  }
}

export interface EncodedOidcConfig {
  edek: Buffer;
  encrypted: Buffer;
  kekVersion: number;
}

export interface DecodeInput {
  edek: Buffer;
  encrypted: Buffer;
  kekVersion: number;
}

function buildBindingPrefix(orgId: string, kekVersion: number): Buffer {
  return Buffer.from(`v${kekVersion}:tenant/${orgId}|`, "utf8");
}

/**
 * Prepend the tenant/version binding prefix to a raw DEK. The combined
 * buffer is what gets wrapped by the KEK; the prefix lives INSIDE the
 * wrapped envelope so cross-tenant replay fails after unwrap.
 */
export function bindDek(
  dek: Buffer,
  orgId: string,
  kekVersion: number
): Buffer {
  return Buffer.concat([buildBindingPrefix(orgId, kekVersion), dek]);
}

/**
 * Validate the tenant/version binding prefix on an unwrapped DEK buffer
 * and return the bare DEK bytes. Throws `OidcConfigCodecError("TENANT_MISMATCH")`
 * on prefix mismatch or insufficient length. The caller is responsible
 * for zeroing the returned Buffer when done.
 */
export function unbindDek(
  unwrapped: Buffer,
  orgId: string,
  kekVersion: number
): Buffer {
  const prefix = buildBindingPrefix(orgId, kekVersion);
  if (
    unwrapped.length < prefix.length + DEK_LENGTH ||
    !unwrapped.subarray(0, prefix.length).equals(prefix)
  ) {
    throw new OidcConfigCodecError(
      "DEK binding prefix does not match (tenant/version mismatch).",
      "TENANT_MISMATCH"
    );
  }
  return Buffer.from(
    unwrapped.subarray(prefix.length, prefix.length + DEK_LENGTH)
  );
}

export async function encodeOidcConfig(
  plain: object,
  orgId: string,
  kek: KekWrapper = defaultVault
): Promise<EncodedOidcConfig> {
  const dek = randomBytes(DEK_LENGTH);
  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, dek, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(plain), "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const wrappedDekString = await kek.wrap(
      bindDek(dek, orgId, CURRENT_KEK_VERSION)
    );
    const edek = Buffer.from(wrappedDekString, "utf8");

    return {
      encrypted: Buffer.concat([iv, authTag, ciphertext]),
      edek,
      kekVersion: CURRENT_KEK_VERSION,
    };
  } finally {
    dek.fill(0);
  }
}

export async function decodeOidcConfig(
  row: DecodeInput,
  orgId: string,
  kek: KekWrapper = defaultVault
): Promise<unknown> {
  if (row.kekVersion !== CURRENT_KEK_VERSION) {
    throw new OidcConfigCodecError(
      `Unknown KEK version ${row.kekVersion}. Expected ${CURRENT_KEK_VERSION}.`,
      "UNKNOWN_KEK_VERSION"
    );
  }
  if (row.encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new OidcConfigCodecError(
      "Encrypted payload is too short to contain iv + authTag.",
      "INVALID_ENCRYPTED"
    );
  }

  let unwrapped: Buffer;
  try {
    unwrapped = await kek.unwrap(row.edek.toString("utf8"));
  } catch (err) {
    throw new OidcConfigCodecError(
      "Failed to unwrap DEK.",
      "INVALID_EDEK",
      err instanceof Error ? err : undefined
    );
  }

  let dek: Buffer;
  try {
    dek = unbindDek(unwrapped, orgId, row.kekVersion);
  } finally {
    unwrapped.fill(0);
  }

  try {
    const iv = row.encrypted.subarray(0, IV_LENGTH);
    const authTag = row.encrypted.subarray(
      IV_LENGTH,
      IV_LENGTH + AUTH_TAG_LENGTH
    );
    const ciphertext = row.encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, dek, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
    } catch (err) {
      throw new OidcConfigCodecError(
        "Failed to decrypt OIDC config (auth tag mismatch or corruption).",
        "DECRYPT_FAILED",
        err instanceof Error ? err : undefined
      );
    }

    return JSON.parse(plaintext.toString("utf8"));
  } finally {
    dek.fill(0);
  }
}
