/**
 * Schema validation module for Kage.
 *
 * Provides Zod-based validation with full TypeScript type inference.
 *
 * @module
 */

// Re-export Zod for convenience
export { z } from "zod";

// Core validation utilities
export {
  validate,
  validateOrThrow,
  validationErrorResponse,
} from "./validator.ts";

// Middleware
export {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
  validateSchema,
} from "./middleware.ts";

// Types
export type {
  Infer,
  SchemaConfig,
  ValidationError,
  ValidationResult,
} from "./types.ts";
