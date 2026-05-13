/**
 * DNS resolver adapter for TXT-based custom-hostname verification.
 *
 * Implementation note (workaround)
 * --------------------------------
 * Target is `tangerine` (DNS-over-HTTPS via undici) so verification traffic
 * bypasses the local resolver and uses Cloudflare / Google directly. We
 * were unable to add `tangerine@2.1.3` because the bun `minimumReleaseAge`
 * supply-chain guard refused to refresh the lockfile (unrelated
 * `@inquirer/prompts@8.4.3` was younger than the threshold and
 * re-resolution is required for a new top-level dependency). Until the
 * lockfile can be refreshed, we use Node's `dns/promises` `Resolver`
 * against the same upstreams; return shape and thrown error codes
 * (`ENOTFOUND`, `ENODATA`) are identical, so `verifyTxtRecord` works
 * unchanged. When `tangerine` is installed, swap the `resolver` instance
 * only — the exported signature stays the same.
 */

import { Resolver } from "node:dns/promises";

const DOH_SERVERS = ["1.1.1.1", "1.0.0.1", "8.8.8.8"] as const;
const TIMEOUT_MS = 2000;
const TRIES = 3;

const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: TRIES });
resolver.setServers([...DOH_SERVERS]);

// Returns one entry per record, each a list of string chunks the caller must
// `join("")` to recover the full value. Throws `NodeJS.ErrnoException`;
// `verifyTxtRecord` narrows `ENOTFOUND`/`ENODATA` into `no_record`.
export const resolveTxt = (name: string): Promise<string[][]> =>
  resolver.resolveTxt(name);
