/**
 * Main Kage application class.
 * Optimized for maximum performance on Deno.
 */

import {
  type Handler,
  type HttpMethod,
  type Match,
  RadixRouter,
  releaseRadixParams,
} from "@kage/router";
import type { Static, TSchema } from "@sinclair/typebox";
import { createLogger, isLogger } from "~/app/logger.ts";
import type {
  KageConfig,
  ListenOptions,
  Logger,
  LoggerConfig,
} from "~/app/types.ts";
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
  PluginFn,
  PluginSystemState,
} from "~/plugins/types.ts";

// deno-lint-ignore ban-types
type EmptyObject = {};

export type KageHandler<
  TDecorators extends Record<string, unknown> = EmptyObject,
  TState extends Record<string, unknown> = EmptyObject,
  TDerived extends Record<string, unknown> = EmptyObject,
> = (
  ctx: Context & TDecorators & { store: TState } & TDerived,
) => unknown | Promise<unknown>;

export interface KageRouteConfig<
  TDecorators extends Record<string, unknown> = EmptyObject,
  TState extends Record<string, unknown> = EmptyObject,
  TDerived extends Record<string, unknown> = EmptyObject,
> {
  handler: KageHandler<TDecorators, TState, TDerived>;
}

export interface KageSchemaContext<
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
  readonly store: Record<string, unknown>;
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

export type KageSchemaHandler<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> = (
  ctx: KageSchemaContext<TParams, TQuery, TBody>,
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
    InferSchema<TParamsSchema, Record<string, string>>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>
  >;
}

const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const OCTET_CONTENT_TYPE = "application/octet-stream";

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
  TDecorators extends Record<string, unknown> = EmptyObject,
  TState extends Record<string, unknown> = EmptyObject,
  TDerived extends Record<string, unknown> = EmptyObject,
