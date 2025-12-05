/**
 * Plugin manager for registering and managing plugins.
 */

import type {
  ListenInfo,
  Plugin,
  PluginContext,
  PluginHooks,
} from "~/plugins/types.ts";

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginOrder: string[] = [];
  private config: Map<string, unknown> = new Map();
  private hooks: {
    onBeforeStart: Array<NonNullable<PluginHooks["onBeforeStart"]>>;
    onStart: Array<NonNullable<PluginHooks["onStart"]>>;
    onShutdown: Array<NonNullable<PluginHooks["onShutdown"]>>;
    onRequest: Array<NonNullable<PluginHooks["onRequest"]>>;
    onResponse: Array<NonNullable<PluginHooks["onResponse"]>>;
    onError: Array<NonNullable<PluginHooks["onError"]>>;
  } = {
    onBeforeStart: [],
    onStart: [],
    onShutdown: [],
    onRequest: [],
    onResponse: [],
    onError: [],
  };

  async register(plugin: Plugin, context: PluginContext): Promise<void> {
    const { name, dependencies } = plugin.config;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    if (dependencies) {
      for (const dep of dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(
            `Plugin "${name}" depends on "${dep}", which is not registered`,
          );
        }
      }
    }

    if (plugin.config.config) {
      for (const [key, value] of Object.entries(plugin.config.config)) {
        this.config.set(`${name}.${key}`, value);
      }
    }

    this.plugins.set(name, plugin);
    this.pluginOrder.push(name);

    if (plugin.hooks?.onRegister) {
      await plugin.hooks.onRegister(context);
    }

    if (plugin.middleware) {
      for (const mw of plugin.middleware) {
        context.use(mw);
      }
    }

    if (plugin.routes) {
      for (const route of plugin.routes) {
        context.route(route.method, route.path, route.handler);
      }
    }

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

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getPluginNames(): string[] {
    return [...this.pluginOrder];
  }

  getConfig<T = unknown>(key: string): T | undefined {
    return this.config.get(key) as T | undefined;
  }

  setConfig<T = unknown>(key: string, value: T): void {
    this.config.set(key, value);
  }

  async executeBeforeStart(context: PluginContext): Promise<void> {
    for (const hook of this.hooks.onBeforeStart) {
      await hook(context);
    }
  }

  async executeOnStart(info: ListenInfo): Promise<void> {
    for (const hook of this.hooks.onStart) {
      await hook(info);
    }
  }

  async executeOnShutdown(): Promise<void> {
    for (let i = this.hooks.onShutdown.length - 1; i >= 0; i--) {
      await this.hooks.onShutdown[i]();
    }
  }

  async executeOnRequest(request: Request): Promise<Request | Response> {
    let current = request;
    for (const hook of this.hooks.onRequest) {
      const result = await hook(current);
      if (result instanceof Response) {
        return result;
      }
      if (result !== null) {
        current = result;
      }
    }
    return current;
  }

  async executeOnResponse(
    response: Response,
    request: Request,
  ): Promise<Response> {
    let current = response;
    for (const hook of this.hooks.onResponse) {
      current = await hook(current, request);
    }
    return current;
  }

  async executeOnError(
    error: unknown,
    request: Request,
  ): Promise<Response | null> {
    for (const hook of this.hooks.onError) {
      const result = await hook(error, request);
      if (result !== null) {
        return result;
      }
    }
    return null;
  }
}
