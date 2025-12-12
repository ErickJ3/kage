import type { Infer, StandardSchema } from "~/schema/standard.ts";

/**
 * Extract path parameter names from a path pattern.
 *
 * @example
 * ExtractPathParams<"/users/:id/posts/:postId"> // "id" | "postId"
 */
export type ExtractPathParams<T extends string> = T extends
  `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractPathParams<`/${Rest}`>
  : T extends `${string}:${infer Param}` ? Param
  : never;

/**
 * Create a params object type from a path pattern.
 *
 * @example
 * PathParams<"/users/:id"> // { id: string }
 */
export type PathParams<T extends string> = {
  [K in ExtractPathParams<T>]: string;
};

/**
 * Infer schema type with a default fallback.
 */
export type InferSchema<
  T extends StandardSchema | undefined,
  Default = unknown,
> = T extends StandardSchema ? Infer<T> : Default;

/**
 * Schema configuration for routes.
 */
export interface TypedSchemaConfig {
  params?: StandardSchema;
  query?: StandardSchema;
  body?: StandardSchema;
  response?: StandardSchema;
}

/**
 * Typed context available in handlers.
 */
export interface TypedContext<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> {
  readonly request: Request;
  readonly params: TParams;
  readonly method: string;
  readonly headers: Headers;
  readonly path: string;
  readonly url: URL;
  readonly query: TQuery;
  readonly body: TBody;
  readonly state: Record<string, unknown>;

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
 * Typed handler function.
 *
 * The TResponse type parameter enforces the return type at compile-time
 * when a response schema is provided.
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
 * Route configuration with schema validation.
 *
 * When a response schema is provided, TypeScript enforces that the handler
 * returns a compatible type.
 */
export interface TypedRouteConfig<
  TPath extends string = string,
  TParamsSchema extends StandardSchema | undefined = undefined,
  TQuerySchema extends StandardSchema | undefined = undefined,
  TBodySchema extends StandardSchema | undefined = undefined,
  TResponseSchema extends StandardSchema | undefined = undefined,
> {
  path: TPath;
  schema?: {
    params?: TParamsSchema;
    query?: TQuerySchema;
    body?: TBodySchema;
    response?: TResponseSchema;
  };
  handler: TypedHandler<
    TParamsSchema extends StandardSchema ? Infer<TParamsSchema>
      : PathParams<TPath>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>,
    InferSchema<TResponseSchema, unknown>
  >;
}

/**
 * Internal route definition.
 */
export interface TypedRouteDefinition<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TResponse = unknown,
> {
  path: string;
  handler: TypedHandler<TParams, TQuery, TBody, TResponse>;
  schemas: TypedSchemaConfig;
}
