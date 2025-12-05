/**
 * Route builder utilities for type-safe route creation.
 *
 * Provides createRoute and route method helpers with full type inference.
 */

import type { z } from "zod";
import { Context } from "./context.ts";
import type { Permission } from "../permissions/mod.ts";
import type {
  InferSchema,
  PathParams,
  TypedContext,
  TypedHandler,
  TypedRouteDefinition,
  TypedSchemaConfig,
} from "./typed.ts";

// Zod schema interface for runtime validation (Zod 4 uses `issues`, not `errors`)
interface ZodSchema {
  safeParse(data: unknown): {
    success: boolean;
    data?: unknown;
    error?: {
      issues: Array<{ path: (string | number)[]; message: string; code: string }>;
    };
  };
}

/**
 * Create a validated context from a base context and validated data.
 * @internal
 */
function createTypedContext<TParams, TQuery, TBody>(
  ctx: Context,
  validatedQuery: TQuery,
  validatedBody: TBody,
): TypedContext<TParams, TQuery, TBody> {
  return {
    request: ctx.request,
    params: ctx.params as TParams,
    method: ctx.method,
    headers: ctx.headers,
    path: ctx.path,
    get url() {
      return ctx.url;
    },
    validatedQuery,
    validatedBody,
    state: ctx.state,
    // Response helpers
    json: ctx.json.bind(ctx),
    text: ctx.text.bind(ctx),
    html: ctx.html.bind(ctx),
    redirect: ctx.redirect.bind(ctx),
    noContent: ctx.noContent.bind(ctx),
    notFound: ctx.notFound.bind(ctx),
    badRequest: ctx.badRequest.bind(ctx),
    unauthorized: ctx.unauthorized.bind(ctx),
    forbidden: ctx.forbidden.bind(ctx),
    internalError: ctx.internalError.bind(ctx),
    binary: ctx.binary.bind(ctx),
    stream: ctx.stream.bind(ctx),
    response: ctx.response.bind(ctx),
  };
}

/**
 * Create a typed route with full schema validation and type inference.
 *
 * @example
 * ```typescript
 * import { createRoute } from "@kage/core";
 * import { z } from "zod";
 *
 * const getUserRoute = createRoute({
 *   path: "/users/:id",
 *   schema: {
 *     params: z.object({ id: z.string().uuid() }),
 *     query: z.object({ include: z.string().optional() }),
 *   },
 *   handler: async (ctx) => {
 *     // ctx.params is typed as { id: string }
 *     // ctx.validatedQuery is typed as { include?: string }
 *     const user = await db.users.findOne(ctx.params.id);
 *     return ctx.json(user);
 *   },
 * });
 *
 * app.get("/users/:id", getUserRoute);
 * ```
 */
export function createRoute<
  TPath extends string,
  TParamsSchema extends z.ZodType | undefined = undefined,
  TQuerySchema extends z.ZodType | undefined = undefined,
  TBodySchema extends z.ZodType | undefined = undefined,
  TResponseSchema extends z.ZodType | undefined = undefined,
>(config: {
  path: TPath;
  permissions?: Permission[];
  schema?: {
    params?: TParamsSchema;
    query?: TQuerySchema;
    body?: TBodySchema;
    response?: TResponseSchema;
  };
  handler: TypedHandler<
    TParamsSchema extends z.ZodType ? z.infer<TParamsSchema>
      : PathParams<TPath>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>,
    InferSchema<TResponseSchema, unknown>
  >;
}): TypedRouteDefinition {
  return {
    path: config.path,
    permissions: config.permissions,
    handler: config.handler as TypedHandler,
    schemas: config.schema ?? {},
  };
}

/**
 * Create a handler wrapper that validates inputs and creates typed context.
 *
 * Used internally by Kage to wrap typed routes with validation.
 * @internal
 */
