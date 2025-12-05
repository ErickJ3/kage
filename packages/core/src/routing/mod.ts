/**
 * Routing module - type-safe route building.
 */

export type {
  ExtractPathParams,
  InferSchema,
  PathParams,
  TypedContext,
  TypedHandler,
  TypedRouteConfig,
  TypedRouteDefinition,
  TypedSchemaConfig,
} from "~/routing/types.ts";

export {
  createRoute,
  route,
  RouteBuilder,
  wrapTypedHandler,
} from "~/routing/builder.ts";
