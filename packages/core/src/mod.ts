/**
 * Kage Core
 */

import { Type } from "@sinclair/typebox";

/**
 * TypeBox schema builder - use this to define schemas.
 *
 * @example
 * ```typescript
 * import { Kage, t } from "@kage/core";
 *
 * const userSchema = t.Object({
 *   name: t.String({ minLength: 1 }),
 *   email: t.String({ format: "email" }),
 * });
 * ```
 */
export const t = Type;
export type { Static, TSchema } from "@sinclair/typebox";

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
  ValidationIssue,
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

export {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
  validate,
  validateOrThrow,
  validateSchema,
  validationErrorResponse,
} from "~/schema/mod.ts";
export type {
  Infer,
  SchemaConfig,
  ValidationError,
  ValidationResult,
} from "~/schema/mod.ts";
