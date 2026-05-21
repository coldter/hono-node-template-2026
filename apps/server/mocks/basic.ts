import { faker } from "@faker-js/faker";
import { nanoid } from "./utils";

export function mockUser(
  overrides: Partial<{
    id: string;
    email: string;
    name: string;
  }> = {}
) {
  return {
    id: overrides.id ?? nanoid(),
    email: overrides.email ?? faker.internet.email().toLowerCase(),
    name: overrides.name ?? faker.person.fullName(),
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function mockSession(
  userId: string,
  overrides: Partial<{
    id: string;
    expiresAt: Date;
  }> = {}
) {
  return {
    id: overrides.id ?? nanoid(),
    userId,
    token: nanoid(),
    expiresAt: overrides.expiresAt ?? faker.date.future(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
