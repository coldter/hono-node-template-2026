export const LOCKOUT_CONFIG = {
  lockoutDurationMinutes: 15,
  maxFailedAttempts: 3,
} as const;

export const RATE_LIMIT_CONFIG = {
  global: {
    max: 1000,

    window: 60,
  },
  signIn: {
    max: 100,

    window: 60,
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

export const TWO_FACTOR_CONFIG = {
  emailOtpExpiresIn: 300,
  otpLength: 6,

  twoFactorOtpPeriodMinutes: 3,
} as const;
