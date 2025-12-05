/**
 * Core framework module for Kage.
 *
 * Provides the main Kage application class and core types.
 *
 * @module
 */

export { Kage } from "./kage.ts";
export type { KageConfig, ListenOptions } from "./types.ts";
export { Context } from "./context.ts";
export {
  compose,
  cors,
  errorHandler,
  logger,
  type Middleware,
} from "./middleware.ts";
export { compression, type CompressionOptions } from "./compression.ts";

// Type-safe routing exports
export { createRoute, route, RouteBuilder } from "./route_builder.ts";
export type {
  ExtractPathParams,
  InferSchema,
  PathParams,
  TypedContext,
  TypedHandler,
  TypedRouteDefinition,
  TypedSchemaConfig,
} from "./typed.ts";

// Structured error handling exports
export {
  BadRequestError,
  ConflictError,
  defaultErrorTransformer,
  errorToResponse,
  ForbiddenError,
  InternalError,
  isKageError,
  isOperationalError,
  KageError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "./errors.ts";
export type {
  ErrorResponse,
  ErrorTransformer,
  ValidationIssue,
} from "./errors.ts";

// Plugin system exports
export {
  composePlugins,
  definePlugin,
  PluginManager,
} from "./plugin.ts";
export type {
  ListenInfo,
  Plugin,
  PluginConfig,
  PluginContext,
  PluginHooks,
} from "./plugin.ts";
