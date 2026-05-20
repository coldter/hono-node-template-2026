// Owns the encrypt-on-write / decrypt-on-read seam for the OIDC config blob so cleartext never touches the DB.
import type { Executor, SsoProvider } from "@repo/db";
import { firstOrThrow, ssoProviders } from "@repo/db";
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
  vault?: KekWrapper;
}

export type DecryptedSsoProvider = SsoProvider & {
  oidcConfig: unknown;
};

export interface SsoStorage {
  create(input: SsoStorageCreateInput): Promise<SsoProvider>;
  // `organizationId` is part of the SELECT predicate so cross-org row metadata cannot leak (DEK unbind is secondary).
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

      return await firstOrThrow(
        db
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
          .returning(),
        "ssoStorage.create: insert returned no rows"
      );
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

      // Defence in depth against a stale fixture or mis-stubbed driver returning a foreign row.
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
