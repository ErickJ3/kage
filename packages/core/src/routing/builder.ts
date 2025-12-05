import type { Static, TSchema } from "@sinclair/typebox";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Context } from "~/context/mod.ts";

// Register common string formats
if (!FormatRegistry.Has("email")) {
  FormatRegistry.Set("email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set(
    "uuid",
    (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  );
}
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  });
}
if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set("date-time", (v) => !isNaN(Date.parse(v)));
}
if (!FormatRegistry.Has("date")) {
  FormatRegistry.Set("date", (v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
}
if (!FormatRegistry.Has("time")) {
  FormatRegistry.Set("time", (v) => /^\d{2}:\d{2}:\d{2}/.test(v));
}
import type { Permission } from "@kage/permissions";
import type {
  InferSchema,
  PathParams,
  TypedContext,
  TypedHandler,
  TypedRouteDefinition,
  TypedSchemaConfig,
} from "~/routing/types.ts";

function createTypedContext<TParams, TQuery, TBody>(
  ctx: Context,
  query: TQuery,
  body: TBody,
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
    query,
    body,
    state: ctx.state,
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

function validateSchema(
  schema: TSchema,
  data: unknown,
): { success: true; data: unknown } | { success: false; errors: unknown[] } {
  const errors = [...Value.Errors(schema, data)];
  if (errors.length === 0) {
    return { success: true, data: Value.Cast(schema, data) };
  }
  return {
    success: false,
    errors: errors.map((e) => ({
      field: e.path.replace(/^\//, "").replace(/\//g, ".") || "(root)",
      message: e.message,
      code: e.type.toString(),
    })),
  };
}

export function createRoute<
  TPath extends string,
  TParamsSchema extends TSchema | undefined = undefined,
  TQuerySchema extends TSchema | undefined = undefined,
  TBodySchema extends TSchema | undefined = undefined,
  TResponseSchema extends TSchema | undefined = undefined,
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
    TParamsSchema extends TSchema ? Static<TParamsSchema> : PathParams<TPath>,
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

export function wrapTypedHandler(
  handler: (ctx: TypedContext) => unknown | Promise<unknown>,
  schemas: TypedSchemaConfig,
): (ctx: Context) => Promise<Response | unknown> {
  return async (ctx: Context) => {
    let validatedParams = ctx.params;
    if (schemas.params) {
      const result = validateSchema(schemas.params, ctx.params);
      if (!result.success) {
        return ctx.json(
          { error: "Validation Error", details: result.errors },
          400,
        );
      }
      validatedParams = result.data as Record<string, string>;
    }

    let validatedQuery: Record<string, unknown> = {};
    if (schemas.query) {
      const queryObj = Object.fromEntries(ctx.url.searchParams.entries());
      const result = validateSchema(schemas.query, queryObj);
      if (!result.success) {
        return ctx.json(
          { error: "Validation Error", details: result.errors },
          400,
        );
      }
      validatedQuery = result.data as Record<string, unknown>;
    }

    let validatedBody: unknown = undefined;
    if (schemas.body) {
      try {
        const body = await ctx.request.json();
        const result = validateSchema(schemas.body, body);
        if (!result.success) {
          return ctx.json(
            { error: "Validation Error", details: result.errors },
            400,
          );
        }
        validatedBody = result.data;
      } catch {
        return ctx.json({ error: "Invalid JSON body" }, 400);
      }
    }

    ctx.params = validatedParams;

    const typedCtx = createTypedContext<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >(ctx, validatedQuery, validatedBody);

    const response = await (handler as TypedHandler<
      Record<string, string>,
      Record<string, unknown>,
      unknown,
      unknown
    >)(typedCtx);

    if (schemas.response && !(response instanceof Response)) {
      const result = validateSchema(schemas.response, response);
      if (!result.success) {
        console.warn("Response validation failed:", result.errors);
      }
    }

    return response;
  };
}

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

  permissions(perms: Permission[]): this {
    this._permissions = perms;
    return this;
  }

  params<T extends TSchema>(
    schema: T,
  ): RouteBuilder<TPath, Static<T>, TQuery, TBody, TResponse> {
    this._schemas.params = schema;
    return this as unknown as RouteBuilder<
      TPath,
      Static<T>,
      TQuery,
      TBody,
      TResponse
    >;
  }

  query<T extends TSchema>(
    schema: T,
  ): RouteBuilder<TPath, TParams, Static<T>, TBody, TResponse> {
    this._schemas.query = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      Static<T>,
      TBody,
      TResponse
    >;
  }

  body<T extends TSchema>(
    schema: T,
  ): RouteBuilder<TPath, TParams, TQuery, Static<T>, TResponse> {
    this._schemas.body = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      TQuery,
      Static<T>,
      TResponse
    >;
  }

  response<T extends TSchema>(
    schema: T,
  ): RouteBuilder<TPath, TParams, TQuery, TBody, Static<T>> {
    this._schemas.response = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      TQuery,
      TBody,
      Static<T>
    >;
  }

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

export function route<TPath extends string>(
  path: TPath,
): RouteBuilder<TPath, PathParams<TPath>> {
  return new RouteBuilder(path);
}
