import type { Static, TSchema } from "@sinclair/typebox";
import type { Context } from "~/context/context.ts";
import type { Middleware } from "~/middleware/types.ts";
import { validate, validationErrorResponse } from "~/schema/validator.ts";
import type { SchemaConfig } from "~/schema/types.ts";

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
      } catch {
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
