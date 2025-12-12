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
  ContextState,
  DeriveFn,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
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
const TEXT_HEADERS: HeadersInit = { "Content-Type": TEXT_CONTENT_TYPE };
const BINARY_HEADERS: HeadersInit = { "Content-Type": OCTET_CONTENT_TYPE };
const TEXT_INIT_200: ResponseInit = { headers: TEXT_HEADERS };
const BINARY_INIT_200: ResponseInit = { headers: BINARY_HEADERS };
const NOT_FOUND_BODY = "Not Found";
const INTERNAL_ERROR_BODY = "Internal Server Error";

/** @internal Route definition for mounting */
interface RawRoute {
  method: HttpMethod;
  path: string;
  handler: Handler;
  hasSchema: boolean;
}

function normalizePath(base: string, path: string): string {
  if (base === "/") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function resultToResponse(result: unknown): Response {
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

/** Apply decorators to context (mutates ctx) */
function applyDecorators(
  ctx: Record<string, unknown>,
  decorators: Record<string, unknown>,
  keys: string[],
): void {
  for (let i = 0; i < keys.length; i++) {
    ctx[keys[i]] = decorators[keys[i]];
  }
}

/** Apply derive functions to context (mutates ctx) */
async function applyDerives(
  ctx: Context,
  extendedCtx: Record<string, unknown>,
  deriveFns: DeriveFn<Record<string, unknown>>[],
): Promise<void> {
  for (let i = 0; i < deriveFns.length; i++) {
    const derived = deriveFns[i](ctx);
    const resolvedDerived = derived instanceof Promise
      ? await derived
      : derived;
    for (const key in resolvedDerived) {
      extendedCtx[key] = resolvedDerived[key];
    }
  }
}

/** Execute before handle hooks, return Response if short-circuited */
async function executeBeforeHooks(
  ctx: unknown,
  hooks: OnBeforeHandleHook<unknown>[],
): Promise<Response | null> {
  for (let i = 0; i < hooks.length; i++) {
    const result = hooks[i](ctx);
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
  return null;
}

/** Execute after handle hooks */
async function executeAfterHooks(
  ctx: unknown,
  response: Response,
  hooks: OnAfterHandleHook<unknown>[],
): Promise<Response> {
  let res = response;
  for (let i = 0; i < hooks.length; i++) {
    const hookResult = hooks[i](ctx, res);
    res = hookResult instanceof Promise ? await hookResult : hookResult;
  }
  return res;
}

interface PluginWrapperConfig<TState> {
  deriveFns: DeriveFn<Record<string, unknown>>[];
  decorators: Record<string, unknown>;
  decoratorKeys: string[];
  state: TState;
  beforeHooks: OnBeforeHandleHook<unknown>[];
  afterHooks: OnAfterHandleHook<unknown>[];
  onErrorHooks?: OnErrorHook[];
}

function createPluginWrapper<TState>(
  handler: Handler,
  config: PluginWrapperConfig<TState>,
): Handler {
  const {
    deriveFns,
    decorators,
    decoratorKeys,
    state,
    beforeHooks,
    afterHooks,
    onErrorHooks,
  } = config;

  const hasDerive = deriveFns.length > 0;
  const hasDecorators = decoratorKeys.length > 0;
  const hasBeforeHooks = beforeHooks.length > 0;
  const hasAfterHooks = afterHooks.length > 0;
  const hasErrorHooks = onErrorHooks && onErrorHooks.length > 0;

  if (
    !hasDerive && !hasDecorators && !hasBeforeHooks && !hasAfterHooks &&
    !hasErrorHooks
  ) {
    return (ctx: Context) => {
      (ctx as Context & { store: TState }).store = state;
      return handler(ctx);
    };
  }

  if (!hasDerive && !hasBeforeHooks && !hasAfterHooks && !hasErrorHooks) {
    return (ctx: Context) => {
      const extendedCtx = Object.create(ctx) as
        & Context
        & Record<string, unknown>
        & { store: TState };
      applyDecorators(extendedCtx, decorators, decoratorKeys);
      extendedCtx.store = state;
      return handler(extendedCtx);
    };
  }

  return async (ctx: Context) => {
    const extendedCtx = Object.create(ctx) as
      & Context
      & Record<string, unknown>
      & { store: TState };

    if (hasDecorators) {
      applyDecorators(extendedCtx, decorators, decoratorKeys);
    }

    extendedCtx.store = state;

    if (hasDerive) {
      await applyDerives(
        extendedCtx as unknown as Context,
        extendedCtx,
        deriveFns,
      );
    }

    if (hasBeforeHooks) {
      const earlyResponse = await executeBeforeHooks(extendedCtx, beforeHooks);
      if (earlyResponse) return earlyResponse;
    }

    let response: Response;
    try {
      let result = handler(extendedCtx);
      if (result instanceof Promise) {
        result = await result;
      }
      response = result instanceof Response ? result : resultToResponse(result);
    } catch (error) {
      if (hasErrorHooks) {
        for (const hook of onErrorHooks!) {
          const errorResponse = await hook(error, ctx.request, {
            set: () => {},
            get: () => undefined,
            has: () => false,
          });
          if (errorResponse) return errorResponse;
        }
      }
      throw error;
    }

    if (hasAfterHooks) {
      response = await executeAfterHooks(extendedCtx, response, afterHooks);
    }

    return response;
  };
}

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

  /**
   * Add an immutable singleton value to all handlers.
   */
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

  /**
   * Add mutable global state accessible via ctx.store.
   */
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

  /**
   * Derive values from request context.
   */
  derive<TNew extends Record<string, unknown>>(
    fn: DeriveFn<TNew>,
  ): Kage<TDecorators, TState, TDerived & TNew> {
    this.contextState.deriveFns.push(fn as DeriveFn<Record<string, unknown>>);
    return this as unknown as Kage<TDecorators, TState, TDerived & TNew>;
  }

  /**
   * Add middleware to the application.
   */
  use(middleware: Middleware): this;

  /**
   * Apply a plugin function to this app instance.
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

  /**
   * Create a route group with a prefix and optional scoped plugins.
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
      normalizePath(this.basePath, prefix),
      { ...this.contextState },
    );

    const configuredGroup = configure(group);
    configuredGroup.applyToParent();

    return this;
  }

  /**
   * Register a hook that runs before route matching.
   */
  onRequest(hook: OnRequestHook): this {
    this.contextState.onRequestHooks.push(hook);
    return this;
  }

  /**
   * Register a hook that runs after handler execution.
   */
  onResponse(hook: OnResponseHook): this {
    this.contextState.onResponseHooks.push(hook);
    return this;
  }

  /**
   * Register an error handler hook.
   */
  onError(hook: OnErrorHook): this {
    this.contextState.onErrorHooks.push(hook);
    return this;
  }

  /**
   * Register a hook that runs before handler execution.
   */
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

  /**
   * Register a hook that runs after handler execution.
   */
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

    // Execute onRequest hooks
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

      // Execute onResponse hooks
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

  private createErrorResponse(_error: unknown): Response {
    return new Response(INTERNAL_ERROR_BODY, { status: 500 });
  }

  /**
   * Mount another Kage instance at a prefix.
   */
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

  /** @internal Used by KageGroup to register routes on parent */
  _addRouteInternal(method: HttpMethod, path: string, handler: Handler): void {
    this.router.add(method, path, handler);
  }

  /** @internal Get context state for groups */
  _getContextState(): ContextState<TDecorators, TState> {
    return this.contextState;
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
  private localState: Record<string, unknown> = {};
  private localBeforeHandleHooks: Array<OnBeforeHandleHook<unknown>> = [];
  private localAfterHandleHooks: Array<OnAfterHandleHook<unknown>> = [];
  private localOnErrorHooks: OnErrorHook[] = [];

  constructor(
    private parent: Kage<TDecorators, TState, TDerived>,
    private prefix: string,
    private inheritedState: ContextState<TDecorators, TState>,
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

  state<K extends string, V>(
    key: K,
    initialValue: V,
  ): KageGroup<TDecorators, TState & { [P in K]: V }, TDerived> {
    this.localState[key] = initialValue;
    return this as unknown as KageGroup<
      TDecorators,
      TState & { [P in K]: V },
      TDerived
    >;
  }

  derive<TNew extends Record<string, unknown>>(
    fn: DeriveFn<TNew>,
  ): KageGroup<TDecorators, TState, TDerived & TNew> {
    this.localDeriveFns.push(fn as DeriveFn<Record<string, unknown>>);
    return this as unknown as KageGroup<TDecorators, TState, TDerived & TNew>;
  }

  /**
   * Register a hook that runs before route matching for this group.
   */
  onRequest(hook: OnRequestHook): this {
    this.localBeforeHandleHooks.unshift(
      ((ctx: Context) => {
        const reqCtx = {
          set: <T>(key: string, value: T) => {
            ctx.state[key] = value;
          },
          get: <T = unknown>(key: string) => ctx.state[key] as T | undefined,
          has: (key: string) => key in ctx.state,
        };
        return hook(ctx.request, reqCtx);
      }) as OnBeforeHandleHook<unknown>,
    );
    return this;
  }

  /**
   * Register a hook that runs after handler execution for this group.
   */
  onResponse(hook: OnResponseHook): this {
    this.localAfterHandleHooks.push(
      ((ctx: Context, response: Response) => {
        const reqCtx = {
          set: <T>(key: string, value: T) => {
            ctx.state[key] = value;
          },
          get: <T = unknown>(key: string) => ctx.state[key] as T | undefined,
          has: (key: string) => key in ctx.state,
        };
        return hook(response, ctx.request, reqCtx);
      }) as unknown as OnAfterHandleHook<unknown>,
    );
    return this;
  }

  /**
   * Register an error handler hook for this group.
   */
  onError(hook: OnErrorHook): this {
    this.localOnErrorHooks.push(hook);
    return this;
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

  /**
   * Create a nested route group with a prefix.
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
    const mergedState: ContextState<TDecorators, TState> = {
      decorators: {
        ...this.inheritedState.decorators,
        ...this.localDecorators,
      } as TDecorators,
      state: {
        ...this.inheritedState.state,
        ...this.localState,
      } as TState,
      deriveFns: [
        ...this.inheritedState.deriveFns,
        ...this.localDeriveFns,
      ],
      onRequestHooks: [],
      onResponseHooks: [],
      onErrorHooks: [],
      onBeforeHandleHooks: [
        ...this.inheritedState.onBeforeHandleHooks,
        ...this.localBeforeHandleHooks,
      ],
      onAfterHandleHooks: [
        ...this.inheritedState.onAfterHandleHooks,
        ...this.localAfterHandleHooks,
      ],
    };

    const nestedGroup = new KageGroup<TDecorators, TState, TDerived>(
      this.parent,
      normalizePath(this.prefix, prefix),
      mergedState,
    );

    nestedGroup.localOnErrorHooks = [...this.localOnErrorHooks];

    const configuredGroup = configure(nestedGroup);

    for (const route of configuredGroup._getRoutes()) {
      this.routes.push(route);
    }

    return this;
  }

  /** @internal Get routes for nested groups */
  _getRoutes(): Array<{ method: HttpMethod; path: string; handler: Handler }> {
    return this.routes;
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
    const fullPath = normalizePath(this.prefix, path);
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
    const state = Object.assign(
      Object.create(this.inheritedState.state),
      this.localState,
    ) as TState;
    const allBeforeHooks = [
      ...this.inheritedState.onBeforeHandleHooks,
      ...this.localBeforeHandleHooks,
    ];
    const allAfterHooks = [
      ...this.inheritedState.onAfterHandleHooks,
      ...this.localAfterHandleHooks,
    ];

    return createPluginWrapper(handler, {
      deriveFns: allDeriveFns,
      decorators: allDecorators,
      decoratorKeys: Object.keys(allDecorators),
      state,
      beforeHooks: allBeforeHooks,
      afterHooks: allAfterHooks,
      onErrorHooks: this.localOnErrorHooks.length > 0
        ? this.localOnErrorHooks
        : undefined,
    });
  }

  /** @internal Apply routes to parent app (only routes, NOT hooks) */
  applyToParent(): void {
    for (const route of this.routes) {
      this.parent._addRouteInternal(route.method, route.path, route.handler);
    }
  }
}

export { KageGroup };
