/**
 * Main Kage application class.
 */

import {
  type Handler,
  type HttpMethod,
  type Match,
  Router,
} from "@kage/router";
import type { Static, TSchema } from "@sinclair/typebox";
import type { KageConfig, ListenOptions } from "~/app/types.ts";
import { Context, ContextPool } from "~/context/mod.ts";
import { compose, type Middleware } from "~/middleware/mod.ts";
import { wrapTypedHandler } from "~/routing/builder.ts";
import type {
  DeriveFn,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
  PluginSystemState,
} from "~/plugins/types.ts";
import type { PathParams } from "~/routing/types.ts";

// deno-lint-ignore ban-types
type Base = {};

export type KageHandler<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
  TParams extends Record<string, string> = Record<string, string>,
> = (
  ctx: Omit<Context, "params"> & TDecorators & { store: TState } & TDerived & {
    params: TParams;
  },
) => unknown | Promise<unknown>;

export interface KageRouteConfig<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
  TParams extends Record<string, string> = Record<string, string>,
> {
  handler: KageHandler<TDecorators, TState, TDerived, TParams>;
}

export interface KageSchemaContextBase<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TState extends Record<string, unknown> = Record<string, unknown>,
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
  readonly store: TState;
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

export type KageSchemaContext<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> =
  & KageSchemaContextBase<TParams, TQuery, TBody, TState>
  & TDecorators
  & TDerived;

export type KageSchemaHandler<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> = (
  ctx: KageSchemaContext<TDecorators, TState, TDerived, TParams, TQuery, TBody>,
) => unknown | Promise<unknown>;

type InferSchema<T, Default = unknown> = T extends TSchema ? Static<T>
  : Default;

export interface KageSchemas<
  TBodySchema extends TSchema | undefined = undefined,
  TQuerySchema extends TSchema | undefined = undefined,
  TParamsSchema extends TSchema | undefined = undefined,
  TResponseSchema extends TSchema | undefined = undefined,
> {
  body?: TBodySchema;
  query?: TQuerySchema;
  params?: TParamsSchema;
  response?: TResponseSchema;
}

export interface KageSchemaConfig<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
  TBodySchema extends TSchema | undefined = undefined,
  TQuerySchema extends TSchema | undefined = undefined,
  TParamsSchema extends TSchema | undefined = undefined,
  TResponseSchema extends TSchema | undefined = undefined,
> {
  schemas: KageSchemas<
    TBodySchema,
    TQuerySchema,
    TParamsSchema,
    TResponseSchema
  >;
  handler: KageSchemaHandler<
    TDecorators,
    TState,
    TDerived,
    InferSchema<TParamsSchema, Record<string, string>>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>
  >;
}

const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const OCTET_CONTENT_TYPE = "application/octet-stream";

/** @internal Route definition for mounting */
interface RawRoute {
  method: HttpMethod;
  path: string;
  handler: Handler;
  hasSchema: boolean;
}

const TEXT_HEADERS: HeadersInit = { "Content-Type": TEXT_CONTENT_TYPE };
const BINARY_HEADERS: HeadersInit = { "Content-Type": OCTET_CONTENT_TYPE };

const TEXT_INIT_200: ResponseInit = { headers: TEXT_HEADERS };
const BINARY_INIT_200: ResponseInit = { headers: BINARY_HEADERS };

const NOT_FOUND_BODY = "Not Found";
const INTERNAL_ERROR_BODY = "Internal Server Error";

/**
 * Kage application with type-safe plugin system.
 *
 * @example
 * ```typescript
 * const app = new Kage()
 *   .decorate("db", new Database())
 *   .state("counter", 0)
 *   .derive(({ headers }) => ({
 *     auth: headers.get("authorization"),
 *   }))
 *   .get("/", (ctx) => {
 *     ctx.db;      // Database
 *     ctx.store.counter; // number
 *     ctx.auth;    // string | null
 *   });
 * ```
 */
