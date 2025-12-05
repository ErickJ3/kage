/**
 * Error handling middleware.
 */

import type { Context } from "~/context/mod.ts";
import type { Middleware } from "~/middleware/types.ts";

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
      if (onError) {
        return await onError(error as Error, ctx);
      }

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
