/**
 * Storage adapter for `sso_providers` rows.
 *
 * Owns the encrypt-on-write / decrypt-on-read seam for the OIDC config
 * blob so the cleartext `oidcConfig` never touches the DB. Read returns
 * `{ ...row, oidcConfig }` where `oidcConfig` is the decrypted JSON
 * object (parsed). The raw `oidcConfigEncrypted` / `oidcConfigEdek`
 * buffers are still surfaced on the returned row.
 */
import type { Executor, SsoProvider } from "@repo/db";
import { ssoProviders } from "@repo/db";
import { and, eq } from "drizzle-orm";

import type { KekWrapper } from "@/lib/vault/types";
import { decodeOidcConfig, encodeOidcConfig } from "./oidc-config-codec";

export interface SsoStorageCreateInput {
  domain: string;
  issuer: string;
  oidcConfig: object;
  organizationId: string;
  providerId: string;
}

export interface SsoStorageDeps {
  db: Executor;
  /** Optional override; defaults to the singleton vault inside the codec. */
  vault?: KekWrapper;
}

export type DecryptedSsoProvider = SsoProvider & {
  oidcConfig: unknown;
};

export interface SsoStorage {
  create(input: SsoStorageCreateInput): Promise<SsoProvider>;
  /**
   * Scoped lookup. `organizationId` is part of the predicate so a row that
   * exists under a different tenant is invisible — even row metadata must
   * not leak across orgs (the encrypted payload would also fail to decrypt
   * via `unbindDek`, but refusing at the SELECT layer is the primary gate).
   */
  findById(
    id: string,
    organizationId: string
  ): Promise<DecryptedSsoProvider | null>;
}

export function ssoStorageFor(deps: SsoStorageDeps): SsoStorage {
  const { db, vault } = deps;

  return {
    async create(input) {
      const encoded = await encodeOidcConfig(
        input.oidcConfig,
        input.organizationId,
        vault
      );

      const inserted = await db
        .insert(ssoProviders)
        .values({
          organizationId: input.organizationId,
          providerId: input.providerId,
          issuer: input.issuer,
          domain: input.domain,
          oidcConfigEncrypted: encoded.encrypted,
          oidcConfigEdek: encoded.edek,
          kekVersion: encoded.kekVersion,
        })
        .returning();

      const row = inserted[0];
      if (!row) {
        throw new Error("ssoStorage.create: insert returned no rows");
      }
      return row;
    },

    async findById(id, organizationId) {
      const rows = await db
        .select()
        .from(ssoProviders)
        .where(
          and(
            eq(ssoProviders.id, id),
            eq(ssoProviders.organizationId, organizationId)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        return null;
      }

      // Defence in depth: the WHERE clause already enforces org scope, but
      // a stale fixture or mis-stubbed driver could return a foreign row.
      if (row.organizationId !== organizationId) {
        return null;
      }

      const oidcConfig = await decodeOidcConfig(
        {
          encrypted: row.oidcConfigEncrypted,
          edek: row.oidcConfigEdek,
          kekVersion: row.kekVersion,
        },
        row.organizationId,
        vault
      );

      return { ...row, oidcConfig };
    },
  };
}
