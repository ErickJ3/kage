/**
 * Plugin composition utilities.
 */

import type { Middleware } from "~/middleware/types.ts";
import type { Plugin } from "~/plugins/types.ts";

/**
 * Define a plugin with lifecycle hooks and routes.
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/**
 * Compose multiple plugins into a single plugin.
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
