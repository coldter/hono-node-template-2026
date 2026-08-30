export const defaultHeaders = {
  "Content-Type": "application/json",
  "x-forwarded-for": "127.0.0.1",
} as const;

export const testUser = {
  email: "test@example.com",
  name: "Test User",
  password: "TestPassword123!",
} as const;

export const adminUser = {
  email: "admin@example.com",
  name: "Admin User",
  password: "AdminPassword123!",
} as const;
