CREATE OR REPLACE VIEW sso_providers_decrypted
WITH (security_barrier=true, security_invoker=false) AS
SELECT id, organization_id, provider_id, issuer, domain,
       pgp_sym_decrypt(oidc_config_encrypted, current_setting('app.dek', true))::text AS oidc_config,
       kek_version, domain_verified_at, created_at, updated_at
  FROM sso_providers;
--> statement-breakpoint
REVOKE ALL ON sso_providers_decrypted FROM PUBLIC;
