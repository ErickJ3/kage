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

const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const OCTET_CONTENT_TYPE = "application/octet-stream";

const JSON_HEADERS = Object.freeze({ "Content-Type": JSON_CONTENT_TYPE });
const TEXT_HEADERS = Object.freeze({ "Content-Type": TEXT_CONTENT_TYPE });
const BINARY_HEADERS = Object.freeze({ "Content-Type": OCTET_CONTENT_TYPE });

const NOT_FOUND_RESPONSE = new Response("Not Found", { status: 404 });
const NO_CONTENT_RESPONSE = new Response(null, { status: 204 });
const INTERNAL_ERROR_RESPONSE = new Response("Internal Server Error", {
  status: 500,
});

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

  constructor(config: KageConfig = {}) {
    this.router = new Router();
    this.middleware = [];
    this.config = {
      development: false,
      basePath: "/",
      ...config,
    };
    this.contextPool = new ContextPool();
  }

  /**
   * Add global middleware to the application.
   */
  use(middleware: Middleware): void {
    this.middleware.push(middleware);
    this.composedMiddleware = null;
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
      return NOT_FOUND_RESPONSE.clone();
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

    if (middlewareLen === 0) {
      return this.executeHandler(ctx, match.handler);
    }

    if (middlewareLen === 1) {
      return this.executeSingleMiddleware(ctx, match.handler);
    }

    return this.executeMiddlewareChain(ctx, match.handler);
  }

  private executeHandler(
    ctx: Context,
    handler: Handler,
  ): Response | Promise<Response> {
    try {
      const result = handler(ctx);

      if (result instanceof Promise) {
        return result.then(
          (r) => {
            const response = this.toResponse(r);
            this.contextPool.release(ctx);
            return response;
          },
          (error) => {
            this.contextPool.release(ctx);
            return this.handleError(error);
          },
        );
      }

      const response = this.toResponse(result);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      return this.handleError(error);
    }
  }

  private async executeSingleMiddleware(
    ctx: Context,
    handler: Handler,
  ): Promise<Response> {
    try {
      const response = await this.middleware[0](ctx, async () => {
        const result = await handler(ctx);
        return this.toResponse(result);
      });
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      return this.handleError(error);
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
        return this.toResponse(result);
      });
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): Response {
    if (this.config.development) {
      console.error("Request handler error:", error);
    }
    return INTERNAL_ERROR_RESPONSE.clone();
  }

  private toResponse(result: unknown): Response {
    if (result instanceof Response) {
      return result;
    }

    if (result == null) {
      return NO_CONTENT_RESPONSE.clone();
    }

    const type = typeof result;

    if (type === "string") {
      return new Response(result as string, { headers: TEXT_HEADERS });
    }

    if (type === "object") {
      if (result instanceof Uint8Array) {
        return new Response(result as BodyInit, { headers: BINARY_HEADERS });
      }

      if (result instanceof ArrayBuffer) {
        return new Response(result as BodyInit, { headers: BINARY_HEADERS });
      }

      if (result instanceof ReadableStream) {
        return new Response(result as BodyInit, { headers: BINARY_HEADERS });
      }

      return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
  }
}
