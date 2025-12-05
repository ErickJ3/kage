/**
 * Structured error handling for Kage.
 *
 * Provides custom error types, error transformation, and
 * development vs production modes for error responses.
 */

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

/**
 * 400 Bad Request error.
 *
 * @example
 * ```typescript
 * throw new BadRequestError("Invalid email format", { field: "email" });
 * ```
 */
export class BadRequestError extends KageError {
  constructor(message = "Bad Request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
    this.name = "BadRequestError";
  }
}

/**
 * 401 Unauthorized error.
 *
 * @example
 * ```typescript
 * throw new UnauthorizedError("Invalid token");
 * ```
 */
export class UnauthorizedError extends KageError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, 401, "UNAUTHORIZED", details);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden error.
 *
 * @example
 * ```typescript
 * throw new ForbiddenError("You do not have permission to access this resource");
 * ```
 */
export class ForbiddenError extends KageError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, "FORBIDDEN", details);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found error.
 *
 * @example
 * ```typescript
 * throw new NotFoundError("User not found", { userId: "123" });
 * ```
 */
export class NotFoundError extends KageError {
  constructor(message = "Not Found", details?: unknown) {
    super(message, 404, "NOT_FOUND", details);
    this.name = "NotFoundError";
  }
}

/**
 * 409 Conflict error.
 *
 * @example
 * ```typescript
 * throw new ConflictError("Email already exists", { field: "email" });
 * ```
 */
export class ConflictError extends KageError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
    this.name = "ConflictError";
  }
}

/**
 * 422 Unprocessable Entity error (validation error).
 *
 * @example
 * ```typescript
 * throw new ValidationError("Validation failed", [
 *   { field: "email", message: "Invalid email format" },
 * ]);
 * ```
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
 *
 * @example
 * ```typescript
 * throw new RateLimitError("Rate limit exceeded", 60);
 * ```
 */
export class RateLimitError extends KageError {
  readonly retryAfter?: number;

  constructor(message = "Too Many Requests", retryAfter?: number) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", retryAfter ? { retryAfter } : undefined);
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
 *
 * @example
 * ```typescript
 * throw new InternalError("Database connection failed");
 * ```
 */
export class InternalError extends KageError {
  constructor(message = "Internal Server Error", details?: unknown) {
    super(message, 500, "INTERNAL_ERROR", details, false);
    this.name = "InternalError";
  }
}

/**
 * 503 Service Unavailable error.
 *
 * @example
 * ```typescript
 * throw new ServiceUnavailableError("Service is under maintenance", 300);
 * ```
 */
export class ServiceUnavailableError extends KageError {
  readonly retryAfter?: number;

  constructor(message = "Service Unavailable", retryAfter?: number) {
    super(message, 503, "SERVICE_UNAVAILABLE", retryAfter ? { retryAfter } : undefined);
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

/**
 * Validation issue structure.
 */
export interface ValidationIssue {
  /** Field path (e.g., "user.email" or "items[0].name") */
  field: string;
  /** Error message */
  message: string;
  /** Error code (e.g., "required", "invalid_type") */
  code?: string;
}

/**
 * Standard error response structure.
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    status: number;
    details?: unknown;
    stack?: string[];
  };
}

/**
 * Error transformer function type.
 */
export type ErrorTransformer = (error: unknown) => KageError;

/**
 * Default error transformer.
 * Converts any error to a KageError.
 */
export function defaultErrorTransformer(error: unknown): KageError {
  if (error instanceof KageError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error types
    if (error.name === "SyntaxError" && error.message.includes("JSON")) {
      return new BadRequestError("Invalid JSON in request body", {
        originalMessage: error.message,
      });
    }

    // Convert generic Error to InternalError
    return new InternalError(error.message, {
      originalName: error.name,
      originalStack: error.stack,
    });
  }

  // Handle non-Error throws
  return new InternalError("An unexpected error occurred", {
    value: String(error),
  });
}

/**
 * Create an error response from any error.
 *
 * @example
 * ```typescript
 * try {
 *   // ... code that might throw
 * } catch (error) {
 *   return errorToResponse(error, true); // development mode
 * }
 * ```
 */
export function errorToResponse(
  error: unknown,
  development = false,
  transformer: ErrorTransformer = defaultErrorTransformer,
): Response {
  const kageError = transformer(error);
  return kageError.toResponse(development);
}

/**
 * Type guard to check if a value is a KageError.
 */
export function isKageError(error: unknown): error is KageError {
  return error instanceof KageError;
}

/**
 * Type guard to check if an error is operational (expected).
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof KageError) {
    return error.isOperational;
  }
  return false;
}
