export async function parseResponse<T>(response: {
  json: () => Promise<unknown>;
}): Promise<T> {
  return response.json() as Promise<T>;
}

export type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export function expectError(
  response: ErrorResponse,
  expectedCode: string
): void {
  if (response.success !== false) {
    throw new Error("Expected error response but got success");
  }
  if (response.error.code !== expectedCode) {
    throw new Error(
      `Expected error code "${expectedCode}" but got "${response.error.code}"`
    );
  }
}
