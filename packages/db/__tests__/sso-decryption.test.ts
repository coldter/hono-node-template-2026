import { describe, expect, it } from "vitest";
import { withTestDb } from "./helpers/with-test-db";

describe("sso_providers_decrypted view", () => {
  it("decrypts when app.dek session var is set", async () => {
    await withTestDb(async (pg) => {
      const dekHex = "0".repeat(64);

      // Use is_local=false (session-scoped) so the setting is visible across
      // all subsequent queries on this client — not just the current transaction.
      await pg.query(`SELECT set_config('app.dek', $1, false)`, [dekHex]);

      await pg.query(
        `INSERT INTO organization (id, name) VALUES ('o_1', 'Test')`
      );

      await pg.query(
        `INSERT INTO sso_providers (id, organization_id, provider_id, issuer, domain, oidc_config_encrypted, oidc_config_edek, kek_version)
         VALUES ('ssop_1','o_1','google','https://accounts.google.com','acme.com',
                 pgp_sym_encrypt('{"clientId":"x"}', $1, 'cipher-algo=aes256'),
                 '\\x00', 1)`,
        [dekHex]
      );

      const r = await pg.query(
        `SELECT oidc_config FROM sso_providers_decrypted WHERE id = 'ssop_1'`
      );

      expect(JSON.parse(r.rows[0].oidc_config as string)).toEqual({
        clientId: "x",
      });
    });
  }, 60_000);
});
