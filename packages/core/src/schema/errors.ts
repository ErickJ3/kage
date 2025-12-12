import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ValidationIssue } from "./standard.ts";

/**
 * Formatted validation error for API responses.
 */
export interface FormattedValidationError {
  path: string;
  message: string;
}

type PathSegment = PropertyKey | StandardSchemaV1.PathSegment;

/**
 * Convert a path array to dot-notation string.
 *
 * @example
 * formatPath(['user', 'email']) // "user.email"
 * formatPath(['items', 0, 'name']) // "items[0].name"
 * formatPath([]) // "(root)"
 */
export function formatPath(path?: ReadonlyArray<PathSegment>): string {
  if (!path || path.length === 0) {
    return "(root)";
  }

  return path.reduce<string>((acc, segment, index) => {
    const key =
      typeof segment === "object" && segment !== null && "key" in segment
        ? segment.key
        : segment;

    if (typeof key === "number") {
      return `${acc}[${key}]`;
    }
    if (index === 0) {
      return String(key);
    }
    return `${acc}.${String(key)}`;
  }, "");
}

/**
 * Format validation issues for API response.
 */
export function formatIssues(
  issues: ValidationIssue[],
): FormattedValidationError[] {
  return issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

/**
 * Create a validation error response.
 */
export function createValidationErrorResponse(
  issues: ValidationIssue[],
): Response {
  const formatted = formatIssues(issues);

  return new Response(
    JSON.stringify({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: formatted,
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}

/**
 * Create a validation error response from raw formatted errors.
 */
export function validationErrorResponse(
  errors: FormattedValidationError[],
): Response {
  return new Response(
    JSON.stringify({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: errors,
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}
