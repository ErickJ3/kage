/**
 * Plugin type definitions.
 */

import type { Middleware } from "../middleware/types.ts";
import type { Handler, HttpMethod, RouteConfig } from "@kage/router";

/**
 * Plugin lifecycle hooks.
 */
export interface PluginHooks {
  onRegister?: (app: PluginContext) => void | Promise<void>;
  onBeforeStart?: (app: PluginContext) => void | Promise<void>;
  onStart?: (info: ListenInfo) => void | Promise<void>;
  onShutdown?: () => void | Promise<void>;
  onRequest?: (
    request: Request,
  ) => Request | Response | null | Promise<Request | Response | null>;
  onResponse?: (
    response: Response,
    request: Request,
  ) => Response | Promise<Response>;
  onError?: (
    error: unknown,
    request: Request,
  ) => Response | null | Promise<Response | null>;
}

/**
 * Server listening information.
 */
export interface ListenInfo {
  hostname: string;
  port: number;
}

/**
 * Plugin context providing access to application features.
 */
export interface PluginContext {
  use(middleware: Middleware): void;
  route(method: HttpMethod, path: string, handler: Handler | RouteConfig): void;
  getConfig<T = unknown>(key: string): T | undefined;
  setConfig<T = unknown>(key: string, value: T): void;
  isDevelopment(): boolean;
  getBasePath(): string;
}

/**
 * Plugin configuration options.
 */
export interface PluginConfig {
  name: string;
  version?: string;
  dependencies?: string[];
  config?: Record<string, unknown>;
}

/**
 * Complete plugin definition.
 */
export interface Plugin {
  readonly config: PluginConfig;
  readonly hooks?: PluginHooks;
  readonly middleware?: Middleware[];
  readonly routes?: Array<{
    method: HttpMethod;
    path: string;
    handler: Handler | RouteConfig;
  }>;
}
