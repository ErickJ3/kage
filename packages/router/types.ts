/**
 * Type definitions for the router module.
 */

import type { Permission } from "../permissions/mod.ts";

/**
 * HTTP methods supported by the router.
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

import type { Context } from "../core/context.ts";

/**
 * Route handler function that processes requests.
 *
 * Receives Context object with request data and helpers.
 */
export type Handler = (ctx: Context) => unknown | Promise<unknown>;

/**
 * Configuration for route with optional permissions.
 *
 * Allows declarative permission specification at route level.
 *
 * @example
 * ```typescript
 * const config: RouteConfig = {
 *   permissions: ["net:api.example.com", "env:API_KEY"],
 *   handler: async (ctx) => {
 *     // Only executed if permissions are granted
 *     const response = await fetch("https://api.example.com");
 *     return ctx.json(await response.json());
 *   }
 * };
 * ```
 */
export interface RouteConfig {
  /**
   * Required permissions for this route.
   * Handler will only execute if all permissions are granted.
   */
  permissions?: Permission[];

  /**
   * Route handler function.
   */
  handler: Handler;
}

/**
 * Typed route configuration with schema inference.
 * Use this when you want explicit context typing in route handlers.
 */
export interface TypedRouteConfig<TContext extends Context = Context> {
  /**
   * Required permissions for this route.
   */
  permissions?: Permission[];

  /**
   * Typed route handler function.
   */
  handler: (ctx: TContext) => unknown | Promise<unknown>;
}

/**
 * Internal route representation with pattern matching.
 */
export interface Route {
  method: HttpMethod;
  pattern: RegExp;
  handler: Handler;
  // Path parameters extracted from route pattern (e.g., ["id", "name"])
  paramNames: string[];
  // Original path string for debugging and error messages
  path: string;
  // Required permissions for this route
  permissions?: Permission[];
}

/**
 * Result of a successful route match operation.
 */
export interface Match {
  handler: Handler;
  // Extracted path parameters as key-value pairs
  params: Record<string, string>;
}
