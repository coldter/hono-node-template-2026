/**
 * Account lockout configuration
 *
 * Users are locked out after maxFailedAttempts consecutive failed login attempts.
 * Lockout lasts for lockoutDurationMinutes.
 */
export const LOCKOUT_CONFIG = {
  /** Maximum failed login attempts before lockout */
  maxFailedAttempts: 3,
  /** Lockout duration in minutes */
  lockoutDurationMinutes: 15,
} as const;

/**
 * Better-auth rate limiting configuration
 *
 * Set higher than LOCKOUT_CONFIG to ensure our custom lockout kicks in first.
 * Better-auth rate limit: 10/min for sign-in > our 3 attempt lockout
 */
export const RATE_LIMIT_CONFIG = {
  signIn: {
    /** Time window in seconds */
    window: 60,
    /** Max requests in window - higher than lockout maxFailedAttempts */
    max: 100,
  },
  global: {
    /** Time window in seconds */
    window: 60,
    /** Max requests in window */
    max: 1000,
  },
} as const;

/**
 * Calculate lockout expiry time from now
 */
export function calculateLockoutExpiry(): Date {
  return new Date(
    Date.now() + LOCKOUT_CONFIG.lockoutDurationMinutes * 60 * 1000
  );
}

/**
 * Check if lockout has expired
 */
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
  /** OTP code length (6 digits) */
  otpLength: 6,
  /** Email OTP expiry time in seconds (5 minutes) */
  emailOtpExpiresIn: 300,
  /** 2FA OTP expiry time in minutes (3 minutes) */
  twoFactorOtpPeriodMinutes: 3,
} as const;
