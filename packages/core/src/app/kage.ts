/**
 * Main Kage application class.
 * Optimized for maximum performance on Deno.
 */

import {
  type Handler,
  type HttpMethod,
  type Match,
  releaseParams,
  Router,
} from "@kage/router";
import type { Static, TSchema } from "@sinclair/typebox";
import type { KageConfig, ListenOptions } from "~/app/types.ts";
import { Context, ContextPool } from "~/context/mod.ts";
import { compose, type Middleware } from "~/middleware/mod.ts";
import { wrapTypedHandler } from "~/routing/builder.ts";

/** Handler function that receives a Context and returns a response. */
export type KageHandler = (ctx: Context) => unknown | Promise<unknown>;

/** Route configuration with handler. */
export interface KageRouteConfig {
  handler: KageHandler;
}

/** Context with validated data for schema routes. */
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

/** Handler for schema-validated routes. */
export type KageSchemaHandler<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> = (
  ctx: KageSchemaContext<TParams, TQuery, TBody>,
) => unknown | Promise<unknown>;

/** Infer type from schema or use default. */
type InferSchema<T, Default = unknown> = T extends TSchema ? Static<T>
  : Default;

/** Schema configuration object. */
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

/** Route configuration with schema validation and type inference. */
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

// Pre-computed headers for monomorphic response creation
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const OCTET_CONTENT_TYPE = "application/octet-stream";

// Frozen header objects - reused across all responses
const JSON_HEADERS: HeadersInit = { "Content-Type": JSON_CONTENT_TYPE };
const TEXT_HEADERS: HeadersInit = { "Content-Type": TEXT_CONTENT_TYPE };
const BINARY_HEADERS: HeadersInit = { "Content-Type": OCTET_CONTENT_TYPE };

// Pre-allocated response init objects for common status codes
const JSON_INIT_200: ResponseInit = { headers: JSON_HEADERS };
const TEXT_INIT_200: ResponseInit = { headers: TEXT_HEADERS };
const BINARY_INIT_200: ResponseInit = { headers: BINARY_HEADERS };

// Static responses - no clone needed, Response body is null or consumed
const NOT_FOUND_BODY = "Not Found";
const INTERNAL_ERROR_BODY = "Internal Server Error";

/**
 * Kage application class.
 *
 * @example
 * ```typescript
 * const app = new Kage();
 *
 * app.use(logger());
 * app.use(cors());
 *
 * app.get("/users", (ctx) => ctx.json({ users: [] }));
 * app.post("/users", (ctx) => ctx.json({ created: true }));
 *
 * await app.listen({ port: 8000 });
 * ```
 */
export class Kage {
  private router: Router;
  private config: KageConfig;
  private middleware: Middleware[];
  private composedMiddleware:
    | ((ctx: Context, next: () => Promise<Response>) => Promise<Response>)
    | null = null;
  private contextPool: ContextPool;
  private isDev: boolean;

  constructor(config: KageConfig = {}) {
    this.router = new Router();
    this.middleware = [];
    this.config = {
      development: false,
      basePath: "/",
      ...config,
    };
    this.isDev = this.config.development ?? false;
    // Pre-allocate context pool for warm start
    this.contextPool = new ContextPool(256);
    this.contextPool.preallocate(64);
  }

