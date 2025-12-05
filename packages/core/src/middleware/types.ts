/**
 * Middleware type definitions.
 */

import type { Context } from "~/context/mod.ts";

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
