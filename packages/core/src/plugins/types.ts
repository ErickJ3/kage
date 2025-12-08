/**
 * Type definitions for the Kage plugin system
 *
 * This module provides type-safe plugin composition with full type inference
 * for decorators, state, and derived values.
 */

import type { Context } from "~/context/context.ts";

/**
 * Base context type with decorated values, state, and derived values.
 * Used internally for type composition.
 */
export type PluginContext<
  TDecorators extends Record<string, unknown> = Record<string, never>,
  TState extends Record<string, unknown> = Record<string, never>,
  TDerived extends Record<string, unknown> = Record<string, never>,
> = Context & TDecorators & { store: TState } & TDerived;

/**
 * Context passed to derive functions.
 * Contains request information available at request time.
 */
export interface DeriveContext {
  readonly request: Request;
  readonly headers: Headers;
  readonly method: string;
  readonly path: string;
  readonly url: URL;
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
}

/**
 * Function that derives new values from request context.
 * Called once per request.
 */
export type DeriveFn<
  TDerived extends Record<string, unknown>,
> = (ctx: DeriveContext) => TDerived | Promise<TDerived>;

/**
 * Plugin function type.
 * A plugin receives an app instance and returns a modified instance.
 */
export type PluginFn<
  TApp,
  TResult,
> = (app: TApp) => TResult;

/**
 * Request context passed through all lifecycle hooks.
 * Use `set` to store values and `get` to retrieve them.
 *
 * @example
 * ```typescript
 * app
 *   .onRequest((req, ctx) => {
 *     ctx.set("startTime", performance.now());
 *     return null;
 *   })
 *   .onResponse((res, req, ctx) => {
 *     const start = ctx.get("startTime") as number;
 *     res.headers.set("X-Time", `${performance.now() - start}ms`);
 *     return res;
 *   });
 * ```
 */
export interface RequestContext {
  /** Store a value in the request context */
  set<T>(key: string, value: T): void;
  /** Retrieve a value from the request context */
  get<T = unknown>(key: string): T | undefined;
  /** Check if a key exists in the request context */
  has(key: string): boolean;
}

/**
 * Lifecycle hook for request interception.
 * Can return a Response to short-circuit, Request to modify, or null to continue.
 */
export type OnRequestHook = (
  request: Request,
  ctx: RequestContext,
) => Request | Response | null | Promise<Request | Response | null>;

/**
 * Lifecycle hook for response transformation.
 */
export type OnResponseHook = (
  response: Response,
  request: Request,
  ctx: RequestContext,
) => Response | Promise<Response>;

/**
 * Lifecycle hook for error handling.
 * Return a Response to handle the error, or null to pass to next handler.
 */
export type OnErrorHook = (
  error: unknown,
  request: Request,
  ctx: RequestContext,
) => Response | null | Promise<Response | null>;

/**
 * Lifecycle hook called before handler execution.
 * Can return a Response to short-circuit.
 */
export type OnBeforeHandleHook<TCtx> = (
  ctx: TCtx,
) => Response | void | Promise<Response | void>;

/**
 * Lifecycle hook called after handler execution.
 * Can transform the response.
 */
export type OnAfterHandleHook<TCtx> = (
  ctx: TCtx,
  response: Response,
) => Response | Promise<Response>;

/**
 * Internal storage for plugin system state.
 */
export interface PluginSystemState<
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

/**
 * Type helper to merge decorator types.
 */
export type MergeDecorators<
  TExisting extends Record<string, unknown>,
  TNew extends Record<string, unknown>,
> = TExisting & TNew;

/**
 * Type helper to merge state types.
 */
export type MergeState<
  TExisting extends Record<string, unknown>,
  TNew extends Record<string, unknown>,
> = TExisting & TNew;

/**
 * Type helper to merge derived types.
 */
export type MergeDerived<
  TExisting extends Record<string, unknown>,
  TNew extends Record<string, unknown>,
> = TExisting & TNew;

/**
 * Options for scoped plugin application.
 */
export interface ScopeOptions {
  /** Apply decorators to this scope only */
  scoped?: boolean;
}

/**
 * Group configuration for route grouping with plugins.
 */
export interface GroupConfig {
  prefix: string;
}

/**
 * @example
 * ```typescript
 * import { Kage, type P } from "@kage/core";
 *
 * // Instead of:
 * function version<
 *   TD extends Record<string, unknown>,
 *   TS extends Record<string, unknown>,
 *   TDR extends Record<string, unknown>,
 * >(app: Kage<TD, TS, TDR>) {
 *   return app.decorate("version", "1.0.0");
 * }
 *
 * // Write:
 * function version<TD extends P, TS extends P, TDR extends P>(app: Kage<TD, TS, TDR>) {
 *   return app.decorate("version", "1.0.0");
 * }
 * ```
 */
export type P = Record<string, unknown>;
