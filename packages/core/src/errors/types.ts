/**
 * Error type definitions.
 */

import type { KageError } from "./base.ts";

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
