export type HostConfig = Readonly<{
  wildcardSuffix: string; // leading dot, e.g. ".app.example.com"
  adminHost: string; // lower-case
  fallbackHost: string; // lower-case
  nodeEnv: "development" | "production" | "test";
}>;

const LEADING_DOT_RE = /^\./;

export function loadHostConfig(env: {
  APP_WILDCARD_HOST: string;
  ADMIN_HOST: string;
  FALLBACK_HOST: string;
  NODE_ENV: string;
}): HostConfig {
  const appWildcard = env.APP_WILDCARD_HOST.toLowerCase();
  const adminHost = env.ADMIN_HOST.toLowerCase();
  const fallbackHost = env.FALLBACK_HOST.toLowerCase();
  if (appWildcard === adminHost) {
    throw new Error("APP_WILDCARD_HOST collides with ADMIN_HOST");
  }
  const node =
    env.NODE_ENV === "production" || env.NODE_ENV === "test"
      ? env.NODE_ENV
      : "development";
  return Object.freeze({
    wildcardSuffix: `.${appWildcard.replace(LEADING_DOT_RE, "")}`,
    adminHost,
    fallbackHost,
    nodeEnv: node,
  });
}
