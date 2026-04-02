export const ID_PREFIXES = {
  user: "usr",
  session: "ses",
  account: "acc",
  verification: "ver",
  role: "rol",
  auditLog: "aud",
  notification: "ntf",
  pushToken: "ptk",
  relation: "rel",
} as const;

declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type UserId = Brand<string, "UserId">;
export type SessionId = Brand<string, "SessionId">;
export type AccountId = Brand<string, "AccountId">;
export type VerificationId = Brand<string, "VerificationId">;

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

export const createUserId = (): UserId =>
  generatePrefixedCuid(ID_PREFIXES.user) as UserId;

export const createSessionId = (): SessionId =>
  generatePrefixedCuid(ID_PREFIXES.session) as SessionId;

export const createAccountId = (): AccountId =>
  generatePrefixedCuid(ID_PREFIXES.account) as AccountId;

export const createVerificationId = (): VerificationId =>
  generatePrefixedCuid(ID_PREFIXES.verification) as VerificationId;

export const generateIdForModel = (model: string): string => {
  switch (model) {
    case "user":
      return createUserId();
    case "session":
      return createSessionId();
    case "account":
      return createAccountId();
    case "verification":
      return createVerificationId();
    default:
      return generatePrefixedCuid("ent");
  }
};
