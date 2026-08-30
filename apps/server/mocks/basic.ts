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
    createdAt: new Date(),
    email: overrides.email ?? faker.internet.email().toLowerCase(),
    emailVerified: true,
    id: overrides.id ?? nanoid(),
    name: overrides.name ?? faker.person.fullName(),
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
    createdAt: new Date(),
    expiresAt: overrides.expiresAt ?? faker.date.future(),
    id: overrides.id ?? nanoid(),
    token: nanoid(),
    updatedAt: new Date(),
    userId,
  };
}
