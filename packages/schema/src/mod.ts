/**
 * Schema validation module for Kage.
 *
 * @module
 */

import { Type } from "@sinclair/typebox";

/**
 * TypeBox schema builder - use this to define schemas.
 *
 * @example
 * ```typescript
 * import { t } from "@kage/schema";
 *
 * const userSchema = t.Object({
 *   name: t.String({ minLength: 1 }),
 *   email: t.String({ format: "email" }),
 *   age: t.Optional(t.Number({ minimum: 0 })),
 * });
 * ```
 */
export const t = Type;

export {
  validate,
  validateOrThrow,
  validationErrorResponse,
} from "~/validator.ts";

export {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
  validateSchema,
} from "~/middleware.ts";

export type {
  Infer,
  SchemaConfig,
  ValidationError,
  ValidationResult,
} from "~/types.ts";

export type { Static, TSchema } from "@sinclair/typebox";
