/**
 * Main Kage application class.
 */

import { type Handler, type HttpMethod, Router } from "@kage/router";
import type { Permission } from "@kage/permissions";
import type { KageConfig, ListenOptions } from "~/app/types.ts";
import { Context, ContextPool } from "~/context/mod.ts";
import { compose, type Middleware } from "~/middleware/mod.ts";
import type { TypedRouteDefinition } from "~/routing/types.ts";
import { wrapTypedHandler } from "~/routing/builder.ts";

/** Handler function that receives a Context and returns a response. */
export type KageHandler = (ctx: Context) => unknown | Promise<unknown>;

/** Route configuration with handler and optional permissions. */
export interface KageRouteConfig {
  handler: KageHandler;
  permissions?: Permission[];
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
  get(path: string, handler: KageHandler): void;
  get(path: string, config: KageRouteConfig): void;
  get(path: string, config: TypedRouteDefinition): void;
  get(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("GET", path, handlerOrConfig);
  }

  /**
   * Register a POST route.
   */
  post(path: string, handler: KageHandler): void;
  post(path: string, config: KageRouteConfig): void;
  post(path: string, config: TypedRouteDefinition): void;
  post(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("POST", path, handlerOrConfig);
  }

  /**
   * Register a PUT route.
   */
  put(path: string, handler: KageHandler): void;
  put(path: string, config: KageRouteConfig): void;
  put(path: string, config: TypedRouteDefinition): void;
  put(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("PUT", path, handlerOrConfig);
  }

  /**
   * Register a PATCH route.
   */
  patch(path: string, handler: KageHandler): void;
  patch(path: string, config: KageRouteConfig): void;
  patch(path: string, config: TypedRouteDefinition): void;
  patch(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("PATCH", path, handlerOrConfig);
  }

  /**
   * Register a DELETE route.
   */
  delete(path: string, handler: KageHandler): void;
  delete(path: string, config: KageRouteConfig): void;
  delete(path: string, config: TypedRouteDefinition): void;
  delete(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("DELETE", path, handlerOrConfig);
  }

  /**
   * Register a HEAD route.
   */
  head(path: string, handler: KageHandler): void;
  head(path: string, config: KageRouteConfig): void;
  head(path: string, config: TypedRouteDefinition): void;
  head(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("HEAD", path, handlerOrConfig);
  }

  /**
   * Register an OPTIONS route.
   */
  options(path: string, handler: KageHandler): void;
  options(path: string, config: KageRouteConfig): void;
  options(path: string, config: TypedRouteDefinition): void;
  options(
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("OPTIONS", path, handlerOrConfig);
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    handlerOrConfig: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): void {
    const fullPath = this.resolvePath(path);

    if (this.isTypedRouteDefinition(handlerOrConfig)) {
      const wrappedHandler = wrapTypedHandler(
        handlerOrConfig.handler,
        handlerOrConfig.schemas,
      );
      this.router.add(
        method,
        fullPath,
        wrappedHandler as Handler,
        handlerOrConfig.permissions,
      );
      return;
    }

    const config: KageRouteConfig =
      typeof handlerOrConfig === "function"
        ? { handler: handlerOrConfig }
        : handlerOrConfig;

    this.router.add(method, fullPath, config.handler, config.permissions);
  }

  private isTypedRouteDefinition(
    config: KageHandler | KageRouteConfig | TypedRouteDefinition,
  ): config is TypedRouteDefinition {
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
