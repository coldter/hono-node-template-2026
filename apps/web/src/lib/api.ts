import { clientConfig } from "@/lib/utils";

// Custom error class to handle API errors
export class ApiError extends Error {
  error: {
    message?: string;
  };
  status: number;

  constructor(error: ApiError, status?: number) {
    super(error.error.message);
    this.name = error.name;
    this.error = error.error;
    this.status = status ?? 500;
  }
}

export { clientConfig };