  /**
   * Add global middleware to the application.
   */
  use(middleware: Middleware): this {
    this.middleware.push(middleware);
    this.composedMiddleware = null;
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

  /**
   * Register a GET route.
   */
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
  get(path: string, config: KageRouteConfig): this;
  get(path: string, handler: KageHandler): this;
  get(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("GET", path, handlerOrConfig);
    return this;
  }

  /**
   * Register a POST route.
   */
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
  post(path: string, config: KageRouteConfig): this;
  post(path: string, handler: KageHandler): this;
  post(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("POST", path, handlerOrConfig);
    return this;
  }

  /**
   * Register a PUT route.
   */
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
  put(path: string, config: KageRouteConfig): this;
  put(path: string, handler: KageHandler): this;
  put(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("PUT", path, handlerOrConfig);
    return this;
  }

  /**
   * Register a PATCH route.
   */
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
  patch(path: string, config: KageRouteConfig): this;
  patch(path: string, handler: KageHandler): this;
  patch(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("PATCH", path, handlerOrConfig);
    return this;
  }

  /**
   * Register a DELETE route.
   */
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
  delete(path: string, config: KageRouteConfig): this;
  delete(path: string, handler: KageHandler): this;
  delete(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("DELETE", path, handlerOrConfig);
    return this;
  }

  /**
   * Register a HEAD route.
   */
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
  head(path: string, config: KageRouteConfig): this;
  head(path: string, handler: KageHandler): this;
  head(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("HEAD", path, handlerOrConfig);
    return this;
  }

  /**
   * Register an OPTIONS route.
   */
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
  options(path: string, config: KageRouteConfig): this;
  options(path: string, handler: KageHandler): this;
  options(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): this {
    this.addRoute("OPTIONS", path, handlerOrConfig);
    return this;
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): void {
    const fullPath = this.resolvePath(path);

    if (this.isSchemaConfig(handlerOrConfig)) {
      const wrappedHandler = wrapTypedHandler(
        handlerOrConfig.handler,
        handlerOrConfig.schemas,
      );
      this.router.add(method, fullPath, wrappedHandler as Handler);
      return;
    }

    const handler = typeof handlerOrConfig === "function"
      ? handlerOrConfig
      : handlerOrConfig.handler;

    this.router.add(method, fullPath, handler);
  }

  private isSchemaConfig(
    config: KageHandler | KageRouteConfig | KageSchemaConfig,
  ): config is KageSchemaConfig {
    return (
      typeof config === "object" &&
      config !== null &&
      "schemas" in config &&
      "handler" in config
    );
  }

  private resolvePath(path: string): string {
    const basePath = this.config.basePath!;
    if (basePath === "/") {
      return path;
    }

    const normalizedBase = basePath.endsWith("/")
      ? basePath.slice(0, -1)
      : basePath;

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  /**
   * Handle a request and return a response.
   * Use this for Deno Deploy or custom server integration.
   *
   * @example
   * ```typescript
   * // Deno Deploy
   * export default app;
   *
   * // Or explicit
   * Deno.serve(app.fetch);
   * ```
   */
  fetch = (req: Request): Response | Promise<Response> => {
    return this.handleRequest(req);
  };

  /**
   * Start the HTTP server and listen for requests.
   */
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

  private handleRequest(req: Request): Response | Promise<Response> {
    const urlStr = req.url;
    const method = req.method as HttpMethod;

    // Fast path extraction - avoid URL constructor
    let pathname: string;
    let url: URL | null = null;

    const protocolEnd = urlStr.indexOf("://");
    if (protocolEnd !== -1) {
      const pathStart = urlStr.indexOf("/", protocolEnd + 3);
      if (pathStart !== -1) {
        const queryStart = urlStr.indexOf("?", pathStart);
        const hashStart = urlStr.indexOf("#", pathStart);
        let pathEnd = urlStr.length;
        if (queryStart !== -1 && (hashStart === -1 || queryStart < hashStart)) {
          pathEnd = queryStart;
        } else if (hashStart !== -1) {
          pathEnd = hashStart;
        }
        pathname = urlStr.slice(pathStart, pathEnd);
      } else {
        pathname = "/";
      }
    } else {
      url = new URL(urlStr);
      pathname = url.pathname;
    }

    const match = this.router.find(method, pathname);

    if (!match) {
      // Create new Response each time - body is consumed on read
      return new Response(NOT_FOUND_BODY, { status: 404 });
    }

    return this.executeRequest(req, match, url, pathname);
  }

  private executeRequest(
    req: Request,
    match: Match,
    url: URL | null,
    pathname: string,
  ): Response | Promise<Response> {
    const ctx = this.contextPool.acquire(req, match.params, url, pathname);
    const middlewareLen = this.middleware.length;

    // No middleware - fastest path
    if (middlewareLen === 0) {
      return this.executeHandlerDirect(ctx, match.handler);
    }

    // Single middleware - optimized path
    if (middlewareLen === 1) {
      return this.executeSingleMiddleware(ctx, match.handler);
    }

    // Multiple middleware - composed path
    return this.executeMiddlewareChain(ctx, match.handler);
  }

  // Optimized handler execution - detects sync vs async
  private executeHandlerDirect(
    ctx: Context,
    handler: Handler,
  ): Response | Promise<Response> {
    const params = ctx.params;
    try {
      const result = handler(ctx);

      // Fast path: sync handler returning Response
      if (result instanceof Response) {
        releaseParams(params);
        this.contextPool.release(ctx);
        return result;
      }

      // Async handler
      if (result instanceof Promise) {
        return result.then(
          (r) => {
            const response = this.resultToResponse(r);
            releaseParams(params);
            this.contextPool.release(ctx);
            return response;
          },
          (error) => {
            releaseParams(params);
            this.contextPool.release(ctx);
            return this.createErrorResponse(error);
          },
        );
      }

      // Sync handler returning non-Response
      const response = this.resultToResponse(result);
      releaseParams(params);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      releaseParams(params);
      this.contextPool.release(ctx);
      return this.createErrorResponse(error);
    }
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
      releaseParams(params);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      releaseParams(params);
      this.contextPool.release(ctx);
      return this.createErrorResponse(error);
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
      releaseParams(params);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      releaseParams(params);
      this.contextPool.release(ctx);
      return this.createErrorResponse(error);
    }
  }

  private createErrorResponse(error: unknown): Response {
    if (this.isDev) {
      console.error("Request handler error:", error);
    }
    return new Response(INTERNAL_ERROR_BODY, { status: 500 });
  }

  // Monomorphic response conversion - ordered by frequency
  private resultToResponse(result: unknown): Response {
    // Most common: handler returns Response directly
    if (result instanceof Response) {
      return result;
    }

    // Second most common: null/undefined -> 204
    if (result == null) {
      return new Response(null, { status: 204 });
    }

    // Third: object -> JSON
    if (typeof result === "object") {
      // Check for binary types first (less common)
      if (result instanceof Uint8Array) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      if (result instanceof ArrayBuffer) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      if (result instanceof ReadableStream) {
        return new Response(result as BodyInit, BINARY_INIT_200);
      }
      // Regular object -> JSON
      return new Response(JSON.stringify(result), JSON_INIT_200);
    }

    // String
    if (typeof result === "string") {
      return new Response(result, TEXT_INIT_200);
    }

    // Fallback: stringify anything else
    return new Response(JSON.stringify(result), JSON_INIT_200);
  }
}
