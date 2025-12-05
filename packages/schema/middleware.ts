/**
 * Schema validation middleware for Kage.
 *
 * Provides automatic validation of requests and responses.
 */

import type { z } from "zod";
import type { Context, Middleware } from "@kage/core";
import { validate, validationErrorResponse } from "./validator.ts";
import type { SchemaConfig } from "./types.ts";

/**
 * Create middleware that validates request data against schemas.
 *
 * Validates body, query, and params based on provided schemas.
 * Returns 400 error response if validation fails.
 *
 * @param config - Schema configuration for validation
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { validateSchema } from "@kage/schema";
 *
 * const userSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 *   age: z.number().int().positive().optional(),
 * });
 *
 * app.post("/users",
 *   validateSchema({ body: userSchema }),
 *   async (ctx) => {
 *     // Body is automatically validated and typed
 *     const user = await ctx.bodyJson();
 *     return ctx.json({ created: true, user });
 *   }
 * );
 * ```
 */
export function validateSchema(config: SchemaConfig): Middleware {
  return async (ctx: Context, next) => {
    // Validate query parameters
    if (config.query) {
      const queryObj = Object.fromEntries(ctx.query.entries());
      const result = validate(config.query, queryObj);

      if (!result.success) {
        return validationErrorResponse(result.errors!);
      }

      // Store validated query in context state
      ctx.state.validatedQuery = result.data;
    }

    // Validate path parameters
    if (config.params) {
      const result = validate(config.params, ctx.params);

      if (!result.success) {
        return validationErrorResponse(result.errors!);
      }

      // Store validated params in context state
      ctx.state.validatedParams = result.data;
    }

    // Validate request body
    if (config.body) {
      const contentType = ctx.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        return new Response(
          JSON.stringify({
            error: "Content-Type must be application/json",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }

      let body: unknown;
      try {
        body = await ctx.bodyJson();
      } catch (_error) {
        return new Response(
          JSON.stringify({
            error: "Invalid JSON in request body",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }

      const result = validate(config.body, body);

      if (!result.success) {
        return validationErrorResponse(result.errors!);
      }

      // Store validated body in context state
      ctx.state.validatedBody = result.data;
    }

    // Execute handler
    const response = await next();

    // Validate response in development mode (optional)
    if (config.response && Deno.env.get("DENO_ENV") === "development") {
      try {
        const responseClone = response.clone();
        const responseBody = await responseClone.json();
        const result = validate(config.response, responseBody);

        if (!result.success) {
          console.warn("Response validation failed:", result.errors);
        }
      } catch (_error) {
        // Response is not JSON or failed to parse
      }
    }

    return response;
  };
}

/**
 * Helper to get validated body from context.
 *
 * @param ctx - Request context
 * @returns Validated and typed body data
 */
export function getValidatedBody<T extends z.ZodType>(
  ctx: Context,
): z.infer<T> | undefined {
  return ctx.state.validatedBody as z.infer<T> | undefined;
}

/**
 * Helper to get validated query from context.
 *
 * @param ctx - Request context
 * @returns Validated and typed query data
 */
export function getValidatedQuery<T extends z.ZodType>(
  ctx: Context,
): z.infer<T> | undefined {
  return ctx.state.validatedQuery as z.infer<T> | undefined;
}

/**
 * Helper to get validated params from context.
 *
 * @param ctx - Request context
 * @returns Validated and typed params data
 */
export function getValidatedParams<T extends z.ZodType>(
  ctx: Context,
): z.infer<T> | undefined {
  return ctx.state.validatedParams as z.infer<T> | undefined;
}
