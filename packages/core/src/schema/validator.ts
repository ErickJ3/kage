import { type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { FormatRegistry } from "@sinclair/typebox";
import type { ValidationError, ValidationResult } from "~/schema/types.ts";

if (!FormatRegistry.Has("email")) {
  FormatRegistry.Set("email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set(
    "uuid",
    (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  );
}
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  });
}
if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set("date-time", (v) => !isNaN(Date.parse(v)));
}
if (!FormatRegistry.Has("date")) {
  FormatRegistry.Set("date", (v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
}
if (!FormatRegistry.Has("time")) {
  FormatRegistry.Set("time", (v) => /^\d{2}:\d{2}:\d{2}/.test(v));
}

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
