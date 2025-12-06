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

  const len = middleware.length;

  if (len === 0) {
    return (_ctx, next) => next();
  }

  if (len === 1) {
    const m0 = middleware[0];
    return (ctx, next) => m0(ctx, next);
  }

  if (len === 2) {
    const m0 = middleware[0];
    const m1 = middleware[1];
    return (ctx, next) => m0(ctx, () => m1(ctx, next));
  }

  if (len === 3) {
    const m0 = middleware[0];
    const m1 = middleware[1];
    const m2 = middleware[2];
    return (ctx, next) => m0(ctx, () => m1(ctx, () => m2(ctx, next)));
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
      const fn = i === len ? next : middleware[i];
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
