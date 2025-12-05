/**
 * Schema validation middleware for Kage.
 */

import type { Static, TSchema } from "@sinclair/typebox";
import type { Context, Middleware } from "@kage/core";
import { validate, validationErrorResponse } from "~/validator.ts";
import type { SchemaConfig } from "~/types.ts";

/**
 * Create middleware that validates request data against schemas.
 *
 * @example
 * ```typescript
 * import { Kage, t } from "@kage/core";
 * import { validateSchema } from "@kage/schema";
 *
 * const userSchema = t.Object({
 *   name: t.String({ minLength: 1 }),
 *   email: t.String({ format: "email" }),
 * });
 *
 * app.post("/users",
 *   validateSchema({ body: userSchema }),
 *   async (ctx) => {
 *     const user = await ctx.bodyJson();
 *     return ctx.json({ created: true, user });
 *   }
 * );
 * ```
 */
export function validateSchema(config: SchemaConfig): Middleware {
  return async (ctx: Context, next) => {
    if (config.query) {
      const queryObj = Object.fromEntries(ctx.query.entries());
      const result = validate(config.query, queryObj);

      if (!result.success) {
        return validationErrorResponse(result.errors!);
      }

      ctx.state.validatedQuery = result.data;
    }

    if (config.params) {
      const result = validate(config.params, ctx.params);

      if (!result.success) {
        return validationErrorResponse(result.errors!);
      }

      ctx.state.validatedParams = result.data;
    }

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

      ctx.state.validatedBody = result.data;
    }

    const response = await next();

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

export function getValidatedBody<T extends TSchema>(
  ctx: Context,
): Static<T> | undefined {
  return ctx.state.validatedBody as Static<T> | undefined;
}

export function getValidatedQuery<T extends TSchema>(
  ctx: Context,
): Static<T> | undefined {
  return ctx.state.validatedQuery as Static<T> | undefined;
}

export function getValidatedParams<T extends TSchema>(
  ctx: Context,
): Static<T> | undefined {
  return ctx.state.validatedParams as Static<T> | undefined;
}
