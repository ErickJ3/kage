/**
 * Base error class for Kage.
 */

import type { ErrorResponse } from "./types.ts";

/**
 * Base error class for all Kage errors.
 *
 * All Kage errors extend this class, providing consistent
 * error structure and HTTP status code mapping.
 *
 * @example
 * ```typescript
 * throw new KageError("Something went wrong", 500, "INTERNAL_ERROR");
 * ```
 */
export class KageError extends Error {
  /** HTTP status code */
  readonly status: number;
  /** Machine-readable error code */
  readonly code: string;
  /** Additional error details (shown in development mode) */
  readonly details?: unknown;
  /** Whether this error is operational (expected) vs programming error */
  readonly isOperational: boolean;

  constructor(
    message: string,
    status = 500,
    code = "INTERNAL_ERROR",
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = "KageError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Convert error to JSON response object.
   * @param development Include stack trace and details
   */
  toJSON(development = false): ErrorResponse {
    const response: ErrorResponse = {
      error: {
        message: this.message,
        code: this.code,
        status: this.status,
      },
    };

    if (development) {
      if (this.details !== undefined) {
        response.error.details = this.details;
      }
      if (this.stack) {
        response.error.stack = this.stack.split("\n").map((l) => l.trim());
      }
    }

    return response;
  }

  /**
   * Create a Response object from this error.
   * @param development Include stack trace and details
   */
  toResponse(development = false): Response {
    return new Response(JSON.stringify(this.toJSON(development)), {
      status: this.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
