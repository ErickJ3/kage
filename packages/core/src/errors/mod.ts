/**
 * Errors module - structured error handling.
 */

export { KageError } from "~/errors/base.ts";
export {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "~/errors/http.ts";
export {
  defaultErrorTransformer,
  errorToResponse,
  isKageError,
  isOperationalError,
} from "~/errors/transformer.ts";
export type {
  ErrorResponse,
  ErrorTransformer,
  ValidationIssue,
} from "~/errors/types.ts";