export function wrapTypedHandler(
  handler: TypedHandler,
  schemas: TypedSchemaConfig,
): (ctx: Context) => Promise<Response | unknown> {
  return async (ctx: Context) => {
    // Validate params if schema provided
    let validatedParams = ctx.params;
    if (schemas.params) {
      const schema = schemas.params as ZodSchema;
      const result = schema.safeParse(ctx.params);
      if (!result.success) {
        return ctx.json(
          {
            error: "Validation Error",
            details: result.error!.issues.map((e) => ({
              field: e.path.join("."),
              message: e.message,
              code: e.code,
            })),
          },
          400,
        );
      }
      validatedParams = result.data as Record<string, string>;
    }

    // Validate query if schema provided
    let validatedQuery: Record<string, unknown> = {};
    if (schemas.query) {
      const schema = schemas.query as ZodSchema;
      const queryObj = Object.fromEntries(ctx.url.searchParams.entries());
      const result = schema.safeParse(queryObj);
      if (!result.success) {
        return ctx.json(
          {
            error: "Validation Error",
            details: result.error!.issues.map((e) => ({
              field: `query.${e.path.join(".")}`,
              message: e.message,
              code: e.code,
            })),
          },
          400,
        );
      }
      validatedQuery = result.data as Record<string, unknown>;
    }

    // Validate body if schema provided
    let validatedBody: unknown = undefined;
    if (schemas.body) {
      const schema = schemas.body as ZodSchema;
      try {
        const body = await ctx.request.json();
        const result = schema.safeParse(body);
        if (!result.success) {
          return ctx.json(
            {
              error: "Validation Error",
              details: result.error!.issues.map((e) => ({
                field: `body.${e.path.join(".")}`,
                message: e.message,
                code: e.code,
              })),
            },
            400,
          );
        }
        validatedBody = result.data;
      } catch {
        return ctx.json({ error: "Invalid JSON body" }, 400);
      }
    }

    // Update params with validated values
    ctx.params = validatedParams;

    // Create typed context
    const typedCtx = createTypedContext<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >(ctx, validatedQuery, validatedBody);

    // Execute handler (cast to any to allow flexible handler types)
    const response = await (handler as TypedHandler<
      Record<string, string>,
      Record<string, unknown>,
      unknown,
      unknown
    >)(typedCtx);

    // Validate response in development mode if schema provided
    if (schemas.response && !(response instanceof Response)) {
      const schema = schemas.response as ZodSchema;
      const result = schema.safeParse(response);
      if (!result.success) {
        console.warn("Response validation failed:", result.error!.issues);
      }
    }

    return response;
  };
}

/**
 * Type-safe route builder for fluent API.
 *
 * @example
 * ```typescript
 * const r = route("/users/:id")
 *   .params(z.object({ id: z.string().uuid() }))
 *   .query(z.object({ include: z.string().optional() }))
 *   .handler(async (ctx) => {
 *     return ctx.json({ id: ctx.params.id });
 *   });
 * ```
 */
export class RouteBuilder<
  TPath extends string,
  TParams = PathParams<TPath>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
  TResponse = unknown,
> {
  private _path: TPath;
  private _permissions?: Permission[];
  private _schemas: TypedSchemaConfig = {};

  constructor(path: TPath) {
    this._path = path;
  }

  /**
   * Add required permissions for this route.
   */
  permissions(perms: Permission[]): this {
    this._permissions = perms;
    return this;
  }

  /**
   * Add params schema for validation and typing.
   */
  params<T extends z.ZodType>(
    schema: T,
  ): RouteBuilder<TPath, z.infer<T>, TQuery, TBody, TResponse> {
    this._schemas.params = schema;
    return this as unknown as RouteBuilder<
      TPath,
      z.infer<T>,
      TQuery,
      TBody,
      TResponse
    >;
  }

  /**
   * Add query schema for validation and typing.
   */
  query<T extends z.ZodType>(
    schema: T,
  ): RouteBuilder<TPath, TParams, z.infer<T>, TBody, TResponse> {
    this._schemas.query = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      z.infer<T>,
      TBody,
      TResponse
    >;
  }

  /**
   * Add body schema for validation and typing.
   */
  body<T extends z.ZodType>(
    schema: T,
  ): RouteBuilder<TPath, TParams, TQuery, z.infer<T>, TResponse> {
    this._schemas.body = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      TQuery,
      z.infer<T>,
      TResponse
    >;
  }

  /**
   * Add response schema for validation (development) and typing.
   */
  response<T extends z.ZodType>(
    schema: T,
  ): RouteBuilder<TPath, TParams, TQuery, TBody, z.infer<T>> {
    this._schemas.response = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      TQuery,
      TBody,
      z.infer<T>
    >;
  }

  /**
   * Set the handler and return the route definition.
   */
  handler(
    fn: TypedHandler<TParams, TQuery, TBody, TResponse>,
  ): TypedRouteDefinition<TParams, TQuery, TBody, TResponse> {
    return {
      path: this._path,
      permissions: this._permissions,
      handler: fn,
      schemas: this._schemas,
    };
  }
}

/**
 * Create a new route builder for fluent API.
 *
 * @example
 * ```typescript
 * const r = route("/users/:id")
 *   .params(z.object({ id: z.string().uuid() }))
 *   .handler((ctx) => ctx.json({ id: ctx.params.id }));
 * ```
 */
export function route<TPath extends string>(
  path: TPath,
): RouteBuilder<TPath, PathParams<TPath>> {
  return new RouteBuilder(path);
}
