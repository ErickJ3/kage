import type { Context } from "~/context/context.ts";

export interface KageConfig {
  prefix?: string;
}

export interface ListenOptions {
  port?: number;
  hostname?: string;
  onListen?: (params: { hostname: string; port: number }) => void;
}

export type ExtendedContext<
  TDecorators extends Record<string, unknown> = Record<string, never>,
  TState extends Record<string, unknown> = Record<string, never>,
  TDerived extends Record<string, unknown> = Record<string, never>,
> = Context & TDecorators & { store: TState } & TDerived;

export interface DeriveContext {
  readonly request: Request;
  readonly headers: Headers;
  readonly method: string;
  readonly path: string;
  readonly url: URL;
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
}

export type DeriveFn<TDerived extends Record<string, unknown>> = (
  ctx: DeriveContext,
) => TDerived | Promise<TDerived>;

export type PluginFn<TApp, TResult> = (app: TApp) => TResult;

export interface RequestContext {
  set<T>(key: string, value: T): void;
  get<T = unknown>(key: string): T | undefined;
  has(key: string): boolean;
}

export type OnRequestHook = (
  request: Request,
  ctx: RequestContext,
) => Request | Response | null | Promise<Request | Response | null>;

export type OnResponseHook = (
  response: Response,
  request: Request,
  ctx: RequestContext,
) => Response | Promise<Response>;

export type OnErrorHook = (
  error: unknown,
  request: Request,
  ctx: RequestContext,
) => Response | null | Promise<Response | null>;

export type OnBeforeHandleHook<TCtx> = (
  ctx: TCtx,
) => Response | void | Promise<Response | void>;

export type OnAfterHandleHook<TCtx> = (
  ctx: TCtx,
  response: Response,
) => Response | Promise<Response>;

export interface ContextState<
  TDecorators extends Record<string, unknown> = Record<string, never>,
  TState extends Record<string, unknown> = Record<string, never>,
> {
  decorators: TDecorators;
  state: TState;
  deriveFns: Array<DeriveFn<Record<string, unknown>>>;
  onRequestHooks: OnRequestHook[];
  onResponseHooks: OnResponseHook[];
  onErrorHooks: OnErrorHook[];
  onBeforeHandleHooks: Array<OnBeforeHandleHook<unknown>>;
  onAfterHandleHooks: Array<OnAfterHandleHook<unknown>>;
}

export interface ScopeOptions {
  scoped?: boolean;
}

export interface GroupConfig {
  prefix: string;
}

export type P = Record<string, unknown>;
