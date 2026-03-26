import { faker } from "@faker-js/faker";

/**
 * Generate a random ID similar to nanoid.
 */
export function nanoid(size = 21): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < size; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

/**
 * Generate a random ISO date string in the past.
 */
export function pastIsoDate(): string {
  return faker.date.past().toISOString();
}

/**
 * Generate a random ISO date string in the future.
 */
export function futureIsoDate(): string {
  return faker.date.future().toISOString();
}
