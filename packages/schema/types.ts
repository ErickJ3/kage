/**
 * Type definitions for schema validation.
 */

import type { z } from "zod";

/**
 * Infer TypeScript type from Zod schema.
 */
export type Infer<T extends z.ZodType> = z.infer<T>;

/**
 * Validation error details.
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Result of schema validation.
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Schema validation configuration.
 */
export interface SchemaConfig {
  /**
   * Request body schema.
   */
  body?: z.ZodType;

  /**
   * Query parameters schema.
   */
  query?: z.ZodType;

  /**
   * Path parameters schema.
   */
  params?: z.ZodType;

  /**
   * Response schema (for validation in development).
   */
  response?: z.ZodType;
}
