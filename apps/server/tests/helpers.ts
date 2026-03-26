/**
 * Domain-specific test helpers for creating entities and parsing responses.
 */

/**
 * Parse JSON response with proper typing.
 */
export async function parseResponse<T>(response: {
  json: () => Promise<unknown>;
}): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Standard error response shape from the API.
 */
export type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

/**
 * Assert that a response is an error with specific code.
 */
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
