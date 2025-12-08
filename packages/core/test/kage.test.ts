/**
 * Tests for Kage application class.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Kage } from "../src/app/mod.ts";
import type { Middleware } from "../src/middleware/mod.ts";

describe("Kage", () => {
  describe("constructor", () => {
    it("should create instance with defaults", () => {
      const app = new Kage();
      assertExists(app);
    });

    it("should accept custom config", () => {
      const app = new Kage({
        basePath: "/api",
      });
      assertExists(app);
    });
  });

  describe("route registration", () => {
    it("should register GET route", () => {
      const app = new Kage();
      app.get("/users", () => ({ users: [] }));
    });

    it("should register POST route", () => {
      const app = new Kage();
      app.post("/users", () => ({ created: true }));
    });

    it("should register PUT route", () => {
      const app = new Kage();
      app.put("/users/:id", () => ({ updated: true }));
    });

    it("should register PATCH route", () => {
      const app = new Kage();
      app.patch("/users/:id", () => ({ patched: true }));
    });

    it("should register DELETE route", () => {
      const app = new Kage();
      app.delete("/users/:id", () => ({ deleted: true }));
    });

    it("should register HEAD route", () => {
      const app = new Kage();
      app.head("/health", () => null);
    });

    it("should register OPTIONS route", () => {
      const app = new Kage();
      app.options("/api", () => null);
    });

    it("should apply basePath to routes", () => {
      const app = new Kage({ basePath: "/api/v1" });
      app.get("/users", () => ({ users: [] }));
    });
  });

  describe("middleware", () => {
    it("should register middleware", () => {
      const app = new Kage();
      const mw: Middleware = async (_ctx, next) => await next();
      app.use(mw);
    });

    it("should register multiple middleware", () => {
      const app = new Kage();
      const mw1: Middleware = async (_ctx, next) => await next();
      const mw2: Middleware = async (_ctx, next) => await next();
      app.use(mw1);
      app.use(mw2);
    });
  });

  describe("request handling simulation", () => {
    it("should handle fetch-like request", async () => {
      const app = new Kage();
      app.get("/test", (ctx) => ctx.json({ success: true }));

      // Simulate internal handling by accessing private method
      // In real tests we'd use actual server or test utilities
      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/test");
      const response = await handler(request);

      assertEquals(response.status, 200);
      assertEquals(await response.json(), { success: true });
    });

    it("should return 404 for unknown routes", async () => {
      const app = new Kage();
      app.get("/known", () => "OK");

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/unknown");
      const response = await handler(request);

      assertEquals(response.status, 404);
    });

    it("should extract route params", async () => {
      const app = new Kage();
      app.get("/users/:id", (ctx) => ctx.json({ id: ctx.params.id }));

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/users/123");
      const response = await handler(request);

      assertEquals(await response.json(), { id: "123" });
    });

    it("should handle string responses", async () => {
      const app = new Kage();
      app.get("/text", () => "Hello, World!");

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/text");
      const response = await handler(request);

      assertEquals(
        response.headers.get("Content-Type"),
        "text/plain; charset=utf-8",
      );
      assertEquals(await response.text(), "Hello, World!");
    });

    it("should handle object responses as JSON", async () => {
      const app = new Kage();
      app.get("/json", () => ({ message: "hello" }));

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/json");
      const response = await handler(request);

      assert(
        response.headers.get("Content-Type")?.startsWith("application/json"),
      );
      assertEquals(await response.json(), { message: "hello" });
    });

    it("should handle null responses as 204", async () => {
      const app = new Kage();
      app.get("/empty", () => null);

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/empty");
      const response = await handler(request);

      assertEquals(response.status, 204);
    });

    it("should handle Response objects directly", async () => {
      const app = new Kage();
      app.get("/custom", (ctx) =>
        ctx.response("Custom", {
          status: 201,
          headers: { "X-Custom": "value" },
        }));

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/custom");
      const response = await handler(request);

      assertEquals(response.status, 201);
      assertEquals(response.headers.get("X-Custom"), "value");
    });

    it("should handle async handlers", async () => {
      const app = new Kage();
      app.get("/async", async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ctx.json({ async: true });
      });

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/async");
      const response = await handler(request);

      assertEquals(await response.json(), { async: true });
    });

    it("should handle errors gracefully", async () => {
      const app = new Kage();
      app.get("/error", () => {
        throw new Error("Test error");
      });

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/error");
      const response = await handler(request);

      assertEquals(response.status, 500);
    });

    it("should execute middleware", async () => {
      const app = new Kage();
      const order: number[] = [];

      const mw: Middleware = async (_ctx, next) => {
        order.push(1);
        const response = await next();
        order.push(3);
        return response;
      };
      app.use(mw);

      app.get("/mw", () => {
        order.push(2);
        return "OK";
      });

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/mw");
      await handler(request);

      assertEquals(order, [1, 2, 3]);
    });

    it("should allow middleware to modify response", async () => {
      const app = new Kage();

      const mw: Middleware = async (_ctx, next) => {
        const response = await next();
        const newHeaders = new Headers(response.headers);
        newHeaders.set("X-Middleware", "applied");
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      };
      app.use(mw);

      app.get("/modified", () => "OK");

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/modified");
      const response = await handler(request);

      assertEquals(response.headers.get("X-Middleware"), "applied");
    });

    it("should handle binary responses", async () => {
      const app = new Kage();
      app.get("/binary", () => new Uint8Array([1, 2, 3]));

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/binary");
      const response = await handler(request);

      assertEquals(
        response.headers.get("Content-Type"),
        "application/octet-stream",
      );
      const buffer = await response.arrayBuffer();
      assertEquals(new Uint8Array(buffer), new Uint8Array([1, 2, 3]));
    });
  });

  describe("basePath handling", () => {
    it("should handle basePath without trailing slash", async () => {
      const app = new Kage({ basePath: "/api" });
      app.get("/users", () => "users");

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/api/users");
      const response = await handler(request);

      assertEquals(response.status, 200);
    });

    it("should handle basePath with trailing slash", async () => {
      const app = new Kage({ basePath: "/api/" });
      app.get("/users", () => "users");

      const handler = (
        app as unknown as {
          handleRequest: (req: Request) => Promise<Response>;
        }
      ).handleRequest.bind(app);

      const request = new Request("http://localhost:8000/api/users");
      const response = await handler(request);

      assertEquals(response.status, 200);
    });
  });

  describe("decorate", () => {
    it("should add decorated values to context", async () => {
      const app = new Kage()
        .decorate("version", "1.0.0")
        .get("/", (c) => c.json({ version: c.version }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { version: "1.0.0" });
    });

    it("should support multiple decorators", async () => {
      const app = new Kage()
        .decorate("a", 1)
        .decorate("b", "two")
        .get("/", (c) => c.json({ a: c.a, b: c.b }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { a: 1, b: "two" });
    });

    it("should support object decorators", async () => {
      const db = { query: () => [{ id: 1 }] };
      const app = new Kage()
        .decorate("db", db)
        .get("/", (c) => c.json({ data: c.db.query() }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { data: [{ id: 1 }] });
    });
  });

  describe("state", () => {
    it("should provide mutable state via store", async () => {
      const app = new Kage().state("counter", 0).get("/", (c) => {
        c.store.counter++;
        return c.json({ count: c.store.counter });
      });

      const response1 = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response1.json(), { count: 1 });

      const response2 = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response2.json(), { count: 2 });
    });

    it("should support multiple state values", async () => {
      const app = new Kage()
        .state("a", 10)
        .state("b", "hello")
        .get("/", (c) => c.json({ a: c.store.a, b: c.store.b }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { a: 10, b: "hello" });
    });
  });

  describe("derive", () => {
    it("should derive values from request", async () => {
      const app = new Kage()
        .derive((c) => ({
          userAgent: c.headers.get("user-agent") ?? "unknown",
        }))
        .get("/", (c) => c.json({ ua: c.userAgent }));

      const response = await app.fetch(
        new Request("http://localhost:8000/", {
          headers: { "user-agent": "test-agent" },
        }),
      );
      assertEquals(await response.json(), { ua: "test-agent" });
    });

    it("should support async derive", async () => {
      const app = new Kage()
        .derive(async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { computed: 42 };
        })
        .get("/", (c) => c.json({ value: c.computed }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { value: 42 });
    });

    it("should chain multiple derives", async () => {
      const app = new Kage()
        .derive(() => ({ a: 1 }))
        .derive(() => ({ b: 2 }))
        .get("/", (c) => c.json({ a: c.a, b: c.b }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { a: 1, b: 2 });
    });
  });

  describe("hooks", () => {
    it("onRequest should intercept before routing", async () => {
      const app = new Kage()
        .onRequest((req) => {
          if (req.headers.get("x-blocked") === "true") {
            return new Response("Blocked", { status: 403 });
          }
          return null;
        })
        .get("/", () => "OK");

      const normal = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await normal.text(), "OK");

      const blocked = await app.fetch(
        new Request("http://localhost:8000/", {
          headers: { "x-blocked": "true" },
        }),
      );
      assertEquals(blocked.status, 403);
    });

    it("onResponse should transform response", async () => {
      const app = new Kage()
        .onResponse((response) => {
          const headers = new Headers(response.headers);
          headers.set("x-processed", "true");
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        })
        .get("/", () => "OK");

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(response.headers.get("x-processed"), "true");
    });

    it("onError should handle errors", async () => {
      const app = new Kage()
        .onError((error) => {
          return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        })
        .get("/", () => {
          throw new Error("test error");
        });

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(response.status, 500);
      assertEquals(await response.json(), { error: "test error" });
    });

    it("onBeforeHandle should run before handler", async () => {
      const order: string[] = [];
      const app = new Kage()
        .onBeforeHandle(() => {
          order.push("before");
        })
        .get("/", () => {
          order.push("handler");
          return "OK";
        });

      await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(order, ["before", "handler"]);
    });

    it("onBeforeHandle can short-circuit with Response", async () => {
      const app = new Kage()
        .onBeforeHandle(() => new Response("Intercepted", { status: 401 }))
        .get("/", () => "OK");

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(response.status, 401);
      assertEquals(await response.text(), "Intercepted");
    });

    it("onAfterHandle should transform response", async () => {
      const app = new Kage()
        .onAfterHandle((_c, response) => {
          const headers = new Headers(response.headers);
          headers.set("x-after", "true");
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        })
        .get("/", () => "OK");

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(response.headers.get("x-after"), "true");
    });
  });

  describe("plugins", () => {
    it("should apply plugin functions", async () => {
      function myPlugin<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app.decorate("pluginValue", 123);
      }

      const app = new Kage()
        .use(myPlugin)
        .get("/", (c) => c.json({ value: c.pluginValue }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { value: 123 });
    });

    it("should chain multiple plugins", async () => {
      function pluginA<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app.decorate("a", "A");
      }

      function pluginB<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app.decorate("b", "B");
      }

      const app = new Kage()
        .use(pluginA)
        .use(pluginB)
        .get("/", (c) => c.json({ a: c.a, b: c.b }));

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.json(), { a: "A", b: "B" });
    });
  });

  describe("groups", () => {
    it("should create route group with prefix", async () => {
      const app = new Kage().group(
        "/api",
        (group) =>
          group.get("/users", () => "users").get("/posts", () => "posts"),
      );

      const users = await app.fetch(
        new Request("http://localhost:8000/api/users"),
      );
      assertEquals(await users.text(), "users");

      const posts = await app.fetch(
        new Request("http://localhost:8000/api/posts"),
      );
      assertEquals(await posts.text(), "posts");
    });

    it("should scope decorators to group", async () => {
      const app = new Kage()
        .decorate("global", "global")
        .group("/api", (group) =>
          group
            .decorate("scoped", "scoped")
            .get(
              "/test",
              (c) => c.json({ global: c.global, scoped: c.scoped }),
            ))
        .get("/", (c) => c.json({ global: c.global }));

      const apiRes = await app.fetch(
        new Request("http://localhost:8000/api/test"),
      );
      assertEquals(await apiRes.json(), { global: "global", scoped: "scoped" });
    });

    it("should scope derives to group", async () => {
      const app = new Kage().group("/api", (group) =>
        group
          .derive(() => ({ apiVersion: "v1" }))
          .get("/info", (c) => c.json({ version: c.apiVersion })));

      const response = await app.fetch(
        new Request("http://localhost:8000/api/info"),
      );
      assertEquals(await response.json(), { version: "v1" });
    });
  });

  describe("fetch method", () => {
    it("should work as Request handler", async () => {
      const app = new Kage().get("/", () => "Hello");

      const response = await app.fetch(new Request("http://localhost:8000/"));
      assertEquals(await response.text(), "Hello");
    });

    it("should handle all HTTP methods", async () => {
      const app = new Kage()
        .get("/test", () => "GET")
        .post("/test", () => "POST")
        .put("/test", () => "PUT")
        .patch("/test", () => "PATCH")
        .delete("/test", () => "DELETE");

      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const response = await app.fetch(
          new Request("http://localhost:8000/test", { method }),
        );
        assertEquals(await response.text(), method);
      }
    });
  });
});
