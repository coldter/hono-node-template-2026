/**
 * Runtime brand configuration shared across server, web, and email packages.
 *
 * Display strings (app name, company name, support email, etc.) are read from
 * environment variables so consumers of this template can rebrand without
 * touching source files.
 */

export type BrandConfig = {
  appName: string;
  companyName: string;
  supportEmail: string;
  primaryColor: string;
  logoText: string;
  appUrl: string;
};

export const BRAND_DEFAULTS: BrandConfig = {
  appName: "App",
  appUrl: "http://localhost:3001",
  companyName: "Acme Inc.",
  logoText: "App",
  primaryColor: "#2563eb",
  supportEmail: "support@example.com",
} as const;

type EnvSource = Record<string, string | undefined>;

/**
 * Read brand configuration from an env-like object. Both server-side
 * (`APP_NAME`) and Vite-style (`VITE_APP_NAME`) variable names are
 * accepted so the same helper works on the server and in the web bundle.
 */
export function getBrandConfig(env: EnvSource): BrandConfig {
  return {
    appName: env.APP_NAME ?? env.VITE_APP_NAME ?? BRAND_DEFAULTS.appName,
    appUrl: env.APP_URL ?? env.VITE_APP_URL ?? BRAND_DEFAULTS.appUrl,
    companyName:
      env.COMPANY_NAME ?? env.VITE_COMPANY_NAME ?? BRAND_DEFAULTS.companyName,
    logoText: env.LOGO_TEXT ?? env.VITE_LOGO_TEXT ?? BRAND_DEFAULTS.logoText,
    primaryColor:
      env.BRAND_PRIMARY_COLOR ??
      env.VITE_BRAND_PRIMARY_COLOR ??
      BRAND_DEFAULTS.primaryColor,
    supportEmail:
      env.SUPPORT_EMAIL ??
      env.VITE_SUPPORT_EMAIL ??
      BRAND_DEFAULTS.supportEmail,
  };
}