> {
  private router: RadixRouter;
  private config: KageConfig;
  private middleware: Middleware[];
  private composedMiddleware:
    | ((ctx: Context, next: () => Promise<Response>) => Promise<Response>)
    | null = null;
  private contextPool: ContextPool;
  private isDev: boolean;
  readonly log: Logger | undefined;

  private pluginState: PluginSystemState<TDecorators, TState>;
  private basePath: string;

  constructor(config: KageConfig = {}) {
    this.router = new RadixRouter();
    this.middleware = [];
    this.config = {
      development: false,
      basePath: "/",
      ...config,
    };
    this.basePath = this.config.basePath ?? "/";
    this.isDev = this.config.development ?? false;
    this.log = this.initLogger(config.logger);
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

  private initLogger(
    loggerOption: boolean | LoggerConfig | Logger | undefined,
  ): Logger | undefined {
    if (!loggerOption) {
      return undefined;
    }

    if (loggerOption === true) {
      return createLogger({
        name: "kage",
        level: this.isDev ? "debug" : "info",
      });
    }

    if (isLogger(loggerOption)) {
      return loggerOption;
    }

    return createLogger({
      name: "kage",
      level: this.isDev ? "debug" : "info",
      ...loggerOption,
    });
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
   * function authPlugin<T extends Kage>(app: T) {
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
    TResult extends Kage<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>
    >,
  >(
    plugin: PluginFn<this, TResult>,
  ): TResult;

  use<
    TResult extends Kage<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>
    >,
  >(
    pluginOrMiddleware: PluginFn<this, TResult> | Middleware,
  ): this | TResult {
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
      return (pluginOrMiddleware as PluginFn<this, TResult>)(this);
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
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  get(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  get(path: string, handler: KageHandler<TDecorators, TState, TDerived>): this;
  get(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("GET", path, handlerOrConfig);
    return this;
  }

  post<
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  post(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  post(path: string, handler: KageHandler<TDecorators, TState, TDerived>): this;
  post(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("POST", path, handlerOrConfig);
    return this;
  }

  put<
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  put(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  put(path: string, handler: KageHandler<TDecorators, TState, TDerived>): this;
  put(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("PUT", path, handlerOrConfig);
    return this;
  }

  patch<
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  patch(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  patch(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this;
  patch(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("PATCH", path, handlerOrConfig);
    return this;
  }

  delete<
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  delete(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  delete(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this;
  delete(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("DELETE", path, handlerOrConfig);
    return this;
  }

  head<
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  head(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  head(path: string, handler: KageHandler<TDecorators, TState, TDerived>): this;
  head(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("HEAD", path, handlerOrConfig);
    return this;
  }

  options<
    TBodySchema extends TSchema | undefined = undefined,
    TQuerySchema extends TSchema | undefined = undefined,
    TParamsSchema extends TSchema | undefined = undefined,
    TResponseSchema extends TSchema | undefined = undefined,
  >(
    path: string,
    config: KageSchemaConfig<
      TBodySchema,
      TQuerySchema,
      TParamsSchema,
      TResponseSchema
    >,
  ): this;
  options(
    path: string,
    config: KageRouteConfig<TDecorators, TState, TDerived>,
  ): this;
  options(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this;
  options(
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): this {
    this.addRoute("OPTIONS", path, handlerOrConfig);
    return this;
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    handlerOrConfig:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): void {
    const fullPath = this.resolvePath(path);

    if (this.isSchemaConfig(handlerOrConfig)) {
      const wrappedHandler = wrapTypedHandler(
        handlerOrConfig.handler as (ctx: unknown) => unknown,
        handlerOrConfig.schemas,
      );
      const pluginWrappedHandler = this.wrapWithPlugins(
        wrappedHandler as Handler,
      );
      this.router.add(method, fullPath, pluginWrappedHandler);
      return;
    }

    const handler = typeof handlerOrConfig === "function"
      ? handlerOrConfig
      : handlerOrConfig.handler;

    const pluginWrappedHandler = this.wrapWithPlugins(handler as Handler);
    this.router.add(method, fullPath, pluginWrappedHandler);
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

  private isSchemaConfig(
    config:
      | KageHandler<TDecorators, TState, TDerived>
      | KageRouteConfig<TDecorators, TState, TDerived>
      | KageSchemaConfig,
  ): config is KageSchemaConfig {
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
    // Execute onRequest hooks
    for (const hook of this.pluginState.onRequestHooks) {
      const result = await hook(req);
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
        finalResponse = await hook(finalResponse, req);
      }

      return finalResponse;
    } catch (error) {
      return this.handleError(error, req);
    }
  }

  private async handleError(error: unknown, req: Request): Promise<Response> {
    // Execute onError hooks
    for (const hook of this.pluginState.onErrorHooks) {
      const result = await hook(error, req);
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
    const params = ctx.params;
    let result: unknown;
    try {
      result = handler(ctx);
    } catch (error) {
      releaseRadixParams(params);
      this.contextPool.release(ctx);
      throw error;
    }

    if (result instanceof Response) {
      releaseRadixParams(params);
      this.contextPool.release(ctx);
      return result;
    }

    if (result instanceof Promise) {
      return result.then(
        (r) => {
          const response = this.resultToResponse(r);
          releaseRadixParams(params);
          this.contextPool.release(ctx);
          return response;
        },
        (error) => {
          releaseRadixParams(params);
          this.contextPool.release(ctx);
          throw error;
        },
      );
    }

    const response = this.resultToResponse(result);
    releaseRadixParams(params);
    this.contextPool.release(ctx);
    return response;
  }

  private async executeSingleMiddleware(
    ctx: Context,
    handler: Handler,
  ): Promise<Response> {
    const params = ctx.params;
    try {
      const response = await this.middleware[0](ctx, async () => {
        const result = await handler(ctx);
        return this.resultToResponse(result);
      });
      releaseRadixParams(params);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      releaseRadixParams(params);
      this.contextPool.release(ctx);
      throw error;
    }
  }

  private async executeMiddlewareChain(
    ctx: Context,
    handler: Handler,
  ): Promise<Response> {
    const params = ctx.params;
    try {
      const composed = this.getComposedMiddleware();
      const response = await composed(ctx, async () => {
        const result = await handler(ctx);
        return this.resultToResponse(result);
      });
      releaseRadixParams(params);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      releaseRadixParams(params);
      this.contextPool.release(ctx);
      throw error;
    }
  }

  private createErrorResponse(error: unknown): Response {
    if (this.log) {
      this.log.error("Request handler error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } else if (this.isDev) {
      console.error("Request handler error:", error);
    }
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

  /** @internal Used by KageGroup to register routes on parent */
  _addRouteInternal(method: HttpMethod, path: string, handler: Handler): void {
    this.router.add(method, path, handler);
  }

  /** @internal Get plugin state for groups */
  _getPluginState(): PluginSystemState<TDecorators, TState> {
    return this.pluginState;
  }
}

/**
 * Route group with scoped plugin support.
 */
class KageGroup<
  TDecorators extends Record<string, unknown> = EmptyObject,
  TState extends Record<string, unknown> = EmptyObject,
  TDerived extends Record<string, unknown> = EmptyObject,
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

  get(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this {
    this.addRoute("GET", path, handler as Handler);
    return this;
  }

  post(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this {
    this.addRoute("POST", path, handler as Handler);
    return this;
  }

  put(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this {
    this.addRoute("PUT", path, handler as Handler);
    return this;
  }

  patch(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this {
    this.addRoute("PATCH", path, handler as Handler);
    return this;
  }

  delete(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this {
    this.addRoute("DELETE", path, handler as Handler);
    return this;
  }

  head(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
  ): this {
    this.addRoute("HEAD", path, handler as Handler);
    return this;
  }

  options(
    path: string,
    handler: KageHandler<TDecorators, TState, TDerived>,
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
