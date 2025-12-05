/**
 * Logger middleware.
 */

import type { Middleware } from "~/middleware/types.ts";

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
