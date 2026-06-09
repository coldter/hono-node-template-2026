export const defaultHeaders = {
  "Content-Type": "application/json",
  "x-forwarded-for": "127.0.0.1",
} as const;

export const testUser = {
  email: "test@example.com",
  password: "TestPassword123!",
  name: "Test User",
} as const;

export const adminUser = {
  email: "admin@example.com",
  password: "AdminPassword123!",
  name: "Admin User",
} as const;
