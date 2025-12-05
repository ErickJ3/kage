/**
 * Main Kage application class.
 *
 * Provides the primary API for building web applications with Kage.
 */

import {
  type Handler,
  type HttpMethod,
  type RouteConfig,
  Router,
} from "../router/mod.ts";
import type { KageConfig, ListenOptions } from "./types.ts";
import { Context, ContextPool } from "./context.ts";
import { compose, type Middleware } from "./middleware.ts";
import type { TypedRouteDefinition } from "./typed.ts";
import { wrapTypedHandler } from "./route_builder.ts";

// Cached header values for performance
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const OCTET_CONTENT_TYPE = "application/octet-stream";

// Pre-allocated headers for common response types (avoid allocation in hot path)
const JSON_HEADERS = Object.freeze({ "Content-Type": JSON_CONTENT_TYPE });
const TEXT_HEADERS = Object.freeze({ "Content-Type": TEXT_CONTENT_TYPE });
const BINARY_HEADERS = Object.freeze({ "Content-Type": OCTET_CONTENT_TYPE });

// Pre-allocated responses for common cases
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
 * // Add global middleware
 * app.use(logger());
 * app.use(cors());
 *
 * // Add routes
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
    | ((
      ctx: Context,
      next: () => Promise<Response>,
    ) => Promise<Response>)
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
   *
   * Middleware are executed in the order they are registered.
   *
   * @param middleware - Middleware function to add
   *
   * @example
   * ```typescript
   * import { logger, cors, errorHandler } from "@kage/core";
   *
   * app.use(errorHandler());
   * app.use(logger());
   * app.use(cors({ origin: "https://example.com" }));
   * ```
   */
  use(middleware: Middleware): void {
    this.middleware.push(middleware);
    // Invalidate cached composed middleware
    this.composedMiddleware = null;
  }

  /**
   * Get composed middleware, using cache if available.
   */
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
   *
   * @param path - Route path pattern
   * @param handlerOrConfig - Handler function or route configuration
   *
   * @example
   * ```typescript
   * // Simple handler
   * app.get("/users", (ctx) => ctx.json({ users: [] }));
   *
   * // With permissions
   * app.get("/users", {
   *   permissions: ["net:api.example.com"],
   *   handler: async (ctx) => {
   *     const res = await fetch("https://api.example.com/users");
   *     return ctx.json(await res.json());
   *   }
   * });
   *
   * // With typed route definition
   * app.get("/users/:id", createRoute({
   *   path: "/users/:id",
   *   schema: { params: z.object({ id: z.string().uuid() }) },
   *   handler: (ctx) => ctx.json({ id: ctx.params.id }),
   * }));
   * ```
   */
  get(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("GET", path, handlerOrConfig);
  }

  /**
   * Register a POST route.
   */
  post(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("POST", path, handlerOrConfig);
  }

  /**
   * Register a PUT route.
   */
  put(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("PUT", path, handlerOrConfig);
  }

  /**
   * Register a PATCH route.
   */
  patch(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("PATCH", path, handlerOrConfig);
  }

  /**
   * Register a DELETE route.
   */
  delete(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("DELETE", path, handlerOrConfig);
  }

  /**
   * Register a HEAD route.
   */
  head(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("HEAD", path, handlerOrConfig);
  }

  /**
   * Register an OPTIONS route.
   */
  options(
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    this.addRoute("OPTIONS", path, handlerOrConfig);
  }

  /**
   * Internal method to add a route with base path support.
   *
   * Handles simple handler functions, RouteConfig objects, and TypedRouteDefinition.
   */
  private addRoute(
    method: HttpMethod,
    path: string,
    handlerOrConfig: Handler | RouteConfig | TypedRouteDefinition,
  ): void {
    const fullPath = this.resolvePath(path);

    // Check if it's a TypedRouteDefinition (has 'schemas' property)
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

    // Normalize to RouteConfig
    const config: RouteConfig = typeof handlerOrConfig === "function"
      ? { handler: handlerOrConfig }
      : handlerOrConfig;

    this.router.add(method, fullPath, config.handler, config.permissions);
  }

  /**
   * Type guard to check if config is a TypedRouteDefinition.
   */
  private isTypedRouteDefinition(
    config: Handler | RouteConfig | TypedRouteDefinition,
  ): config is TypedRouteDefinition {
    return (
      typeof config === "object" &&
      config !== null &&
      "schemas" in config &&
      "handler" in config
    );
  }

  /**
   * Resolve path with base path configuration.
   */
  private resolvePath(path: string): string {
    const basePath = this.config.basePath!;
    if (basePath === "/") {
      return path;
    }

    // Remove trailing slash from base path
    const normalizedBase = basePath.endsWith("/")
      ? basePath.slice(0, -1)
      : basePath;

    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  /**
   * Start the HTTP server and listen for requests.
   *
   * @param options - Server listen options
   *
   * @example
   * ```typescript
   * await app.listen({
   *   port: 3000,
   *   onListen: ({ hostname, port }) => {
   *     console.log(`Server running on http://${hostname}:${port}`);
   *   }
   * });
   * ```
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
      (req) => this.handleRequest(req),
    );

    await server.finished;
  }

  /**
   * Handle incoming HTTP requests.
   *
   * Creates Context, runs through middleware chain, finds route, and executes handler.
   */
  private handleRequest(req: Request): Response | Promise<Response> {
    // Extract pathname from URL without full URL parsing for common cases
    // req.url is always absolute URL, e.g., "http://localhost:3000/users/123"
    const urlStr = req.url;
    const method = req.method as HttpMethod;

    // Fast pathname extraction: find path between host and query/hash
    // This avoids full URL parsing for most requests
    let pathname: string;
    let url: URL | null = null;

    // Find the third slash (after protocol://)
    const protocolEnd = urlStr.indexOf("://");
    if (protocolEnd !== -1) {
      const pathStart = urlStr.indexOf("/", protocolEnd + 3);
      if (pathStart !== -1) {
        // Find query string or hash
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
      // Fallback for non-standard URLs
      url = new URL(urlStr);
      pathname = url.pathname;
    }

    // Find matching route
    const match = this.router.find(method, pathname);

    if (!match) {
      // Clone the pre-allocated response to allow concurrent requests
      return NOT_FOUND_RESPONSE.clone();
    }

    // Acquire context from pool
    // Lazy URL parsing: only parse full URL if handler needs it (e.g., query params)
    const ctx = this.contextPool.acquire(req, match.params, url, pathname);

    // Check middleware count once
    const middlewareLen = this.middleware.length;

    // Fast path: no middleware - execute handler directly
    if (middlewareLen === 0) {
      return this.executeHandler(ctx, match.handler);
    }

    // Single or multiple middleware path
    if (middlewareLen === 1) {
      return this.executeSingleMiddleware(ctx, match.handler);
    }

    return this.executeMiddlewareChain(ctx, match.handler);
  }

  /**
   * Execute handler directly without middleware.
   */
  private executeHandler(
    ctx: Context,
    handler: Handler,
  ): Response | Promise<Response> {
    try {
      const result = handler(ctx);

      // Check if result is a Promise
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

      // Sync result
      const response = this.toResponse(result);
      this.contextPool.release(ctx);
      return response;
    } catch (error) {
      this.contextPool.release(ctx);
      return this.handleError(error);
    }
  }

  /**
   * Execute with single middleware (avoid compose overhead).
   */
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

  /**
   * Execute with multiple middleware using cached composed chain.
   */
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

  /**
   * Handle errors in request processing.
   */
  private handleError(error: unknown): Response {
    if (this.config.development) {
      console.error("Request handler error:", error);
    }
    return INTERNAL_ERROR_RESPONSE.clone();
  }

  /**
   * Convert handler result to HTTP Response.
   *
   * Supports:
   * - Response objects (returned as-is)
   * - Uint8Array/ArrayBuffer (zero-copy binary)
   * - ReadableStream (streaming without buffering)
   * - Plain objects (JSON serialized)
   * - Strings (text response)
   * - null/undefined (no content)
   */
  private toResponse(result: unknown): Response {
    // Already a Response - zero copy (most common case after ctx.json())
    if (result instanceof Response) {
      return result;
    }

    // Null or undefined - no content (clone pre-allocated response)
    if (result == null) {
      return NO_CONTENT_RESPONSE.clone();
    }

    // Check typeof first (faster than instanceof for primitives)
    const type = typeof result;

    // String - text response
    if (type === "string") {
      return new Response(result as string, { headers: TEXT_HEADERS });
    }

    // Object types - check specific types
    if (type === "object") {
      // Uint8Array - zero-copy binary (most common binary type)
      if (result instanceof Uint8Array) {
        return new Response(result as BodyInit, { headers: BINARY_HEADERS });
      }

      // ArrayBuffer - zero-copy binary
      if (result instanceof ArrayBuffer) {
        return new Response(result as BodyInit, { headers: BINARY_HEADERS });
      }

      // ReadableStream - streaming without buffering
      if (result instanceof ReadableStream) {
        return new Response(result as BodyInit, { headers: BINARY_HEADERS });
      }

      // Plain object - JSON response
      return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
    }

    // Fallback for other types (numbers, booleans, etc.) - JSON response
    return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
  }
}
