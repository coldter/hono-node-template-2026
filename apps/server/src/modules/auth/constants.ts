export const LOCKOUT_CONFIG = {
  maxFailedAttempts: 3,
  lockoutDurationMinutes: 15,
} as const;

// Rate-limit ceilings must stay HIGHER than LOCKOUT_CONFIG.maxFailedAttempts so
// our custom lockout fires first; otherwise BA's generic rate-limiter masks the
// targeted lockout response.
export const RATE_LIMIT_CONFIG = {
  signIn: {
    window: 60,
    max: 100,
  },
  global: {
    window: 60,
    max: 1000,
  },
} as const;

export function calculateLockoutExpiry(): Date {
  return new Date(
    Date.now() + LOCKOUT_CONFIG.lockoutDurationMinutes * 60 * 1000
  );
}

export function isLockoutExpired(lockedUntil: Date | null): boolean {
  if (!lockedUntil) {
    return true;
  }
  return lockedUntil <= new Date();
}

// Email OTP is mandatory for all users. TOTP is not supported.
export const TWO_FACTOR_CONFIG = {
  otpLength: 6,
  emailOtpExpiresIn: 300,
  twoFactorOtpPeriodMinutes: 3,
} as const;
