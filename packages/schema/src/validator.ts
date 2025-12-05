import { type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { FormatRegistry } from "@sinclair/typebox";
import type { ValidationError, ValidationResult } from "~/types.ts";

// Register common string formats
FormatRegistry.Set(
  "email",
  (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
);
FormatRegistry.Set(
  "uuid",
  (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
);
FormatRegistry.Set("uri", (value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
});
FormatRegistry.Set("date-time", (value) => !isNaN(Date.parse(value)));
FormatRegistry.Set("date", (value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
FormatRegistry.Set("time", (value) => /^\d{2}:\d{2}:\d{2}/.test(value));

export function validate<T extends TSchema>(
  schema: T,
  data: unknown,
): ValidationResult<Static<T>> {
  const errors = [...Value.Errors(schema, data)];

  if (errors.length === 0) {
    return {
      success: true,
      data: Value.Cast(schema, data),
    };
  }

  const validationErrors: ValidationError[] = errors.map((err) => ({
    field: err.path.replace(/^\//, "").replace(/\//g, ".") || "(root)",
    message: err.message,
    code: err.type.toString(),
  }));

  return {
    success: false,
    errors: validationErrors,
  };
}

export function validateOrThrow<T extends TSchema>(
  schema: T,
  data: unknown,
): Static<T> {
  const result = validate(schema, data);

  if (!result.success) {
    const message = result.errors!
      .map((err) => `${err.field}: ${err.message}`)
      .join(", ");
    throw new Error(`Validation failed: ${message}`);
  }

  return result.data!;
}

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
