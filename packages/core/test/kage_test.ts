/**
 * Tests for Kage application class.
 */

import { assertEquals, assertExists } from "@std/assert";
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
        development: true,
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

      assertEquals(
        response.headers.get("Content-Type"),
        "application/json; charset=utf-8",
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

      app.use(async (_ctx, next) => {
        order.push(1);
        const response = await next();
        order.push(3);
        return response;
      });

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

      app.use(async (_ctx, next) => {
        const response = await next();
        const newHeaders = new Headers(response.headers);
        newHeaders.set("X-Middleware", "applied");
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      });

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
});
