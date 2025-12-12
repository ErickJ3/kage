import type { Context } from "~/context/context.ts";
import type { Middleware } from "~/middleware/types.ts";
import {
  type Infer,
  type StandardSchema,
  validate,
} from "~/schema/standard.ts";
import {
  createValidationErrorResponse,
  formatIssues,
} from "~/schema/errors.ts";

/**
 * Schema configuration for middleware validation.
 */
export interface SchemaConfig {
  body?: StandardSchema;
  query?: StandardSchema;
  params?: StandardSchema;
  response?: StandardSchema;
}

/**
 * Middleware that validates request data against Standard Schema schemas.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * app.use(validateSchema({
 *   body: z.object({ name: z.string() }),
 *   query: z.object({ page: z.coerce.number() }),
 * }));
 * ```
 */
export function validateSchema(config: SchemaConfig): Middleware {
  return async (ctx: Context, next) => {
    if (config.query) {
      const queryObj = Object.fromEntries(ctx.query.entries());
      const result = await validate(config.query, queryObj);

      if (!result.success) {
        return createValidationErrorResponse(result.issues);
      }

      ctx.state.validatedQuery = result.data;
    }

    if (config.params) {
      const result = await validate(config.params, ctx.params);

      if (!result.success) {
        return createValidationErrorResponse(result.issues);
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
      } catch {
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

      const result = await validate(config.body, body);

      if (!result.success) {
        return createValidationErrorResponse(result.issues);
      }

      ctx.state.validatedBody = result.data;
    }

    const response = await next();

    if (config.response && Deno.env.get("DENO_ENV") === "development") {
      try {
        const responseClone = response.clone();
        const responseBody = await responseClone.json();
        const result = await validate(config.response, responseBody);

        if (!result.success) {
          console.warn(
            "Response validation failed:",
            formatIssues(result.issues),
          );
        }
      } catch {
        // Response is not JSON or failed to parse
      }
    }

    return response;
  };
}

/**
 * Get validated body from context state.
 */
export function getValidatedBody<T extends StandardSchema>(
  ctx: Context,
): Infer<T> | undefined {
  return ctx.state.validatedBody as Infer<T> | undefined;
}

/**
 * Get validated query from context state.
 */
export function getValidatedQuery<T extends StandardSchema>(
  ctx: Context,
): Infer<T> | undefined {
  return ctx.state.validatedQuery as Infer<T> | undefined;
}

/**
 * Get validated params from context state.
 */
export function getValidatedParams<T extends StandardSchema>(
  ctx: Context,
): Infer<T> | undefined {
  return ctx.state.validatedParams as Infer<T> | undefined;
}
