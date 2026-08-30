/**
 * Account lockout configuration
 *
 * Users are locked out after maxFailedAttempts consecutive failed login attempts.
 * Lockout lasts for lockoutDurationMinutes.
 */
export const LOCKOUT_CONFIG = {
  /** Lockout duration in minutes */
  lockoutDurationMinutes: 15,
  maxFailedAttempts: 3,
} as const;

/**
 * Better-auth rate limiting configuration
 *
 * Set higher than LOCKOUT_CONFIG to ensure our custom lockout kicks in first.
 * Better-auth rate limit: 10/min for sign-in > our 3 attempt lockout
 */
export const RATE_LIMIT_CONFIG = {
  global: {
    max: 1000,
    /** Time window in seconds */
    window: 60,
  },
  signIn: {
    /** Max requests in window - higher than lockout maxFailedAttempts */
    max: 100,
    /** Time window in seconds */
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

/**
 * Two-factor authentication configuration
 *
 * Email OTP is mandatory for all users. TOTP is not supported.
 */
export const TWO_FACTOR_CONFIG = {
  /** Email OTP expiry time in seconds (5 minutes) */
  emailOtpExpiresIn: 300,
  otpLength: 6,
  /** 2FA OTP expiry time in minutes (3 minutes) */
  twoFactorOtpPeriodMinutes: 3,
} as const;
