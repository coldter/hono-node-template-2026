/**
 * Auto-link decision rule for incoming SSO identities.
 *
 * Better Auth's `sso` plugin (1.6.x) has two relevant trust signals
 * (`trustEmailVerified`, `domainVerification`) but neither covers all
 * three conditions we require before silently granting access to an
 * organization. `shouldAutoLink` consolidates them into a single pure
 * decision used inside the SSO plugin's `provisionUser` hook.
 *
 * Requires ALL of:
 *   - `emailVerified`  — IdP marked the email verified.
 *   - `hasMembership`  — the user already has a `members` row in the
 *                        tenant whose `ssoProvider` matched the login.
 *   - `domainVerified` — the email's domain is verified for the tenant.
 *
 * Any false short-circuits to false — there is no "two out of three"
 * relaxation. Defence against IdP spoofing / domain takeover.
 */
export interface AutoLinkInput {
  readonly domainVerified: boolean;
  readonly emailVerified: boolean;
  readonly hasMembership: boolean;
}

export function shouldAutoLink(input: AutoLinkInput): boolean {
  return (
    input.emailVerified === true &&
    input.hasMembership === true &&
    input.domainVerified === true
  );
}
