import type { Static, TSchema } from "@sinclair/typebox";
import type { Permission } from "@kage/permissions";

export type ExtractPathParams<T extends string> = T extends
  `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractPathParams<`/${Rest}`>
  : T extends `${string}:${infer Param}` ? Param
  : never;

export type PathParams<T extends string> = {
  [K in ExtractPathParams<T>]: string;
};

export type InferSchema<
  T extends TSchema | undefined,
  Default = unknown,
> = T extends TSchema ? Static<T> : Default;

export interface TypedSchemaConfig {
  params?: TSchema;
  query?: TSchema;
  body?: TSchema;
  response?: TSchema;
}

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

export type TypedHandler<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TResponse = unknown,
> = (
  ctx: TypedContext<TParams, TQuery, TBody>,
) => TResponse | Response | Promise<TResponse | Response>;

export interface TypedRouteConfig<
  TPath extends string = string,
  TParamsSchema extends TSchema | undefined = undefined,
  TQuerySchema extends TSchema | undefined = undefined,
  TBodySchema extends TSchema | undefined = undefined,
  TResponseSchema extends TSchema | undefined = undefined,
> {
  path: TPath;
  permissions?: Permission[];
  schema?: {
    params?: TParamsSchema;
    query?: TQuerySchema;
    body?: TBodySchema;
    response?: TResponseSchema;
  };
  handler: TypedHandler<
    TParamsSchema extends TSchema ? Static<TParamsSchema> : PathParams<TPath>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>,
    InferSchema<TResponseSchema, unknown>
  >;
}

export interface TypedRouteDefinition<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TResponse = unknown,
> {
  path: string;
  permissions?: Permission[];
  handler: TypedHandler<TParams, TQuery, TBody, TResponse>;
  schemas: TypedSchemaConfig;
}
