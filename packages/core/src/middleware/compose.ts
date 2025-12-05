/**
 * Middleware composition utilities.
 */

import type { Context } from "~/context/mod.ts";
import type { Middleware } from "~/middleware/types.ts";

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

  for (const fn of middleware) {
    if (typeof fn !== "function") {
      throw new TypeError("Middleware must be composed of functions");
    }
  }

  return function composedMiddleware(
    ctx: Context,
    next: () => Promise<Response>,
  ): Promise<Response> {
    let index = -1;

    function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }

      index = i;

      let fn: Middleware | undefined = middleware[i];

      if (i === middleware.length) {
        fn = next as Middleware;
      }

      if (!fn) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return dispatch(0);
  };
}
