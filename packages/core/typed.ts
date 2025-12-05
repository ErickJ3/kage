/**
 * Type-safe routing and handler types for Kage.
 *
 * Provides end-to-end type inference from route definition to handler.
 */

import type { z } from "zod";
import type { Permission } from "../permissions/mod.ts";

/**
 * Extract param names from a route path pattern.
 * e.g., "/users/:id/posts/:postId" -> "id" | "postId"
 */
export type ExtractPathParams<T extends string> = T extends
  `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractPathParams<`/${Rest}`>
  : T extends `${string}:${infer Param}` ? Param
  : never;

/**
 * Create a params object type from a route path.
 * e.g., "/users/:id" -> { id: string }
 */
export type PathParams<T extends string> = {
  [K in ExtractPathParams<T>]: string;
};

/**
 * Infer type from Zod schema, or use default if not provided.
 */
export type InferSchema<
  T extends z.ZodType | undefined,
  Default = unknown,
> = T extends z.ZodType ? z.infer<T> : Default;

/**
 * Schema configuration for typed routes.
 */
export interface TypedSchemaConfig {
  /** Path parameters schema (validates and types route params) */
  params?: z.ZodType;
  /** Query parameters schema (validates and types query string) */
  query?: z.ZodType;
  /** Request body schema (validates and types JSON body) */
  body?: z.ZodType;
  /** Response schema (validates in development, types return) */
  response?: z.ZodType;
}

/**
 * Typed request context with inferred types from schemas.
 */
export interface TypedContext<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> {
  /** Original request object */
  readonly request: Request;
  /** Typed path parameters */
  readonly params: TParams;
  /** HTTP method */
  readonly method: string;
  /** Request headers */
  readonly headers: Headers;
  /** Request pathname */
  readonly path: string;
  /** Full parsed URL (lazy) */
  readonly url: URL;

  /** Typed query parameters (validated) */
  readonly validatedQuery: TQuery;
  /** Typed request body (validated) */
  readonly validatedBody: TBody;
  /** Custom state for middleware */
  readonly state: Record<string, unknown>;

  // Response helpers
  json<T>(data: T, status?: number): Response;
  text(text: string, status?: number): Response;
  html(html: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
  noContent(): Response;
  notFound(message?: string): Response;
  badRequest(message?: string): Response;
  unauthorized(message?: string): Response;
  forbidden(message?: string): Response;
  internalError(message?: string): Response;
  binary(
    data: Uint8Array | ArrayBuffer,
    contentType?: string,
    status?: number,
  ): Response;
  stream(
    stream: ReadableStream,
    contentType?: string,
    status?: number,
  ): Response;
  response(body?: BodyInit | null, init?: ResponseInit): Response;
}

/**
 * Typed route handler function.
 */
export type TypedHandler<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TResponse = unknown,
> = (
  ctx: TypedContext<TParams, TQuery, TBody>,
) => TResponse | Response | Promise<TResponse | Response>;

/**
 * Configuration for a typed route.
 */
export interface TypedRouteConfig<
  TPath extends string = string,
  TParamsSchema extends z.ZodType | undefined = undefined,
  TQuerySchema extends z.ZodType | undefined = undefined,
  TBodySchema extends z.ZodType | undefined = undefined,
  TResponseSchema extends z.ZodType | undefined = undefined,
> {
  /** Route path pattern (e.g., "/users/:id") */
  path: TPath;
  /** Required permissions for this route */
  permissions?: Permission[];
  /** Schema definitions for validation and typing */
  schema?: {
    params?: TParamsSchema;
    query?: TQuerySchema;
    body?: TBodySchema;
    response?: TResponseSchema;
  };
  /** Route handler with full type inference */
  handler: TypedHandler<
    TParamsSchema extends z.ZodType ? z.infer<TParamsSchema> : PathParams<TPath>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>,
    InferSchema<TResponseSchema, unknown>
  >;
}

/**
 * Route definition result from createRoute helper.
 */
export interface TypedRouteDefinition<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TResponse = unknown,
> {
  /** Original path pattern */
  path: string;
  /** Required permissions */
  permissions?: Permission[];
  /** Bound handler function */
  handler: TypedHandler<TParams, TQuery, TBody, TResponse>;
  /** Schema config for runtime validation */
  schemas: TypedSchemaConfig;
}
