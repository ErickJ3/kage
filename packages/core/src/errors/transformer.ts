/**
 * Error transformation utilities.
 */

import { KageError } from "~/errors/base.ts";
import { BadRequestError, InternalError } from "~/errors/http.ts";
import type { ErrorTransformer } from "~/errors/types.ts";

/**
 * Default error transformer.
 * Converts any error to a KageError.
 */
export function defaultErrorTransformer(error: unknown): KageError {
  if (error instanceof KageError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === "SyntaxError" && error.message.includes("JSON")) {
      return new BadRequestError("Invalid JSON in request body", {
        originalMessage: error.message,
      });
    }

    return new InternalError(error.message, {
      originalName: error.name,
      originalStack: error.stack,
    });
  }

  return new InternalError("An unexpected error occurred", {
    value: String(error),
  });
}

/**
 * Create an error response from any error.
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
