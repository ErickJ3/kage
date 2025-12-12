/**
 * Kage Core
 *
 * A minimal, type-safe web framework Deno-first.
 * Uses Standard Schema for validation - compatible with Zod, Valibot, ArkType, etc.
 */

export { Kage, KageGroup } from "~/app/mod.ts";
export type {
  KageConfig,
  KageHandler,
  KageRouteConfig,
  KageSchemaConfig,
  KageSchemaContext,
  KageSchemaHandler,
  ListenOptions,
} from "~/app/mod.ts";

export { Context, ContextPool } from "~/context/mod.ts";

export { compose } from "~/middleware/mod.ts";
export type { Middleware } from "~/middleware/mod.ts";

export {
  BadRequestError,
  ConflictError,
  defaultErrorTransformer,
  errorToResponse,
  ForbiddenError,
  InternalError,
  isKageError,
  KageError,
  NotFoundError,
  UnauthorizedError,
} from "~/errors/mod.ts";
export type {
  ErrorResponse,
  ErrorTransformer,
  ValidationIssue as ErrorValidationIssue,
} from "~/errors/mod.ts";

export type {
  ContextState,
  DeriveContext,
  DeriveFn,
  ExtendedContext,
  GroupConfig,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
  P,
  PluginFn,
  RequestContext,
  ScopeOptions,
} from "~/app/types.ts";

export {
  createRoute,
  route,
  RouteBuilder,
  wrapTypedHandler,
} from "~/routing/mod.ts";
export type {
  ExtractPathParams,
  InferSchema,
  PathParams,
  TypedContext,
  TypedHandler,
  TypedRouteConfig,
  TypedRouteDefinition,
  TypedSchemaConfig,
} from "~/routing/mod.ts";

export { Router } from "~/router/mod.ts";
export type { Handler, HttpMethod, Match } from "~/router/mod.ts";

// Schema validation exports (Standard Schema based)
export {
  createValidationErrorResponse,
  formatIssues,
  formatPath,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
  isStandardSchema,
  validate,
  validateOrThrow,
  validateSchema,
  validationErrorResponse,
} from "~/schema/mod.ts";

export type {
  FormattedValidationError,
  Infer,
  InferInput,
  SchemaConfig,
  StandardSchema,
  ValidationIssue,
  ValidationResult,
} from "~/schema/mod.ts";
