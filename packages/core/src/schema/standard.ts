import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Any library implementing Standard Schema (Zod, Valibot, ArkType, etc.)
 * can be used directly without wrappers.
 */
export type StandardSchema<TInput = unknown, TOutput = TInput> =
  StandardSchemaV1<TInput, TOutput>;

/**
 * Infer the output type from any Standard Schema compliant schema.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * const schema = z.object({ name: z.string() });
 * type User = Infer<typeof schema>; // { name: string }
 * ```
 */
export type Infer<S> = S extends StandardSchemaV1<unknown, infer TOutput>
  ? TOutput
  : never;

/**
 * Infer the input type from any Standard Schema compliant schema.
 */
export type InferInput<S> = S extends StandardSchemaV1<infer TInput, unknown>
  ? TInput
  : never;

/**
 * Validation issue as returned by Standard Schema.
 */
export interface ValidationIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>;
}

/**
 * Result of a validation operation.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };

/**
 * Check if a value implements the Standard Schema interface.
 */
export function isStandardSchema(value: unknown): value is StandardSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as StandardSchema)["~standard"] === "object" &&
    typeof (value as StandardSchema)["~standard"].validate === "function"
  );
}

/**
 * Validate data against a Standard Schema.
 *
 * Works with any Standard Schema compliant library (Zod, Valibot, ArkType, etc.).
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const schema = z.object({ name: z.string() });
 * const result = await validate(schema, { name: "John" });
 *
 * if (result.success) {
 *   console.log(result.data.name); // "John"
 * } else {
 *   console.log(result.issues);
 * }
 * ```
 */
export async function validate<T extends StandardSchema>(
  schema: T,
  data: unknown,
): Promise<ValidationResult<Infer<T>>> {
  let result = schema["~standard"].validate(data);

  if (result instanceof Promise) {
    result = await result;
  }

  if (result.issues) {
    return {
      success: false,
      issues: result.issues.map((issue) => ({
        message: issue.message,
        path: issue.path,
      })),
    };
  }

  return {
    success: true,
    data: result.value as Infer<T>,
  };
}

/**
 * Validate data and throw if invalid.
 *
 * @throws {ValidationError} If validation fails
 */
export async function validateOrThrow<T extends StandardSchema>(
  schema: T,
  data: unknown,
): Promise<Infer<T>> {
  const result = await validate(schema, data);

  if (!result.success) {
    const error = new Error("Validation failed") as Error & {
      issues: ValidationIssue[];
    };
    error.issues = result.issues;
    throw error;
  }

  return result.data;
}
