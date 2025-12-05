/**
 * HTTP error classes.
 */

import { KageError } from "~/errors/base.ts";
import type { ValidationIssue } from "~/errors/types.ts";

/**
 * 400 Bad Request error.
 */
export class BadRequestError extends KageError {
  constructor(message = "Bad Request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
    this.name = "BadRequestError";
  }
}

/**
 * 401 Unauthorized error.
 */
export class UnauthorizedError extends KageError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, 401, "UNAUTHORIZED", details);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden error.
 */
export class ForbiddenError extends KageError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, "FORBIDDEN", details);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found error.
 */
export class NotFoundError extends KageError {
  constructor(message = "Not Found", details?: unknown) {
    super(message, 404, "NOT_FOUND", details);
    this.name = "NotFoundError";
  }
}

/**
 * 409 Conflict error.
 */
export class ConflictError extends KageError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
    this.name = "ConflictError";
  }
}

/**
 * 422 Unprocessable Entity error (validation error).
 */
export class ValidationError extends KageError {
  readonly errors: ValidationIssue[];

  constructor(message = "Validation Error", errors: ValidationIssue[] = []) {
    super(message, 422, "VALIDATION_ERROR", errors);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/**
 * 429 Too Many Requests error.
 */
export class RateLimitError extends KageError {
  readonly retryAfter?: number;

  constructor(message = "Too Many Requests", retryAfter?: number) {
    super(
      message,
      429,
      "RATE_LIMIT_EXCEEDED",
      retryAfter ? { retryAfter } : undefined,
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }

  override toResponse(development = false): Response {
    const response = super.toResponse(development);
    if (this.retryAfter) {
      const headers = new Headers(response.headers);
      headers.set("Retry-After", String(this.retryAfter));
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }
    return response;
  }
}

/**
 * 500 Internal Server Error.
 */
export class InternalError extends KageError {
  constructor(message = "Internal Server Error", details?: unknown) {
    super(message, 500, "INTERNAL_ERROR", details, false);
    this.name = "InternalError";
  }
}

/**
 * 503 Service Unavailable error.
 */
export class ServiceUnavailableError extends KageError {
  readonly retryAfter?: number;

  constructor(message = "Service Unavailable", retryAfter?: number) {
    super(
      message,
      503,
      "SERVICE_UNAVAILABLE",
      retryAfter ? { retryAfter } : undefined,
    );
    this.name = "ServiceUnavailableError";
    this.retryAfter = retryAfter;
  }

  override toResponse(development = false): Response {
    const response = super.toResponse(development);
    if (this.retryAfter) {
      const headers = new Headers(response.headers);
      headers.set("Retry-After", String(this.retryAfter));
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }
    return response;
  }
}
