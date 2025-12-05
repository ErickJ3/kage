/**
 * Plugin system architecture for Kage.
 *
 * Provides plugin lifecycle hooks, configuration merging,
 * and plugin composition for extending Kage applications.
 */

import type { Middleware } from "./middleware.ts";
import type { Handler, RouteConfig } from "../router/types.ts";
import type { HttpMethod } from "../router/types.ts";

/**
 * Plugin lifecycle hooks.
 * Called at various stages of the application lifecycle.
 */
export interface PluginHooks {
  /**
   * Called when the plugin is first registered.
   * Use for initialization and setup.
   */
  onRegister?: (app: PluginContext) => void | Promise<void>;

  /**
   * Called before the server starts listening.
   * Use for final setup after all routes are registered.
   */
  onBeforeStart?: (app: PluginContext) => void | Promise<void>;

  /**
   * Called after the server has started.
   */
  onStart?: (info: ListenInfo) => void | Promise<void>;

  /**
   * Called when the server is shutting down.
   * Use for cleanup.
   */
  onShutdown?: () => void | Promise<void>;

  /**
   * Called before each request is processed.
   * Can modify or reject requests.
   */
  onRequest?: (request: Request) => Request | Response | null | Promise<Request | Response | null>;

  /**
   * Called after a response is generated.
   * Can modify responses.
   */
  onResponse?: (response: Response, request: Request) => Response | Promise<Response>;

  /**
   * Called when an error occurs during request handling.
   */
  onError?: (error: unknown, request: Request) => Response | null | Promise<Response | null>;
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
  /**
   * Add middleware to the application.
   */
  use(middleware: Middleware): void;

  /**
   * Register a route.
   */
  route(method: HttpMethod, path: string, handler: Handler | RouteConfig): void;

  /**
   * Get plugin configuration.
   */
  getConfig<T = unknown>(key: string): T | undefined;

  /**
   * Set plugin configuration.
   */
  setConfig<T = unknown>(key: string, value: T): void;

  /**
   * Check if the application is in development mode.
   */
  isDevelopment(): boolean;

  /**
   * Get the base path of the application.
   */
  getBasePath(): string;
}

/**
 * Plugin configuration options.
 */
export interface PluginConfig {
  /** Unique plugin name */
  name: string;

  /** Plugin version */
  version?: string;

  /** Plugin dependencies (other plugin names) */
  dependencies?: string[];

  /** Plugin configuration values */
  config?: Record<string, unknown>;
}

/**
 * Complete plugin definition.
 */
export interface Plugin {
  /** Plugin configuration */
  readonly config: PluginConfig;

  /** Plugin lifecycle hooks */
  readonly hooks?: PluginHooks;

  /** Middleware to add */
  readonly middleware?: Middleware[];

  /** Routes to add */
  readonly routes?: Array<{
    method: HttpMethod;
    path: string;
    handler: Handler | RouteConfig;
  }>;
}

