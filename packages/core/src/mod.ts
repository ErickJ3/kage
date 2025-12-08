/**
 * Kage Core - High-performance web framework for Deno.
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
export { compression, cors, errorHandler, logger } from "~/middleware/mod.ts";
export type { CompressionOptions, CorsOptions } from "~/middleware/mod.ts";

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
  DeriveContext,
  DeriveFn,
  GroupConfig,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
  PluginFn,
  PluginSystemState,
  ScopeOptions,
} from "~/plugins/mod.ts";

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
