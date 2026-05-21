/**
 * Fake KEK wrapper for tests.
 *
 * Round-trips bytes through a deterministic, in-memory transformation.
 * NO real cryptography — its only job is to let codec tests run without
 * a real `Vault` instance / `VAULT_MASTER_KEY`, and to make wrapped bytes
 * easy to tamper with for failure-mode tests.
 *
 * Do NOT use outside tests. The export name intentionally signals "fake".
 */
import type { KekWrapper, SerializedEnvelope } from "./types";

export function fakeKekWrapper(): KekWrapper {
  return {
    async wrap(data: string | Buffer): Promise<SerializedEnvelope> {
      const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
      return JSON.stringify({
        v: 1,
        alg: "fake" as const,
        ct: buf.toString("base64"),
        ts: Date.now(),
      });
    },
    async unwrap(encrypted: SerializedEnvelope): Promise<Buffer> {
      const parsed: unknown = JSON.parse(encrypted);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("ct" in parsed) ||
        typeof (parsed as { ct: unknown }).ct !== "string"
      ) {
        throw new Error("fakeKekWrapper: invalid envelope");
      }
      // boundary: validated shape above; parsed.ct is confirmed string.
      const ct = (parsed as { ct: string }).ct;
      return Buffer.from(ct, "base64");
    },
  };
}

/** Backward-compat alias. Prefer `fakeKekWrapper` in new code. */
export const fakeVault = fakeKekWrapper;
