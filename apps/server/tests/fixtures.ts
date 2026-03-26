/**
 * Static test fixtures - constants and default values used across tests.
 */

/**
 * Default headers for API requests in tests.
 */
export const defaultHeaders = {
  "Content-Type": "application/json",
  "x-forwarded-for": "127.0.0.1",
} as const;

/**
 * Test user credentials for authentication tests.
 */
export const testUser = {
  email: "test@example.com",
  password: "TestPassword123!",
  name: "Test User",
} as const;

/**
 * Admin user credentials for privileged operations.
 */
export const adminUser = {
  email: "admin@example.com",
  password: "AdminPassword123!",
  name: "Admin User",
} as const;
