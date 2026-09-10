export const ID_PREFIXES = {
  account: "acc",
  auditLog: "aud",
  jwk: "jwk",
  notification: "ntf",
  notificationPreference: "ntfp",
  pushToken: "ptk",
  role: "rol",
  session: "ses",
  twoFactor: "2fa",
  user: "usr",
  verification: "ver",
} as const;

type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

const MODEL_PREFIXES = {
  account: ID_PREFIXES.account,
  jwks: ID_PREFIXES.jwk,
  session: ID_PREFIXES.session,
  twoFactor: ID_PREFIXES.twoFactor,
  user: ID_PREFIXES.user,
  verification: ID_PREFIXES.verification,
} satisfies Record<string, IdPrefix>;

export function generatePrefixedCuid<P extends string>(
  prefix: P
): `${P}_${string}` {
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const timestampHex = timestampSeconds.toString(16).toLowerCase();

  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);

  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${prefix}_${timestampHex}${randomHex}`;
}

function isIdModel(model: string): model is keyof typeof MODEL_PREFIXES {
  return Object.hasOwn(MODEL_PREFIXES, model);
}

export const generateIdForModel = (model: string) =>
  generatePrefixedCuid(isIdModel(model) ? MODEL_PREFIXES[model] : "ent");
