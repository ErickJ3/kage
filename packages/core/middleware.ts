/**
 * Middleware system for Kage framework.
 *
 * Provides composable middleware pattern for request processing.
 */

import type { Context } from "./context.ts";

/**
 * Middleware function signature.
 *
 * Middleware can:
 * - Modify the context (add state, etc.)
 * - Return a Response to short-circuit the chain
 * - Call next() to continue to the next middleware/handler
 *
 * @example
 * ```typescript
 * const logger: Middleware = async (ctx, next) => {
 *   console.log(`${ctx.method} ${ctx.path}`);
 *   return await next();
 * };
 * ```
 */
export type Middleware = (
  ctx: Context,
  next: () => Promise<Response>,
) => Promise<Response>;

/**
 * Compose multiple middleware functions into a single function.
 *
 * Middleware are executed in order, with each calling next() to proceed.
 * If a middleware returns a Response without calling next(), the chain stops.
 *
 * @param middleware - Array of middleware functions
 * @returns Composed middleware function
 *
 * @example
 * ```typescript
 * const composed = compose([
 *   loggerMiddleware,
 *   authMiddleware,
 *   corsMiddleware
 * ]);
 *
 * const response = await composed(context, handler);
 * ```
 */
export function compose(middleware: Middleware[]): Middleware {
  if (!Array.isArray(middleware)) {
    throw new TypeError("Middleware must be an array");
  }

  // Validate all items are functions
  for (const fn of middleware) {
    if (typeof fn !== "function") {
      throw new TypeError("Middleware must be composed of functions");
    }
  }

  /**
   * Composed middleware function.
   * Executes middleware in sequence, each calling next() to proceed.
   */
  return function composedMiddleware(
    ctx: Context,
    next: () => Promise<Response>,
  ): Promise<Response> {
    let index = -1;

    /**
     * Dispatch function that executes middleware at given index.
     *
     * Prevents next() from being called multiple times by same middleware.
     */
    function dispatch(i: number): Promise<Response> {
      // Middleware called next() more than once
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }

      index = i;

      // Get current middleware
      let fn: Middleware | undefined = middleware[i];

      // If we've reached the end of middleware chain, call the final handler
      if (i === middleware.length) {
        fn = next as Middleware;
      }

      // No more middleware and no next handler
      if (!fn) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }

      // Execute current middleware with next() function
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return dispatch(0);
  };
}

/**
 * Create error handling middleware.
 *
 * Catches errors from downstream middleware/handlers and converts
 * them to error responses.
 *
 * @param onError - Optional custom error handler
 * @returns Error handling middleware
 *
 * @example
 * ```typescript
 * app.use(errorHandler((error, ctx) => {
 *   console.error("Error:", error);
 *   return ctx.json({ error: error.message }, 500);
 * }));
 * ```
 */
export function errorHandler(
  onError?: (error: Error, ctx: Context) => Response | Promise<Response>,
): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (error) {
      // Call custom error handler if provided
      if (onError) {
        return await onError(error as Error, ctx);
      }

      // Default error handling
      const err = error as Error;
      console.error("Request error:", err);

      return ctx.json(
        {
          error: "Internal Server Error",
          message: err.message,
        },
        500,
      );
    }
  };
}

/**
 * Create logger middleware.
 *
 * Logs request method, path, and response time.
 *
 * @example
 * ```typescript
 * app.use(logger());
 * // GET /users 15ms
 * ```
 */
export function logger(): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    const response = await next();
    const duration = Date.now() - start;

    console.log(`${ctx.method} ${ctx.path} ${duration}ms`);

    return response;
  };
}

/**
 * Create CORS middleware.
 *
 * Adds CORS headers to responses.
 *
 * @param options - CORS configuration options
 *
 * @example
 * ```typescript
 * app.use(cors({
 *   origin: "*",
 *   methods: ["GET", "POST", "PUT", "DELETE"],
 *   headers: ["Content-Type", "Authorization"]
 * }));
 * ```
 */
export function cors(options: {
  origin?: string;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
} = {}): Middleware {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    headers = ["Content-Type", "Authorization"],
    credentials = false,
    maxAge = 86400,
  } = options;

  return async (ctx, next) => {
    // Handle preflight OPTIONS request
    if (ctx.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": methods.join(", "),
          "Access-Control-Allow-Headers": headers.join(", "),
          "Access-Control-Max-Age": maxAge.toString(),
          ...(credentials && { "Access-Control-Allow-Credentials": "true" }),
        },
      });
    }

    // Process request
    const response = await next();

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", origin);

    if (credentials) {
      newHeaders.set("Access-Control-Allow-Credentials", "true");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
