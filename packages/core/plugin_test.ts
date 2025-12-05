/**
 * Tests for the plugin system.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  composePlugins,
  definePlugin,
  PluginManager,
  type Plugin,
  type PluginContext,
} from "./plugin.ts";
import type { Middleware } from "./middleware.ts";

// Helper to create a mock PluginContext
function createMockContext(): {
  ctx: PluginContext;
  middleware: Middleware[];
  routes: Array<{ method: string; path: string; handler: unknown }>;
  config: Map<string, unknown>;
} {
  const middleware: Middleware[] = [];
  const routes: Array<{ method: string; path: string; handler: unknown }> = [];
  const config: Map<string, unknown> = new Map();

  const ctx: PluginContext = {
    use(mw: Middleware) {
      middleware.push(mw);
    },
    route(method, path, handler) {
      routes.push({ method, path, handler });
    },
    getConfig<T>(key: string) {
      return config.get(key) as T;
    },
    setConfig<T>(key: string, value: T) {
      config.set(key, value);
    },
    isDevelopment: () => false,
    getBasePath: () => "/",
  };

  return { ctx, middleware, routes, config };
}

describe("definePlugin", () => {
  it("should return the plugin as-is", () => {
    const plugin: Plugin = {
      config: { name: "test" },
      hooks: {},
    };
    const result = definePlugin(plugin);
    assertEquals(result, plugin);
  });

  it("should define plugin with all options", () => {
    const plugin = definePlugin({
      config: {
        name: "full-plugin",
        version: "1.0.0",
        dependencies: ["other-plugin"],
        config: { key: "value" },
      },
      hooks: {
        onRegister: () => {},
        onBeforeStart: () => {},
        onStart: () => {},
        onShutdown: () => {},
      },
      middleware: [],
      routes: [],
    });

    assertEquals(plugin.config.name, "full-plugin");
    assertEquals(plugin.config.version, "1.0.0");
    assertEquals(plugin.config.dependencies, ["other-plugin"]);
  });
});

describe("PluginManager", () => {
  describe("register", () => {
    it("should register a plugin", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "test-plugin" },
      });

      await manager.register(plugin, ctx);
      assertEquals(manager.has("test-plugin"), true);
    });

    it("should throw if plugin already registered", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "test-plugin" },
      });

      await manager.register(plugin, ctx);
      await assertRejects(
        () => manager.register(plugin, ctx),
        Error,
        'Plugin "test-plugin" is already registered',
      );
    });

    it("should throw if dependency not registered", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: {
          name: "dependent-plugin",
          dependencies: ["missing-plugin"],
        },
      });

      await assertRejects(
        () => manager.register(plugin, ctx),
        Error,
        'Plugin "dependent-plugin" depends on "missing-plugin"',
      );
    });

    it("should register plugin with dependencies", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const basePlugin = definePlugin({
        config: { name: "base-plugin" },
      });

      const dependentPlugin = definePlugin({
        config: {
          name: "dependent-plugin",
          dependencies: ["base-plugin"],
        },
      });

      await manager.register(basePlugin, ctx);
      await manager.register(dependentPlugin, ctx);

      assertEquals(manager.has("base-plugin"), true);
      assertEquals(manager.has("dependent-plugin"), true);
    });

    it("should call onRegister hook", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      let registered = false;
      const plugin = definePlugin({
        config: { name: "hook-plugin" },
        hooks: {
          onRegister: () => {
            registered = true;
          },
        },
      });

      await manager.register(plugin, ctx);
      assertEquals(registered, true);
    });

    it("should register middleware", async () => {
      const manager = new PluginManager();
      const { ctx, middleware } = createMockContext();

      const testMiddleware: Middleware = async (_ctx, next) => {
        return await next();
      };

      const plugin = definePlugin({
        config: { name: "mw-plugin" },
        middleware: [testMiddleware],
      });

      await manager.register(plugin, ctx);
      assertEquals(middleware.length, 1);
      assertEquals(middleware[0], testMiddleware);
    });

    it("should register routes", async () => {
      const manager = new PluginManager();
      const { ctx, routes } = createMockContext();

      const handler = () => new Response("OK");

      const plugin = definePlugin({
        config: { name: "route-plugin" },
        routes: [
          { method: "GET", path: "/test", handler },
        ],
      });

      await manager.register(plugin, ctx);
      assertEquals(routes.length, 1);
      assertEquals(routes[0].method, "GET");
      assertEquals(routes[0].path, "/test");
    });

    it("should merge plugin config", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: {
          name: "config-plugin",
          config: { apiKey: "secret123" },
        },
      });

      await manager.register(plugin, ctx);
      assertEquals(manager.getConfig("config-plugin.apiKey"), "secret123");
    });
  });

  describe("hooks execution", () => {
    it("should execute onBeforeStart hooks", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      let called = false;
      const plugin = definePlugin({
        config: { name: "start-plugin" },
        hooks: {
          onBeforeStart: () => {
            called = true;
          },
        },
      });

      await manager.register(plugin, ctx);
      await manager.executeBeforeStart(ctx);
      assertEquals(called, true);
    });

    it("should execute onStart hooks", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      let info: unknown = null;
      const plugin = definePlugin({
        config: { name: "start-plugin" },
        hooks: {
          onStart: (listenInfo) => {
            info = listenInfo;
          },
        },
      });

      await manager.register(plugin, ctx);
      await manager.executeOnStart({ hostname: "localhost", port: 3000 });
      assertEquals(info, { hostname: "localhost", port: 3000 });
    });

    it("should execute onShutdown hooks in reverse order", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const order: string[] = [];

      const plugin1 = definePlugin({
        config: { name: "plugin1" },
        hooks: {
          onShutdown: () => {
            order.push("plugin1");
          },
        },
      });

      const plugin2 = definePlugin({
        config: { name: "plugin2" },
        hooks: {
          onShutdown: () => {
            order.push("plugin2");
          },
        },
      });

      await manager.register(plugin1, ctx);
      await manager.register(plugin2, ctx);
      await manager.executeOnShutdown();

      // Should execute in reverse order
      assertEquals(order, ["plugin2", "plugin1"]);
    });

    it("should execute onRequest hooks and pass through request", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "request-plugin" },
        hooks: {
          onRequest: (request) => {
            const headers = new Headers(request.headers);
            headers.set("X-Plugin", "modified");
            return new Request(request.url, { headers });
          },
        },
      });

      await manager.register(plugin, ctx);

      const req = new Request("http://localhost/test");
      const result = await manager.executeOnRequest(req);

      assertEquals(result instanceof Request, true);
      assertEquals((result as Request).headers.get("X-Plugin"), "modified");
    });

    it("should short-circuit on onRequest returning Response", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "auth-plugin" },
        hooks: {
          onRequest: () => {
            return new Response("Unauthorized", { status: 401 });
          },
        },
      });

      await manager.register(plugin, ctx);

      const req = new Request("http://localhost/test");
      const result = await manager.executeOnRequest(req);

      assertEquals(result instanceof Response, true);
      assertEquals((result as Response).status, 401);
    });

    it("should execute onResponse hooks", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "response-plugin" },
        hooks: {
          onResponse: (response) => {
            const headers = new Headers(response.headers);
            headers.set("X-Plugin", "modified");
            return new Response(response.body, { headers, status: response.status });
          },
        },
      });

      await manager.register(plugin, ctx);

      const req = new Request("http://localhost/test");
      const res = new Response("OK");
      const result = await manager.executeOnResponse(res, req);

      assertEquals(result.headers.get("X-Plugin"), "modified");
    });

    it("should execute onError hooks", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "error-plugin" },
        hooks: {
          onError: (error) => {
            return new Response(String(error), { status: 500 });
          },
        },
      });

      await manager.register(plugin, ctx);

      const req = new Request("http://localhost/test");
      const result = await manager.executeOnError(new Error("Test error"), req);

      assertEquals(result instanceof Response, true);
      assertEquals((result as Response).status, 500);
    });
  });

  describe("utility methods", () => {
    it("should get plugin by name", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      const plugin = definePlugin({
        config: { name: "test-plugin" },
      });

      await manager.register(plugin, ctx);
      const retrieved = manager.get("test-plugin");

      assertEquals(retrieved, plugin);
    });

    it("should return undefined for non-existent plugin", () => {
      const manager = new PluginManager();
      assertEquals(manager.get("non-existent"), undefined);
    });

    it("should return plugin names in order", async () => {
      const manager = new PluginManager();
      const { ctx } = createMockContext();

      await manager.register(definePlugin({ config: { name: "first" } }), ctx);
      await manager.register(definePlugin({ config: { name: "second" } }), ctx);
      await manager.register(definePlugin({ config: { name: "third" } }), ctx);

      assertEquals(manager.getPluginNames(), ["first", "second", "third"]);
    });
  });
});

describe("composePlugins", () => {
  it("should combine multiple plugins", () => {
    const plugin1 = definePlugin({
      config: { name: "p1", config: { key1: "value1" } },
      middleware: [async (_ctx, next) => {
        return await next();
      }],
    });

    const plugin2 = definePlugin({
      config: { name: "p2", config: { key2: "value2" } },
      routes: [
        { method: "GET", path: "/test", handler: () => new Response("OK") },
      ],
    });

    const combined = composePlugins("combined", plugin1, plugin2);

    assertEquals(combined.config.name, "combined");
    assertEquals(combined.middleware?.length, 1);
    assertEquals(combined.routes?.length, 1);
    assertEquals(combined.config.config?.key1, "value1");
    assertEquals(combined.config.config?.key2, "value2");
  });

  it("should execute all onRegister hooks", async () => {
    const calls: string[] = [];

    const plugin1 = definePlugin({
      config: { name: "p1" },
      hooks: {
        onRegister: () => {
          calls.push("p1");
        },
      },
    });

    const plugin2 = definePlugin({
      config: { name: "p2" },
      hooks: {
        onRegister: () => {
          calls.push("p2");
        },
      },
    });

    const combined = composePlugins("combined", plugin1, plugin2);
    const { ctx } = createMockContext();

    if (combined.hooks?.onRegister) {
      await combined.hooks.onRegister(ctx);
    }

    assertEquals(calls, ["p1", "p2"]);
  });

  it("should execute onShutdown in reverse order", async () => {
    const calls: string[] = [];

    const plugin1 = definePlugin({
      config: { name: "p1" },
      hooks: {
        onShutdown: () => {
          calls.push("p1");
        },
      },
    });

    const plugin2 = definePlugin({
      config: { name: "p2" },
      hooks: {
        onShutdown: () => {
          calls.push("p2");
        },
      },
    });

    const combined = composePlugins("combined", plugin1, plugin2);

    if (combined.hooks?.onShutdown) {
      await combined.hooks.onShutdown();
    }

    assertEquals(calls, ["p2", "p1"]);
  });
});
