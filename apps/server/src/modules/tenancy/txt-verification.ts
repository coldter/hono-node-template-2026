/**
 * TXT-record verification for tenant-owned custom hostnames.
 *
 * The DNS resolver is injected so production code can wire a DoH resolver
 * (see `./doh-resolver.ts`) while tests stub it synchronously. Callers
 * switch on `ok`/`reason` to decide whether to retry, mark `failed`, or
 * surface a user-facing error.
 */

export type TxtVerificationResult =
  | { ok: true }
  | { ok: false; reason: "no_record" | "mismatch" | "resolver_error" };

export type TxtVerificationDeps = {
  /**
   * Resolve TXT records for `name`. Matches the shape of
   * `dns/promises#Resolver.resolveTxt`: each record is an array of
   * string chunks that must be concatenated to recover the full value.
   */
  resolveTxt: (name: string) => Promise<string[][]>;
  /**
   * The DNS label prefix (e.g. `"_app-verify"`) that the verification
   * record lives under. Injected so the policy lives in one place.
   */
  label: string;
};

export async function verifyTxtRecord(
  hostname: string,
  expected: string,
  deps: TxtVerificationDeps
): Promise<TxtVerificationResult> {
  const name = `${deps.label}.${hostname}`;

  let records: string[][];
  try {
    records = await deps.resolveTxt(name);
  } catch (e) {
    // boundary: DNS errors are heterogeneous — Node's `dns/promises` throws
    // `NodeJS.ErrnoException`, third-party DoH clients throw bespoke shapes;
    // we narrow with a typeof guard before reading `.code`.
    const err = e as { code?: string };
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return { ok: false, reason: "no_record" };
    }
    return { ok: false, reason: "resolver_error" };
  }

  if (records.length === 0) {
    return { ok: false, reason: "no_record" };
  }

  for (const chunks of records) {
    if (chunks.join("") === expected) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "mismatch" };
}
