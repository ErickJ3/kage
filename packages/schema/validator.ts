/**
 * Schema validation utilities using Zod.
 *
 * Provides validation for request bodies, query params, and responses.
 */

import type { z } from "zod";
import type { ValidationError, ValidationResult } from "./types.ts";

/**
 * Validate data against a Zod schema.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with typed data or errors
 */
export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown,
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  // Transform Zod errors to our format
  const errors: ValidationError[] = result.error.issues.map((err) => ({
    field: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

  return {
    success: false,
    errors,
  };
}

/**
 * Validate and throw on error.
 *
 * Useful for cases where you want to fail fast.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Parsed and typed data
 * @throws Error if validation fails
 */
export function validateOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const result = validate(schema, data);

  if (!result.success) {
    const message = result.errors!
      .map((err) => `${err.field}: ${err.message}`)
      .join(", ");
    throw new Error(`Validation failed: ${message}`);
  }

  return result.data!;
}

/**
 * Create a validation error response.
 *
 * @param errors - Validation errors
 * @returns Response object with 400 status
 */
export function validationErrorResponse(
  errors: ValidationError[],
): Response {
  return new Response(
    JSON.stringify({
      error: "Validation failed",
      details: errors,
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}