/**
 * Define a plugin with lifecycle hooks and routes.
 *
 * @example
 * ```typescript
 * const authPlugin = definePlugin({
 *   config: { name: "auth", version: "1.0.0" },
 *   hooks: {
 *     onRegister: (app) => {
 *       console.log("Auth plugin registered");
 *     },
 *   },
 *   middleware: [authMiddleware],
 *   routes: [
 *     { method: "POST", path: "/login", handler: loginHandler },
 *     { method: "POST", path: "/logout", handler: logoutHandler },
 *   ],
 * });
 * ```
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/**
 * Plugin manager for registering and managing plugins.
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginOrder: string[] = [];
  private config: Map<string, unknown> = new Map();
  private hooks: {
    onBeforeStart: Array<(app: PluginContext) => void | Promise<void>>;
    onStart: Array<(info: ListenInfo) => void | Promise<void>>;
    onShutdown: Array<() => void | Promise<void>>;
    onRequest: Array<(request: Request) => Request | Response | null | Promise<Request | Response | null>>;
    onResponse: Array<(response: Response, request: Request) => Response | Promise<Response>>;
    onError: Array<(error: unknown, request: Request) => Response | null | Promise<Response | null>>;
  } = {
    onBeforeStart: [],
    onStart: [],
    onShutdown: [],
    onRequest: [],
    onResponse: [],
    onError: [],
  };

  /**
   * Register a plugin.
   * Checks dependencies and adds hooks.
   */
  async register(plugin: Plugin, context: PluginContext): Promise<void> {
    const { name, dependencies } = plugin.config;

    // Check if plugin already registered
    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    // Check dependencies
    if (dependencies) {
      for (const dep of dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin "${name}" depends on "${dep}", which is not registered`);
        }
      }
    }

    // Merge plugin config
    if (plugin.config.config) {
      for (const [key, value] of Object.entries(plugin.config.config)) {
        this.config.set(`${name}.${key}`, value);
      }
    }

    // Store plugin
    this.plugins.set(name, plugin);
    this.pluginOrder.push(name);

    // Call onRegister hook
    if (plugin.hooks?.onRegister) {
      await plugin.hooks.onRegister(context);
    }

    // Register middleware
    if (plugin.middleware) {
      for (const mw of plugin.middleware) {
        context.use(mw);
      }
    }

    // Register routes
    if (plugin.routes) {
      for (const route of plugin.routes) {
        context.route(route.method, route.path, route.handler);
      }
    }

    // Collect hooks
    if (plugin.hooks?.onBeforeStart) {
      this.hooks.onBeforeStart.push(plugin.hooks.onBeforeStart);
    }
    if (plugin.hooks?.onStart) {
      this.hooks.onStart.push(plugin.hooks.onStart);
    }
    if (plugin.hooks?.onShutdown) {
      this.hooks.onShutdown.push(plugin.hooks.onShutdown);
    }
    if (plugin.hooks?.onRequest) {
      this.hooks.onRequest.push(plugin.hooks.onRequest);
    }
    if (plugin.hooks?.onResponse) {
      this.hooks.onResponse.push(plugin.hooks.onResponse);
    }
    if (plugin.hooks?.onError) {
      this.hooks.onError.push(plugin.hooks.onError);
    }
  }

  /**
   * Check if a plugin is registered.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get a registered plugin.
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugin names in order.
   */
  getPluginNames(): string[] {
    return [...this.pluginOrder];
  }

  /**
   * Get plugin configuration value.
   */
  getConfig<T = unknown>(key: string): T | undefined {
    return this.config.get(key) as T | undefined;
  }

  /**
   * Set plugin configuration value.
   */
  setConfig<T = unknown>(key: string, value: T): void {
    this.config.set(key, value);
  }

  /**
   * Execute onBeforeStart hooks.
   */
  async executeBeforeStart(context: PluginContext): Promise<void> {
    for (const hook of this.hooks.onBeforeStart) {
      await hook(context);
    }
  }

  /**
   * Execute onStart hooks.
   */
  async executeOnStart(info: ListenInfo): Promise<void> {
    for (const hook of this.hooks.onStart) {
      await hook(info);
    }
  }

  /**
   * Execute onShutdown hooks.
   */
  async executeOnShutdown(): Promise<void> {
    // Execute in reverse order for proper cleanup
    for (let i = this.hooks.onShutdown.length - 1; i >= 0; i--) {
      await this.hooks.onShutdown[i]();
    }
  }

  /**
   * Execute onRequest hooks.
   * Returns modified request or short-circuit response.
   */
  async executeOnRequest(request: Request): Promise<Request | Response> {
    let current = request;
    for (const hook of this.hooks.onRequest) {
      const result = await hook(current);
      if (result instanceof Response) {
        return result; // Short-circuit with response
      }
      if (result !== null) {
        current = result;
      }
    }
    return current;
  }

  /**
   * Execute onResponse hooks.
   * Returns modified response.
   */
  async executeOnResponse(response: Response, request: Request): Promise<Response> {
    let current = response;
    for (const hook of this.hooks.onResponse) {
      current = await hook(current, request);
    }
    return current;
  }

  /**
   * Execute onError hooks.
   * Returns error response if any hook handles it.
   */
  async executeOnError(error: unknown, request: Request): Promise<Response | null> {
    for (const hook of this.hooks.onError) {
      const result = await hook(error, request);
      if (result !== null) {
        return result; // Error handled
      }
    }
    return null; // No plugin handled the error
  }
}

/**
 * Compose multiple plugins into a single plugin.
 *
 * @example
 * ```typescript
 * const combinedPlugin = composePlugins(
 *   "combined",
 *   authPlugin,
 *   loggingPlugin,
 *   validationPlugin,
 * );
 * ```
 */
export function composePlugins(name: string, ...plugins: Plugin[]): Plugin {
  const middleware: Middleware[] = [];
  const routes: Plugin["routes"] = [];
  const config: Record<string, unknown> = {};

  for (const plugin of plugins) {
    if (plugin.middleware) {
      middleware.push(...plugin.middleware);
    }
    if (plugin.routes) {
      routes.push(...plugin.routes);
    }
    if (plugin.config.config) {
      Object.assign(config, plugin.config.config);
    }
  }

  return {
    config: {
      name,
      version: "1.0.0",
      config,
    },
    hooks: {
      onRegister: async (app) => {
        for (const plugin of plugins) {
          if (plugin.hooks?.onRegister) {
            await plugin.hooks.onRegister(app);
          }
        }
      },
      onBeforeStart: async (app) => {
        for (const plugin of plugins) {
          if (plugin.hooks?.onBeforeStart) {
            await plugin.hooks.onBeforeStart(app);
          }
        }
      },
      onStart: async (info) => {
        for (const plugin of plugins) {
          if (plugin.hooks?.onStart) {
            await plugin.hooks.onStart(info);
          }
        }
      },
      onShutdown: async () => {
        // Execute in reverse order
        for (let i = plugins.length - 1; i >= 0; i--) {
          if (plugins[i].hooks?.onShutdown) {
            await plugins[i].hooks!.onShutdown!();
          }
        }
      },
      onRequest: async (request) => {
        let current = request;
        for (const plugin of plugins) {
          if (plugin.hooks?.onRequest) {
            const result = await plugin.hooks.onRequest(current);
            if (result instanceof Response) {
              return result;
            }
            if (result !== null) {
              current = result;
            }
          }
        }
        return current;
      },
      onResponse: async (response, request) => {
        let current = response;
        for (const plugin of plugins) {
          if (plugin.hooks?.onResponse) {
            current = await plugin.hooks.onResponse(current, request);
          }
        }
        return current;
      },
      onError: async (error, request) => {
        for (const plugin of plugins) {
          if (plugin.hooks?.onError) {
            const result = await plugin.hooks.onError(error, request);
            if (result !== null) {
              return result;
            }
          }
        }
        return null;
      },
    },
    middleware: middleware.length > 0 ? middleware : undefined,
    routes: routes.length > 0 ? routes : undefined,
  };
}