export class Kage<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
> {
  private router: Router;
  private middleware: Middleware[];
  private composedMiddleware:
    | ((ctx: Context, next: () => Promise<Response>) => Promise<Response>)
    | null = null;
  private contextPool: ContextPool;

  private pluginState: PluginSystemState<TDecorators, TState>;
  private basePath: string;
  private rawRoutes: RawRoute[] = [];

  constructor(config: KageConfig = {}) {
    this.router = new Router();
    this.middleware = [];
    this.basePath = config.prefix ?? "/";
    this.contextPool = new ContextPool(256);
    this.contextPool.preallocate(64);

    this.pluginState = {
      decorators: {} as TDecorators,
      state: {} as TState,
      deriveFns: [],
      onRequestHooks: [],
      onResponseHooks: [],
      onErrorHooks: [],
      onBeforeHandleHooks: [],
      onAfterHandleHooks: [],
    };
  }

  /**
   * Add an immutable singleton value to all handlers.
   * Decorated values are available on the context and are set once at startup.
   *
   * @example
   * ```typescript
   * const app = new Kage()
   *   .decorate("db", new Database())
   *   .decorate("cache", new Cache())
   *   .get("/users", (ctx) => {
   *     const users = ctx.db.query("SELECT * FROM users");
   *     return ctx.json(users);
   *   });
   * ```
   */
  decorate<K extends string, V>(
    key: K,
    value: V,
  ): Kage<TDecorators & { [P in K]: V }, TState, TDerived> {
    const newDecorators = {
      ...this.pluginState.decorators,
      [key]: value,
    } as TDecorators & { [P in K]: V };

    this.pluginState.decorators = newDecorators as TDecorators;

    return this as unknown as Kage<
      TDecorators & { [P in K]: V },
      TState,
      TDerived
    >;
  }

  /**
   * Add mutable global state accessible via ctx.store.
   * State is shared across all requests and can be modified.
   *
   * @example
   * ```typescript
   * const app = new Kage()
   *   .state("requestCount", 0)
   *   .get("/", (ctx) => {
   *     ctx.store.requestCount++;
   *     return ctx.json({ count: ctx.store.requestCount });
   *   });
   * ```
   */
  state<K extends string, V>(
    key: K,
    initialValue: V,
  ): Kage<TDecorators, TState & { [P in K]: V }, TDerived> {
    const newState = {
      ...this.pluginState.state,
      [key]: initialValue,
    } as TState & { [P in K]: V };

    this.pluginState.state = newState as TState;

    return this as unknown as Kage<
      TDecorators,
      TState & { [P in K]: V },
      TDerived
    >;
  }

  /**
   * Derive values from request context.
   * Derive functions are called once per request and have access to headers, params, etc.
   *
   * @example
   * ```typescript
   * const app = new Kage()
   *   .derive(({ headers }) => ({
   *     userId: headers.get("x-user-id"),
   *     lang: headers.get("accept-language")?.split(",")[0] ?? "en",
   *   }))
   *   .get("/profile", (ctx) => {
   *     return ctx.json({ userId: ctx.userId, lang: ctx.lang });
   *   });
   * ```
   */
  derive<TNew extends Record<string, unknown>>(
    fn: DeriveFn<TNew>,
  ): Kage<TDecorators, TState, TDerived & TNew> {
    this.pluginState.deriveFns.push(fn as DeriveFn<Record<string, unknown>>);

    return this as unknown as Kage<TDecorators, TState, TDerived & TNew>;
  }

  /**
   * Add middleware to the application.
   *
   * @example
   * ```typescript
   * const app = new Kage()
   *   .use(async (ctx, next) => {
   *     console.log("Before handler");
   *     const response = await next();
   *     console.log("After handler");
   *     return response;
   *   });
   * ```
   */
  use(middleware: Middleware): this;

  /**
   * Apply a plugin function to this app instance.
   * Plugins can add decorators, state, derived values, routes, and middleware.
   *
   * @example
   * ```typescript
   * function authPlugin<TD extends P, TS extends P, TDR extends P>(app: Kage<TD, TS, TDR>) {
   *   return app
   *     .decorate("jwt", new JWTService())
   *     .derive(({ headers }) => ({
   *       user: verifyToken(headers.get("authorization")),
   *     }));
   * }
   *
   * const app = new Kage()
   *   .use(authPlugin)
   *   .get("/me", (ctx) => ctx.json(ctx.user));
   * ```
   */
  use<
    TOutDecorators extends Record<string, unknown>,
    TOutState extends Record<string, unknown>,
    TOutDerived extends Record<string, unknown>,
  >(
    plugin: (
      app: Kage<TDecorators, TState, TDerived>,
    ) => Kage<TOutDecorators, TOutState, TOutDerived>,
  ): Kage<TOutDecorators, TOutState, TOutDerived>;

  use<
    TOutDecorators extends Record<string, unknown>,
    TOutState extends Record<string, unknown>,
    TOutDerived extends Record<string, unknown>,
  >(
    pluginOrMiddleware:
      | ((
        app: Kage<TDecorators, TState, TDerived>,
      ) => Kage<TOutDecorators, TOutState, TOutDerived>)
      | Middleware,
  ): this | Kage<TOutDecorators, TOutState, TOutDerived> {
    // Check if it's a middleware (takes ctx and next - 2 parameters)
    if (
      typeof pluginOrMiddleware === "function" &&
      pluginOrMiddleware.length === 2
    ) {
      this.middleware.push(pluginOrMiddleware as Middleware);
      this.composedMiddleware = null;
      return this;
    }

    // It's a plugin function (takes 1 parameter - the app)
    if (
      typeof pluginOrMiddleware === "function" &&
      pluginOrMiddleware.length === 1
    ) {
      const plugin = pluginOrMiddleware as (
        app: Kage<TDecorators, TState, TDerived>,
      ) => Kage<TOutDecorators, TOutState, TOutDerived>;
      return plugin(this);
    }

    // Fallback: treat as middleware
    this.middleware.push(pluginOrMiddleware as Middleware);
    this.composedMiddleware = null;
    return this;
  }

  /**
   * Create a route group with a prefix and optional scoped plugins.
   *
   * @example
   * ```typescript
   * const app = new Kage()
   *   .group("/api", (api) =>
   *     api
   *       .derive(({ headers }) => ({
   *         apiKey: headers.get("x-api-key"),
   *       }))
   *       .get("/users", (ctx) => ctx.json({ apiKey: ctx.apiKey }))
   *   )
   *   .get("/health", (ctx) => ctx.json({ status: "ok" }));
   * ```
   */
  group<
    TGroupDecorators extends Record<string, unknown>,
    TGroupState extends Record<string, unknown>,
    TGroupDerived extends Record<string, unknown>,
  >(
    prefix: string,
    configure: (
      group: KageGroup<TDecorators, TState, TDerived>,
    ) => KageGroup<
      TDecorators & TGroupDecorators,
      TState & TGroupState,
      TDerived & TGroupDerived
    >,
  ): this {
    const group = new KageGroup<TDecorators, TState, TDerived>(
      this,
      this.normalizePath(this.basePath, prefix),
      { ...this.pluginState },
    );

    const configuredGroup = configure(group);
    configuredGroup.applyToParent();

    return this;
  }

  /**
   * Register a hook that runs before route matching.
   * Can return a Response to short-circuit, or modify the Request.
   */
  onRequest(hook: OnRequestHook): this {
    this.pluginState.onRequestHooks.push(hook);
    return this;
  }

  /**
   * Register a hook that runs after handler execution.
   * Can transform the response.
   */
  onResponse(hook: OnResponseHook): this {
    this.pluginState.onResponseHooks.push(hook);
    return this;
  }

  /**
   * Register an error handler hook.
   * Return a Response to handle the error, or null to pass to next handler.
   */
  onError(hook: OnErrorHook): this {
    this.pluginState.onErrorHooks.push(hook);
    return this;
  }

  /**
   * Register a hook that runs before handler execution.
   * Can return a Response to short-circuit.
   */
  onBeforeHandle(
    hook: OnBeforeHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.pluginState.onBeforeHandleHooks.push(
      hook as OnBeforeHandleHook<unknown>,
    );
    return this;
  }

  /**
   * Register a hook that runs after handler execution.
   * Can transform the response.
   */
  onAfterHandle(
    hook: OnAfterHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.pluginState.onAfterHandleHooks.push(
      hook as OnAfterHandleHook<unknown>,
    );
    return this;
  }

  private getComposedMiddleware(): (
    ctx: Context,
    next: () => Promise<Response>,
  ) => Promise<Response> {
    if (!this.composedMiddleware) {
      this.composedMiddleware = compose(this.middleware);
    }
    return this.composedMiddleware;
  }

  get<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  get<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  get<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  get<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  get(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("GET", path, handlerOrConfig, handler);
    return this;
  }

  post<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  post<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  post<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  post<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  post(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("POST", path, handlerOrConfig, handler);
    return this;
  }

  put<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  put<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  put<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  put<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  put(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("PUT", path, handlerOrConfig, handler);
    return this;
  }

  patch<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  patch<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  patch<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  patch<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  patch(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("PATCH", path, handlerOrConfig, handler);
    return this;
  }

  delete<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  delete<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  delete<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  delete<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  delete(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("DELETE", path, handlerOrConfig, handler);
    return this;
  }

  head<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  head<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  head<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  head<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  head(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("HEAD", path, handlerOrConfig, handler);
    return this;
  }

  options<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    config: KageSchemaConfig<
      TDecorators,
      TState,
      TDerived,
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  options<
    TPath extends string,
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: TPath,
    schemas: KageSchemas<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
    handler: KageSchemaHandler<
      TDecorators,
      TState,
      TDerived,
      InferSchema<TParamsSchema, Record<string, string>>,
      InferSchema<TQuerySchema, Record<string, unknown>>,
      InferSchema<TBodySchema, unknown>
    >,
  ): this;
  options<TPath extends string>(
    path: TPath,
    config: KageRouteConfig<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  options<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this;
  options(
    path: string,
    // deno-lint-ignore no-explicit-any
    handlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): this {
    this.addRoute("OPTIONS", path, handlerOrConfig, handler);
    return this;
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    // deno-lint-ignore no-explicit-any
    schemasOrHandlerOrConfig: any,
    // deno-lint-ignore no-explicit-any
    handler?: any,
  ): void {
    const fullPath = this.resolvePath(path);

    // New API: app.post("/path", { body: t.Object(...) }, (ctx) => ...)
    if (handler !== undefined && typeof handler === "function") {
      const wrappedHandler = wrapTypedHandler(
        handler as (ctx: unknown) => unknown,
        schemasOrHandlerOrConfig,
      );
      const pluginWrappedHandler = this.wrapWithPlugins(
        wrappedHandler as Handler,
      );
      this.router.add(method, fullPath, pluginWrappedHandler);
      this.rawRoutes.push({
        method,
        path: fullPath,
        handler: wrappedHandler as Handler,
        hasSchema: true,
      });
      return;
    }

    // Old API: app.post("/path", { schemas: {...}, handler: (ctx) => ... })
    if (this.isSchemaConfig(schemasOrHandlerOrConfig)) {
      const wrappedHandler = wrapTypedHandler(
        schemasOrHandlerOrConfig.handler as (ctx: unknown) => unknown,
        schemasOrHandlerOrConfig.schemas,
      );
      const pluginWrappedHandler = this.wrapWithPlugins(
        wrappedHandler as Handler,
      );
      this.router.add(method, fullPath, pluginWrappedHandler);
      this.rawRoutes.push({
        method,
        path: fullPath,
        handler: wrappedHandler as Handler,
        hasSchema: true,
      });
      return;
    }

    // Simple handler: app.post("/path", (ctx) => ...) or { handler: (ctx) => ... }
    const routeHandler = typeof schemasOrHandlerOrConfig === "function"
      ? schemasOrHandlerOrConfig
      : schemasOrHandlerOrConfig.handler;

    const pluginWrappedHandler = this.wrapWithPlugins(routeHandler as Handler);
    this.router.add(method, fullPath, pluginWrappedHandler);
    this.rawRoutes.push({
      method,
      path: fullPath,
      handler: routeHandler as Handler,
      hasSchema: false,
    });
  }

  private wrapWithPlugins(handler: Handler): Handler {
    const deriveFns = this.pluginState.deriveFns;
    const decoratorKeys = Object.keys(this.pluginState.decorators);
    const decorators = this.pluginState.decorators;
    const state = this.pluginState.state;
    const beforeHandleHooks = this.pluginState.onBeforeHandleHooks;
    const afterHandleHooks = this.pluginState.onAfterHandleHooks;

    const hasDerive = deriveFns.length > 0;
    const hasDecorators = decoratorKeys.length > 0;
    const hasBeforeHooks = beforeHandleHooks.length > 0;
    const hasAfterHooks = afterHandleHooks.length > 0;

    if (!hasDerive && !hasDecorators && !hasBeforeHooks && !hasAfterHooks) {
      return (ctx: Context) => {
        (ctx as Context & { store: TState }).store = state;
        return handler(ctx);
      };
    }

    if (!hasDerive && !hasBeforeHooks && !hasAfterHooks) {
      return (ctx: Context) => {
        const extendedCtx = ctx as Context & TDecorators & { store: TState };
        for (const key of decoratorKeys) {
          (extendedCtx as Record<string, unknown>)[key] =
            decorators[key as keyof TDecorators];
        }
        extendedCtx.store = state;
        return handler(extendedCtx);
      };
    }

    return async (ctx: Context) => {
      const extendedCtx = ctx as
        & Context
        & TDecorators
        & { store: TState }
        & TDerived;

      if (hasDecorators) {
        for (const key of decoratorKeys) {
          (extendedCtx as Record<string, unknown>)[key] =
            decorators[key as keyof TDecorators];
        }
      }
      extendedCtx.store = state;

      if (hasDerive) {
        for (const deriveFn of deriveFns) {
          const derived = deriveFn(ctx);
          if (derived instanceof Promise) {
            const resolvedDerived = await derived;
            for (const key in resolvedDerived) {
              (extendedCtx as Record<string, unknown>)[key] =
                resolvedDerived[key];
            }
          } else {
            for (const key in derived) {
              (extendedCtx as Record<string, unknown>)[key] = derived[key];
            }
          }
        }
      }

      if (hasBeforeHooks) {
        for (const hook of beforeHandleHooks) {
          const result = hook(extendedCtx);
          if (result instanceof Response) {
            return result;
          }
          if (result instanceof Promise) {
            const resolved = await result;
            if (resolved instanceof Response) {
              return resolved;
            }
          }
        }
      }

      let response = handler(extendedCtx);
      if (response instanceof Promise) {
        response = await response;
      }
      if (!(response instanceof Response)) {
        response = this.resultToResponse(response);
      }

      if (hasAfterHooks) {
        for (const hook of afterHandleHooks) {
          const hookResult = hook(extendedCtx, response as Response);
          if (hookResult instanceof Promise) {
            response = await hookResult;
          } else {
            response = hookResult;
          }
        }
      }

      return response;
    };
  }

  // deno-lint-ignore no-explicit-any
  private isSchemaConfig(
    config: unknown,
  ): config is KageSchemaConfig<any, any, any, any, any, any, any> {
    return (
      typeof config === "object" &&
      config !== null &&
      "schemas" in config &&
      "handler" in config
    );
  }

  private resolvePath(path: string): string {
    return this.normalizePath(this.basePath, path);
  }

  private normalizePath(base: string, path: string): string {
    if (base === "/") {
      return path.startsWith("/") ? path : `/${path}`;
    }

    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  fetch = (req: Request): Response | Promise<Response> => {
    return this.handleRequest(req);
  };

  async listen(options: ListenOptions = {}): Promise<void> {
    const port = options.port ?? 8000;
    const hostname = options.hostname ?? "0.0.0.0";

    const server = Deno.serve(
      {
        port,
        hostname,
        onListen: options.onListen,
      },
      this.fetch,
    );

    await server.finished;
  }

  private async handleRequest(req: Request): Promise<Response> {
    const reqCtx = new Map<string, unknown>();
    const requestContext = {
      set: <T>(key: string, value: T) => reqCtx.set(key, value),
      get: <T = unknown>(key: string) => reqCtx.get(key) as T | undefined,
      has: (key: string) => reqCtx.has(key),
    };

    // Execute onRequest hooks
    for (const hook of this.pluginState.onRequestHooks) {
      const result = await hook(req, requestContext);
      if (result instanceof Response) {
        return result;
      }
      if (result !== null) {
        req = result;
      }
    }

    const urlStr = req.url;
    const method = req.method as HttpMethod;

    let pathname: string;
    const schemeEnd = urlStr.indexOf("://");
    if (schemeEnd === -1) {
      pathname = "/";
    } else {
      const pathStart = urlStr.indexOf("/", schemeEnd + 3);
      if (pathStart === -1) {
        pathname = "/";
      } else {
        let pathEnd = urlStr.indexOf("?", pathStart);
        if (pathEnd === -1) pathEnd = urlStr.indexOf("#", pathStart);
        if (pathEnd === -1) pathEnd = urlStr.length;
        pathname = urlStr.slice(pathStart, pathEnd);
      }
    }

    const match = this.router.find(method, pathname);

    if (!match) {
      return new Response(NOT_FOUND_BODY, { status: 404 });
    }

    try {
      const response = await this.executeRequest(req, match, pathname);

      // Execute onResponse hooks
      let finalResponse = response;
      for (const hook of this.pluginState.onResponseHooks) {
        finalResponse = await hook(finalResponse, req, requestContext);
      }

      return finalResponse;
    } catch (error) {
      return this.handleError(error, req, requestContext);
    }
  }

  private async handleError(
    error: unknown,
    req: Request,
    requestContext: {
      set: <T>(k: string, v: T) => void;
      get: <T>(k: string) => T | undefined;
      has: (k: string) => boolean;
    },
  ): Promise<Response> {
    // Execute onError hooks
    for (const hook of this.pluginState.onErrorHooks) {
      const result = await hook(error, req, requestContext);
      if (result !== null) {
        return result;
      }
    }

    return this.createErrorResponse(error);
  }

  private executeRequest(
    req: Request,
    match: Match,
    pathname: string,
  ): Response | Promise<Response> {
    const ctx = this.contextPool.acquire(req, match.params, null, pathname);
    const middlewareLen = this.middleware.length;

    if (middlewareLen === 0) {
      return this.executeHandlerDirect(ctx, match.handler);
    }

    if (middlewareLen === 1) {
      return this.executeSingleMiddleware(ctx, match.handler);
    }

    return this.executeMiddlewareChain(ctx, match.handler);
  }

  private executeHandlerDirect(
    ctx: Context,
    handler: Handler,
  ): Response | Promise<Response> {
    let result: unknown;
    try {
      result = handler(ctx);
    } catch (error) {
      this.contextPool.release(ctx);
      throw error;
    }

    if (result instanceof Response) {
      this.contextPool.release(ctx);
      return result;
    }

    if (result instanceof Promise) {
      return result.then(
        (r) => {
          const response = this.resultToResponse(r);
          this.contextPool.release(ctx);
          return response;
        },
        (error) => {
          this.contextPool.release(ctx);
          throw error;
        },
      );
    }

    const response = this.resultToResponse(result);
    this.contextPool.release(ctx);
    return response;
  }

  private async executeSingleMiddleware(
    ctx: Context,
    handler: Handler,
  ): Promise<Response> {
    try {
      const response = await this.middleware[0](ctx, async () => {
        const result = await handler(ctx);
        return this.resultToResponse(result);
      });
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      throw error;
    }
  }

  private async executeMiddlewareChain(
    ctx: Context,
    handler: Handler,
  ): Promise<Response> {
    try {
      const composed = this.getComposedMiddleware();
      const response = await composed(ctx, async () => {
        const result = await handler(ctx);
        return this.resultToResponse(result);
      });
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      throw error;
    }
  }

  private createErrorResponse(_error: unknown): Response {
    return new Response(INTERNAL_ERROR_BODY, { status: 500 });
  }

  private resultToResponse(result: unknown): Response {
    if (result instanceof Response) {
      return result;
    }

    if (result == null) {
      return new Response(null, { status: 204 });
    }

    if (typeof result === "object") {
      if (result instanceof Uint8Array) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      if (result instanceof ArrayBuffer) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      if (result instanceof ReadableStream) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      return Response.json(result);
    }

    if (typeof result === "string") {
      return new Response(result, TEXT_INIT_200);
    }

    return Response.json(result);
  }

  /**
   * Mount another Kage instance at a prefix.
   * All routes from the mounted app will be available under the specified prefix.
   * Routes from the mounted app will be wrapped with the parent app's plugins.
   *
   * @example
   * ```typescript
   * // With explicit prefix
   * const usersRouter = new Kage()
   *   .get("/", (ctx) => ctx.json({ users: [] }))
   *   .get("/:id", (ctx) => ctx.json({ id: ctx.params.id }));
   *
   * const app = new Kage()
   *   .decorate("db", database)
   *   .mount("/api/users", usersRouter)
   *   .get("/health", (ctx) => ctx.json({ status: "ok" }));
   *
   * // Routes:
   * // GET /api/users     -> usersRouter's "/" handler (with db decorator)
   * // GET /api/users/:id -> usersRouter's "/:id" handler (with db decorator)
   * // GET /health        -> app's "/health" handler
   *
   * // Using prefix from mounted app
   * const authRoutes = new Kage({ prefix: "/auth" })
   *   .get("/login", (ctx) => ctx.json({ route: "login" }))
   *   .post("/logout", (ctx) => ctx.json({ route: "logout" }));
   *
   * const app = new Kage()
   *   .mount(authRoutes);  // Uses "/auth" as prefix
   *
   * // Routes:
   * // GET /auth/login
   * // POST /auth/logout
   * ```
   */
  // deno-lint-ignore no-explicit-any
  mount(app: Kage<any, any, any>): this;
  // deno-lint-ignore no-explicit-any
  mount(prefix: string, app: Kage<any, any, any>): this;
  mount(
    // deno-lint-ignore no-explicit-any
    prefixOrApp: string | Kage<any, any, any>,
    // deno-lint-ignore no-explicit-any
    app?: Kage<any, any, any>,
  ): this {
    let prefix: string;
    let mountedAppBasePath: string;
    let mountedApp: Kage<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>
    >;

    if (typeof prefixOrApp === "string") {
      prefix = prefixOrApp;
      mountedApp = app!;
      mountedAppBasePath = mountedApp._getBasePath();
    } else {
      mountedApp = prefixOrApp;
      mountedAppBasePath = mountedApp._getBasePath();
      prefix = mountedAppBasePath;
    }

    const normalizedPrefix = this.normalizePath(this.basePath, prefix);
    const routes = mountedApp._getRoutes();

    for (const route of routes) {
      let relativePath = route.path;
      if (
        mountedAppBasePath !== "/" &&
        relativePath.startsWith(mountedAppBasePath)
      ) {
        relativePath = relativePath.slice(mountedAppBasePath.length) || "/";
      }
      relativePath = relativePath === "/" ? "" : relativePath;
      const fullPath = this.normalizePath(normalizedPrefix, relativePath);

      const pluginWrappedHandler = this.wrapWithPlugins(route.handler);
      this.router.add(route.method, fullPath, pluginWrappedHandler);

      this.rawRoutes.push({
        method: route.method,
        path: fullPath,
        handler: route.handler,
        hasSchema: route.hasSchema,
      });
    }

    return this;
  }

  /** @internal Used by KageGroup to register routes on parent */
  _addRouteInternal(method: HttpMethod, path: string, handler: Handler): void {
    this.router.add(method, path, handler);
  }

  /** @internal Get plugin state for groups */
  _getPluginState(): PluginSystemState<TDecorators, TState> {
    return this.pluginState;
  }

  /** @internal Get raw routes for mounting */
  _getRoutes(): RawRoute[] {
    return this.rawRoutes;
  }

  /** @internal Get base path for mounting without prefix */
  _getBasePath(): string {
    return this.basePath;
  }
}

/**
 * Route group with scoped plugin support.
 */
class KageGroup<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
> {
  private routes: Array<{
    method: HttpMethod;
    path: string;
    handler: Handler;
  }> = [];

  private localDeriveFns: Array<DeriveFn<Record<string, unknown>>> = [];
  private localDecorators: Record<string, unknown> = {};
  private localBeforeHandleHooks: Array<OnBeforeHandleHook<unknown>> = [];
  private localAfterHandleHooks: Array<OnAfterHandleHook<unknown>> = [];

  constructor(
    private parent: Kage<TDecorators, TState, TDerived>,
    private prefix: string,
    private inheritedState: PluginSystemState<TDecorators, TState>,
  ) {}

  decorate<K extends string, V>(
    key: K,
    value: V,
  ): KageGroup<TDecorators & { [P in K]: V }, TState, TDerived> {
    this.localDecorators[key] = value;
    return this as unknown as KageGroup<
      TDecorators & { [P in K]: V },
      TState,
      TDerived
    >;
  }

  derive<TNew extends Record<string, unknown>>(
    fn: DeriveFn<TNew>,
  ): KageGroup<TDecorators, TState, TDerived & TNew> {
    this.localDeriveFns.push(fn as DeriveFn<Record<string, unknown>>);
    return this as unknown as KageGroup<TDecorators, TState, TDerived & TNew>;
  }

  onBeforeHandle(
    hook: OnBeforeHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.localBeforeHandleHooks.push(hook as OnBeforeHandleHook<unknown>);
    return this;
  }

  onAfterHandle(
    hook: OnAfterHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.localAfterHandleHooks.push(hook as OnAfterHandleHook<unknown>);
    return this;
  }

  /**
   * Apply a plugin function to this group.
   * Plugins can add decorators, derived values, hooks, and routes scoped to this group.
   *
   * @example
   * ```typescript
   * const requireAuth = (group) =>
   *   group.onBeforeHandle((c) => {
   *     if (!c.isAuthenticated) return c.unauthorized();
   *   });
   *
   * app.group("/admin", (group) =>
   *   group
   *     .use(requireAuth)
   *     .get("/dashboard", (c) => c.json({ admin: true }))
   * );
   * ```
   */
  use<
    TOutDecorators extends Record<string, unknown>,
    TOutState extends Record<string, unknown>,
    TOutDerived extends Record<string, unknown>,
  >(
    plugin: (
      group: KageGroup<TDecorators, TState, TDerived>,
    ) => KageGroup<TOutDecorators, TOutState, TOutDerived>,
  ): KageGroup<TOutDecorators, TOutState, TOutDerived> {
    return plugin(this);
  }

  get<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("GET", path, handler as Handler);
    return this;
  }

  post<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("POST", path, handler as Handler);
    return this;
  }

  put<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("PUT", path, handler as Handler);
    return this;
  }

  patch<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("PATCH", path, handler as Handler);
    return this;
  }

  delete<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("DELETE", path, handler as Handler);
    return this;
  }

  head<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("HEAD", path, handler as Handler);
    return this;
  }

  options<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("OPTIONS", path, handler as Handler);
    return this;
  }

  private addRoute(method: HttpMethod, path: string, handler: Handler): void {
    const fullPath = this.normalizePath(this.prefix, path);
    const wrappedHandler = this.wrapWithGroupPlugins(handler);
    this.routes.push({ method, path: fullPath, handler: wrappedHandler });
  }

  private wrapWithGroupPlugins(handler: Handler): Handler {
    const allDeriveFns = [
      ...this.inheritedState.deriveFns,
      ...this.localDeriveFns,
    ];
    const allDecorators = {
      ...this.inheritedState.decorators,
      ...this.localDecorators,
    };
    const decoratorKeys = Object.keys(allDecorators);
    const state = this.inheritedState.state;
    const allBeforeHooks = [
      ...this.inheritedState.onBeforeHandleHooks,
      ...this.localBeforeHandleHooks,
    ];
    const allAfterHooks = [
      ...this.inheritedState.onAfterHandleHooks,
      ...this.localAfterHandleHooks,
    ];

    const hasDerive = allDeriveFns.length > 0;
    const hasDecorators = decoratorKeys.length > 0;
    const hasBeforeHooks = allBeforeHooks.length > 0;
    const hasAfterHooks = allAfterHooks.length > 0;

    if (!hasDerive && !hasDecorators && !hasBeforeHooks && !hasAfterHooks) {
      return (ctx: Context) => {
        (ctx as Context & { store: TState }).store = state;
        return handler(ctx);
      };
    }

    if (!hasDerive && !hasBeforeHooks && !hasAfterHooks) {
      return (ctx: Context) => {
        const extendedCtx = ctx as Context & TDecorators & { store: TState };
        for (const key of decoratorKeys) {
          (extendedCtx as Record<string, unknown>)[key] =
            allDecorators[key as keyof typeof allDecorators];
        }
        extendedCtx.store = state;
        return handler(extendedCtx);
      };
    }

    return async (ctx: Context) => {
      const extendedCtx = ctx as
        & Context
        & TDecorators
        & { store: TState }
        & TDerived;

      if (hasDecorators) {
        for (const key of decoratorKeys) {
          (extendedCtx as Record<string, unknown>)[key] =
            allDecorators[key as keyof typeof allDecorators];
        }
      }
      extendedCtx.store = state;

      if (hasDerive) {
        for (const deriveFn of allDeriveFns) {
          const derived = deriveFn(ctx);
          if (derived instanceof Promise) {
            const resolvedDerived = await derived;
            for (const key in resolvedDerived) {
              (extendedCtx as Record<string, unknown>)[key] =
                resolvedDerived[key];
            }
          } else {
            for (const key in derived) {
              (extendedCtx as Record<string, unknown>)[key] = derived[key];
            }
          }
        }
      }

      if (hasBeforeHooks) {
        for (const hook of allBeforeHooks) {
          const result = hook(extendedCtx);
          if (result instanceof Response) {
            return result;
          }
          if (result instanceof Promise) {
            const resolved = await result;
            if (resolved instanceof Response) {
              return resolved;
            }
          }
        }
      }

      let response = handler(extendedCtx);
      if (response instanceof Promise) {
        response = await response;
      }
      if (!(response instanceof Response)) {
        response = this.resultToResponse(response);
      }

      if (hasAfterHooks) {
        for (const hook of allAfterHooks) {
          const hookResult = hook(extendedCtx, response as Response);
          if (hookResult instanceof Promise) {
            response = await hookResult;
          } else {
            response = hookResult;
          }
        }
      }

      return response;
    };
  }

  private normalizePath(base: string, path: string): string {
    if (base === "/") {
      return path.startsWith("/") ? path : `/${path}`;
    }

    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  private resultToResponse(result: unknown): Response {
    if (result instanceof Response) {
      return result;
    }

    if (result == null) {
      return new Response(null, { status: 204 });
    }

    if (typeof result === "object") {
      if (result instanceof Uint8Array) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      if (result instanceof ArrayBuffer) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      if (result instanceof ReadableStream) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      return Response.json(result);
    }

    if (typeof result === "string") {
      return new Response(result, TEXT_INIT_200);
    }

    return Response.json(result);
  }

  /** @internal Apply routes to parent app */
  applyToParent(): void {
    for (const route of this.routes) {
      this.parent._addRouteInternal(route.method, route.path, route.handler);
    }
  }
}

export { KageGroup };
