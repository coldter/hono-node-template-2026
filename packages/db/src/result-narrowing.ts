export async function firstOrThrow<T>(
  query: Promise<T[]>,
  errorOrMessage: string | (() => Error) = "Row not found"
): Promise<T> {
  const row = (await query)[0];
  if (row === undefined) {
    if (typeof errorOrMessage === "function") {
      throw errorOrMessage();
    }
    throw new Error(errorOrMessage);
  }
  return row;
}

export async function firstOrNull<T>(query: Promise<T[]>): Promise<T | null> {
  const row = (await query)[0];
  return row ?? null;
}
