import { Context } from "~/context/mod.ts";
import {
  type Infer,
  type StandardSchema,
  validate,
} from "~/schema/standard.ts";
import {
  createValidationErrorResponse,
  formatIssues,
} from "~/schema/errors.ts";
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
  const typedCtx = Object.create(null);

  for (const key of Object.keys(ctx)) {
    typedCtx[key] = (ctx as unknown as Record<string, unknown>)[key];
  }

  typedCtx.request = ctx.request;
  typedCtx.params = ctx.params as TParams;
  typedCtx.method = ctx.method;
  typedCtx.headers = ctx.headers;
  typedCtx.path = ctx.path;
  typedCtx.state = ctx.state;
  typedCtx.store = (ctx as unknown as Record<string, unknown>).store;
  typedCtx.query = query;
  typedCtx.body = body;

  Object.defineProperty(typedCtx, "url", {
    get() {
      return ctx.url;
    },
    enumerable: true,
  });

  typedCtx.json = ctx.json.bind(ctx);
  typedCtx.text = ctx.text.bind(ctx);
  typedCtx.html = ctx.html.bind(ctx);
  typedCtx.redirect = ctx.redirect.bind(ctx);
  typedCtx.noContent = ctx.noContent.bind(ctx);
  typedCtx.notFound = ctx.notFound.bind(ctx);
  typedCtx.badRequest = ctx.badRequest.bind(ctx);
  typedCtx.unauthorized = ctx.unauthorized.bind(ctx);
  typedCtx.forbidden = ctx.forbidden.bind(ctx);
  typedCtx.internalError = ctx.internalError.bind(ctx);
  typedCtx.binary = ctx.binary.bind(ctx);
  typedCtx.stream = ctx.stream.bind(ctx);
  typedCtx.response = ctx.response.bind(ctx);

  return typedCtx;
}

export function createRoute<
  TPath extends string,
  TParamsSchema extends StandardSchema | undefined = undefined,
  TQuerySchema extends StandardSchema | undefined = undefined,
  TBodySchema extends StandardSchema | undefined = undefined,
  TResponseSchema extends StandardSchema | undefined = undefined,
>(config: {
  path: TPath;
  schema?: {
    params?: TParamsSchema;
    query?: TQuerySchema;
    body?: TBodySchema;
    response?: TResponseSchema;
  };
  handler: TypedHandler<
    TParamsSchema extends StandardSchema ? Infer<TParamsSchema>
      : PathParams<TPath>,
    InferSchema<TQuerySchema, Record<string, unknown>>,
    InferSchema<TBodySchema, unknown>,
    InferSchema<TResponseSchema, unknown>
  >;
}): TypedRouteDefinition {
  return {
    path: config.path,
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
      const result = await validate(schemas.params, ctx.params);
      if (!result.success) {
        return createValidationErrorResponse(result.issues);
      }
      validatedParams = result.data as Record<string, string>;
    }

    let validatedQuery: Record<string, unknown> = {};
    if (schemas.query) {
      const queryObj = Object.fromEntries(ctx.url.searchParams.entries());
      const result = await validate(schemas.query, queryObj);
      if (!result.success) {
        return createValidationErrorResponse(result.issues);
      }
      validatedQuery = result.data as Record<string, unknown>;
    }

    let validatedBody: unknown = undefined;
    if (schemas.body) {
      try {
        const body = await ctx.request.json();
        const result = await validate(schemas.body, body);
        if (!result.success) {
          return createValidationErrorResponse(result.issues);
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

    const response = await (
      handler as TypedHandler<
        Record<string, string>,
        Record<string, unknown>,
        unknown,
        unknown
      >
    )(typedCtx);

    if (schemas.response && Deno.env.get("DENO_ENV") !== "production") {
      let dataToValidate: unknown;

      if (response instanceof Response) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          try {
            const cloned = response.clone();
            dataToValidate = await cloned.json();
          } catch {
            // not json, skip
          }
        }
      } else {
        dataToValidate = response;
      }

      if (dataToValidate !== undefined) {
        const result = await validate(schemas.response, dataToValidate);
        if (!result.success) {
          console.warn(
            "Response validation failed:",
            formatIssues(result.issues),
          );
        }
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
  private _schemas: TypedSchemaConfig = {};

  constructor(path: TPath) {
    this._path = path;
  }

  params<T extends StandardSchema>(
    schema: T,
  ): RouteBuilder<TPath, Infer<T>, TQuery, TBody, TResponse> {
    this._schemas.params = schema;
    return this as unknown as RouteBuilder<
      TPath,
      Infer<T>,
      TQuery,
      TBody,
      TResponse
    >;
  }

  query<T extends StandardSchema>(
    schema: T,
  ): RouteBuilder<TPath, TParams, Infer<T>, TBody, TResponse> {
    this._schemas.query = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      Infer<T>,
      TBody,
      TResponse
    >;
  }

  body<T extends StandardSchema>(
    schema: T,
  ): RouteBuilder<TPath, TParams, TQuery, Infer<T>, TResponse> {
    this._schemas.body = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      TQuery,
      Infer<T>,
      TResponse
    >;
  }

  response<T extends StandardSchema>(
    schema: T,
  ): RouteBuilder<TPath, TParams, TQuery, TBody, Infer<T>> {
    this._schemas.response = schema;
    return this as unknown as RouteBuilder<
      TPath,
      TParams,
      TQuery,
      TBody,
      Infer<T>
    >;
  }

  handler(
    fn: TypedHandler<TParams, TQuery, TBody, TResponse>,
  ): TypedRouteDefinition<TParams, TQuery, TBody, TResponse> {
    return {
      path: this._path,
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
