/**
 * Type definitions for the router module.
 */

import type { Permission } from "@kage/permissions";
import type { Context } from "@kage/core";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type Handler = (ctx: Context) => unknown | Promise<unknown>;

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
export interface RouteConfig {
  permissions?: Permission[];
  handler: Handler;
}

export interface TypedRouteConfig<TContext extends Context = Context> {
  permissions?: Permission[];
  handler: (ctx: TContext) => unknown | Promise<unknown>;
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
