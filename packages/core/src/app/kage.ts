import {
  type Handler,
  type HttpMethod,
  type Match,
  Router,
} from "~/router/mod.ts";
import type { Static, TSchema } from "@sinclair/typebox";
import type {
  ContextState,
  DeriveFn,
  KageConfig,
  ListenOptions,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
} from "~/app/types.ts";
import { Context, ContextPool } from "~/context/mod.ts";
import { compose, type Middleware } from "~/middleware/mod.ts";
import { wrapTypedHandler } from "~/routing/builder.ts";
import type { PathParams } from "~/routing/types.ts";
import { KageGroup } from "~/app/group.ts";
import {
  createPluginWrapper,
  INTERNAL_ERROR_BODY,
  normalizePath,
  NOT_FOUND_BODY,
  resultToResponse,
} from "~/app/helpers.ts";

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

interface RawRoute {
  method: HttpMethod;
  path: string;
  handler: Handler;
  hasSchema: boolean;
}

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
  private contextState: ContextState<TDecorators, TState>;
  private basePath: string;
  private rawRoutes: RawRoute[] = [];

  constructor(config: KageConfig = {}) {
    this.router = new Router();
    this.middleware = [];
    this.basePath = config.prefix ?? "/";
    this.contextPool = new ContextPool(256);
    this.contextPool.preallocate(64);

    this.contextState = {
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

  decorate<K extends string, V>(
    key: K,
    value: V,
  ): Kage<TDecorators & { [P in K]: V }, TState, TDerived> {
    const newDecorators = {
      ...this.contextState.decorators,
      [key]: value,
    } as TDecorators & { [P in K]: V };

    this.contextState.decorators = newDecorators as TDecorators;

    return this as unknown as Kage<
      TDecorators & { [P in K]: V },
      TState,
      TDerived
    >;
  }

  state<K extends string, V>(
    key: K,
    initialValue: V,
  ): Kage<TDecorators, TState & { [P in K]: V }, TDerived> {
    const newState = {
      ...this.contextState.state,
      [key]: initialValue,
    } as TState & { [P in K]: V };

    this.contextState.state = newState as TState;

    return this as unknown as Kage<
      TDecorators,
      TState & { [P in K]: V },
      TDerived
    >;
  }

  derive<TNew extends Record<string, unknown>>(
    fn: DeriveFn<TNew>,
  ): Kage<TDecorators, TState, TDerived & TNew> {
    this.contextState.deriveFns.push(fn as DeriveFn<Record<string, unknown>>);
    return this as unknown as Kage<TDecorators, TState, TDerived & TNew>;
  }

  use(middleware: Middleware): this;
  use<
    TOutDecorators extends Record<string, unknown>,
    TOutState extends Record<string, unknown>,
    TOutDerived extends Record<string, unknown>,
  >(
    plugin: (
      app: Kage<TDecorators, TState, TDerived>,
    ) => Kage<TOutDecorators, TOutState, TOutDerived>,
  ): Kage<TOutDecorators, TOutState, TOutDerived>;
  // deno-lint-ignore no-explicit-any
  use(pluginOrMiddleware: any): any {
    if (
      typeof pluginOrMiddleware === "function" &&
      pluginOrMiddleware.length === 2
    ) {
      this.middleware.push(pluginOrMiddleware as Middleware);
      this.composedMiddleware = null;
      return this;
    }

    if (
      typeof pluginOrMiddleware === "function" &&
      pluginOrMiddleware.length === 1
    ) {
      return pluginOrMiddleware(this);
    }

    this.middleware.push(pluginOrMiddleware as Middleware);
    this.composedMiddleware = null;
    return this;
  }

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
      normalizePath(this.basePath, prefix),
      { ...this.contextState },
    );

    const configuredGroup = configure(group);
    configuredGroup.applyToParent();

    return this;
  }

  onRequest(hook: OnRequestHook): this {
    this.contextState.onRequestHooks.push(hook);
    return this;
  }

  onResponse(hook: OnResponseHook): this {
    this.contextState.onResponseHooks.push(hook);
    return this;
  }

  onError(hook: OnErrorHook): this {
    this.contextState.onErrorHooks.push(hook);
    return this;
  }

  onBeforeHandle(
    hook: OnBeforeHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.contextState.onBeforeHandleHooks.push(
      hook as OnBeforeHandleHook<unknown>,
    );
    return this;
  }

  onAfterHandle(
    hook: OnAfterHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.contextState.onAfterHandleHooks.push(
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
  // deno-lint-ignore no-explicit-any
  get(path: string, handlerOrConfig: any, handler?: any): this {
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
  // deno-lint-ignore no-explicit-any
  post(path: string, handlerOrConfig: any, handler?: any): this {
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
  // deno-lint-ignore no-explicit-any
  put(path: string, handlerOrConfig: any, handler?: any): this {
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
  // deno-lint-ignore no-explicit-any
  patch(path: string, handlerOrConfig: any, handler?: any): this {
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
  // deno-lint-ignore no-explicit-any
  delete(path: string, handlerOrConfig: any, handler?: any): this {
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
  // deno-lint-ignore no-explicit-any
  head(path: string, handlerOrConfig: any, handler?: any): this {
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
  // deno-lint-ignore no-explicit-any
  options(path: string, handlerOrConfig: any, handler?: any): this {
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
    const fullPath = normalizePath(this.basePath, path);

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
    return createPluginWrapper(handler, {
      deriveFns: this.contextState.deriveFns,
      decorators: this.contextState.decorators,
      decoratorKeys: Object.keys(this.contextState.decorators),
      state: this.contextState.state,
      beforeHooks: this.contextState.onBeforeHandleHooks,
      afterHooks: this.contextState.onAfterHandleHooks,
    });
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

    for (const hook of this.contextState.onRequestHooks) {
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

      let finalResponse = response;
      for (const hook of this.contextState.onResponseHooks) {
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
    for (const hook of this.contextState.onErrorHooks) {
      const result = await hook(error, req, requestContext);
      if (result !== null) {
        return result;
      }
    }

    return this.createErrorResponse();
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
          const response = resultToResponse(r);
          this.contextPool.release(ctx);
          return response;
        },
        (error) => {
          this.contextPool.release(ctx);
          throw error;
        },
      );
    }

    const response = resultToResponse(result);
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
        return resultToResponse(result);
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
        return resultToResponse(result);
      });
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      throw error;
    }
  }

  private createErrorResponse(): Response {
    return new Response(INTERNAL_ERROR_BODY, { status: 500 });
  }

  // deno-lint-ignore no-explicit-any
  mount(app: Kage<any, any, any>): this;
  // deno-lint-ignore no-explicit-any
  mount(prefix: string, app: Kage<any, any, any>): this;
  mount(
    prefix: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): this;
  mount(
    // deno-lint-ignore no-explicit-any
    prefixOrApp: string | Kage<any, any, any>,
    // deno-lint-ignore no-explicit-any
    appOrHandler?:
      | Kage<any, any, any>
      | ((request: Request) => Response | Promise<Response>),
  ): this {
    if (
      typeof prefixOrApp === "string" &&
      typeof appOrHandler === "function" &&
      !(appOrHandler instanceof Kage)
    ) {
      return this.mountHandler(prefixOrApp, appOrHandler);
    }

    let prefix: string;
    let mountedAppBasePath: string;
    let mountedApp: Kage<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>
    >;

    if (typeof prefixOrApp === "string") {
      prefix = prefixOrApp;
      mountedApp = appOrHandler as Kage<
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>
      >;
      mountedAppBasePath = mountedApp._getBasePath();
    } else {
      mountedApp = prefixOrApp;
      mountedAppBasePath = mountedApp._getBasePath();
      prefix = mountedAppBasePath;
    }

    const normalizedPrefix = normalizePath(this.basePath, prefix);
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
      const fullPath = normalizePath(normalizedPrefix, relativePath);

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

  private mountHandler(
    prefix: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): this {
    const normalizedPrefix = normalizePath(this.basePath, prefix);
    const wildcardPath = `${normalizedPrefix}/*`;

    const wrappedHandler: Handler = (ctx: Context) => {
      return handler(ctx.request);
    };

    const methods: HttpMethod[] = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ];

    for (const method of methods) {
      this.router.add(method, wildcardPath, wrappedHandler);
      this.rawRoutes.push({
        method,
        path: wildcardPath,
        handler: wrappedHandler,
        hasSchema: false,
      });
    }

    for (const method of methods) {
      try {
        this.router.add(method, normalizedPrefix, wrappedHandler);
        this.rawRoutes.push({
          method,
          path: normalizedPrefix,
          handler: wrappedHandler,
          hasSchema: false,
        });
      } catch {
        // ignore
      }
    }

    return this;
  }

  _addRouteInternal(method: HttpMethod, path: string, handler: Handler): void {
    this.router.add(method, path, handler);
  }

  _getContextState(): ContextState<TDecorators, TState> {
    return this.contextState;
  }

  _getRoutes(): RawRoute[] {
    return this.rawRoutes;
  }

  _getBasePath(): string {
    return this.basePath;
  }
}

export { KageGroup };
