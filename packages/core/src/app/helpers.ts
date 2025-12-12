import type { Handler } from "~/router/mod.ts";
import type { Context } from "~/context/context.ts";
import type {
  DeriveFn,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
} from "~/app/types.ts";

const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const OCTET_CONTENT_TYPE = "application/octet-stream";
const TEXT_HEADERS: HeadersInit = { "Content-Type": TEXT_CONTENT_TYPE };
const BINARY_HEADERS: HeadersInit = { "Content-Type": OCTET_CONTENT_TYPE };

export const TEXT_INIT_200: ResponseInit = { headers: TEXT_HEADERS };
export const BINARY_INIT_200: ResponseInit = { headers: BINARY_HEADERS };
export const NOT_FOUND_BODY = "Not Found";
export const INTERNAL_ERROR_BODY = "Internal Server Error";

export function normalizePath(base: string, path: string): string {
  if (base === "/") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function resultToResponse(result: unknown): Response {
  if (result instanceof Response) {
    return result;
  }

  if (result == null) {
    return new Response(null, { status: 204 });
  }

  if (typeof result === "object") {
    if (result instanceof Uint8Array) {
      return new Response(result as BodyInit, BINARY_INIT_200);
    }
    if (result instanceof ArrayBuffer) {
      return new Response(result as BodyInit, BINARY_INIT_200);
    }
    if (result instanceof ReadableStream) {
      return new Response(result as BodyInit, BINARY_INIT_200);
    }
    return Response.json(result);
  }
  if (typeof result === "string") {
    return new Response(result, TEXT_INIT_200);
  }
  return Response.json(result);
}

export function applyDecorators(
  ctx: Record<string, unknown>,
  decorators: Record<string, unknown>,
  keys: string[],
): void {
  for (let i = 0; i < keys.length; i++) {
    ctx[keys[i]] = decorators[keys[i]];
  }
}

export async function applyDerives(
  ctx: Context,
  extendedCtx: Record<string, unknown>,
  deriveFns: DeriveFn<Record<string, unknown>>[],
): Promise<void> {
  for (let i = 0; i < deriveFns.length; i++) {
    const derived = deriveFns[i](ctx);
    const resolvedDerived = derived instanceof Promise
      ? await derived
      : derived;
    for (const key in resolvedDerived) {
      extendedCtx[key] = resolvedDerived[key];
    }
  }
}

export async function executeBeforeHooks(
  ctx: unknown,
  hooks: OnBeforeHandleHook<unknown>[],
): Promise<Response | null> {
  for (let i = 0; i < hooks.length; i++) {
    const result = hooks[i](ctx);
    if (result instanceof Response) {
      return result;
    }
    if (result instanceof Promise) {
      const resolved = await result;
      if (resolved instanceof Response) {
        return resolved;
      }
    }
  }
  return null;
}

export async function executeAfterHooks(
  ctx: unknown,
  response: Response,
  hooks: OnAfterHandleHook<unknown>[],
): Promise<Response> {
  let res = response;
  for (let i = 0; i < hooks.length; i++) {
    const hookResult = hooks[i](ctx, res);
    res = hookResult instanceof Promise ? await hookResult : hookResult;
  }
  return res;
}

export interface PluginWrapperConfig<TState> {
  deriveFns: DeriveFn<Record<string, unknown>>[];
  decorators: Record<string, unknown>;
  decoratorKeys: string[];
  state: TState;
  beforeHooks: OnBeforeHandleHook<unknown>[];
  afterHooks: OnAfterHandleHook<unknown>[];
  onErrorHooks?: OnErrorHook[];
}

export function createPluginWrapper<TState>(
  handler: Handler,
  config: PluginWrapperConfig<TState>,
): Handler {
  const {
    deriveFns,
    decorators,
    decoratorKeys,
    state,
    beforeHooks,
    afterHooks,
    onErrorHooks,
  } = config;

  const hasDerive = deriveFns.length > 0;
  const hasDecorators = decoratorKeys.length > 0;
  const hasBeforeHooks = beforeHooks.length > 0;
  const hasAfterHooks = afterHooks.length > 0;
  const hasErrorHooks = onErrorHooks && onErrorHooks.length > 0;

  if (
    !hasDerive && !hasDecorators && !hasBeforeHooks && !hasAfterHooks &&
    !hasErrorHooks
  ) {
    return (ctx: Context) => {
      (ctx as Context & { store: TState }).store = state;
      return handler(ctx);
    };
  }

  if (!hasDerive && !hasBeforeHooks && !hasAfterHooks && !hasErrorHooks) {
    return (ctx: Context) => {
      const extendedCtx = Object.create(ctx) as
        & Context
        & Record<string, unknown>
        & { store: TState };
      applyDecorators(extendedCtx, decorators, decoratorKeys);
      extendedCtx.store = state;
      return handler(extendedCtx);
    };
  }

  return async (ctx: Context) => {
    const extendedCtx = Object.create(ctx) as
      & Context
      & Record<string, unknown>
      & { store: TState };

    if (hasDecorators) {
      applyDecorators(extendedCtx, decorators, decoratorKeys);
    }

    extendedCtx.store = state;

    if (hasDerive) {
      await applyDerives(
        extendedCtx as unknown as Context,
        extendedCtx,
        deriveFns,
      );
    }

    if (hasBeforeHooks) {
      const earlyResponse = await executeBeforeHooks(extendedCtx, beforeHooks);
      if (earlyResponse) return earlyResponse;
    }

    let response: Response;
    try {
      let result = handler(extendedCtx);
      if (result instanceof Promise) {
        result = await result;
      }
      response = result instanceof Response ? result : resultToResponse(result);
    } catch (error) {
      if (hasErrorHooks) {
        for (const hook of onErrorHooks!) {
          const errorResponse = await hook(error, ctx.request, {
            set: () => {},
            get: () => undefined,
            has: () => false,
          });
          if (errorResponse) return errorResponse;
        }
      }
      throw error;
    }

    if (hasAfterHooks) {
      response = await executeAfterHooks(extendedCtx, response, afterHooks);
    }

    return response;
  };
}
