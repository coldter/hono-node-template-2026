import { faker } from "@faker-js/faker";

export function nanoid(size = 21): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < size; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

export function pastIsoDate(): string {
  return faker.date.past().toISOString();
}

export function futureIsoDate(): string {
  return faker.date.future().toISOString();
}
