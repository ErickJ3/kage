/**
 * Type definitions for the router module.
 */

import type { Permission } from "@kage/permissions";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

// deno-lint-ignore no-explicit-any
export type Handler<TContext = any> = (
  ctx: TContext,
) => unknown | Promise<unknown>;

/**
 * Configuration for route with optional permissions.
 *
 * @example
 * ```typescript
 * const config: RouteConfig = {
 *   permissions: ["net:api.example.com", "env:API_KEY"],
 *   handler: async (ctx) => {
 *     const response = await fetch("https://api.example.com");
 *     return ctx.json(await response.json());
 *   }
 * };
 * ```
 */
export interface RouteConfig<TContext = unknown> {
  permissions?: Permission[];
  handler: Handler<TContext>;
}

export interface Route {
  method: HttpMethod;
  pattern: RegExp;
  handler: Handler;
  paramNames: string[];
  path: string;
  permissions?: Permission[];
}

export interface Match {
  handler: Handler;
  params: Record<string, string>;
}
