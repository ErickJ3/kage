/**
 * Tests for middleware system.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Context } from "./context.ts";
import {
  compose,
  cors,
  errorHandler,
  logger,
  type Middleware,
} from "./middleware.ts";

describe("compose", () => {
  it("should compose empty middleware array", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const composed = compose([]);
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await composed(ctx, handler);

    assertEquals(res.status, 200);
  });

  it("should execute middleware in order", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);
    const order: number[] = [];

    const mw1: Middleware = async (_ctx, next) => {
      order.push(1);
      const res = await next();
      order.push(4);
      return res;
    };

    const mw2: Middleware = async (_ctx, next) => {
      order.push(2);
      const res = await next();
      order.push(3);
      return res;
    };

    const composed = compose([mw1, mw2]);
    const handler = () => Promise.resolve(new Response("OK"));

    await composed(ctx, handler);

    assertEquals(order, [1, 2, 3, 4]);
  });

  it("should allow middleware to modify context", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw: Middleware = async (ctx, next) => {
      ctx.state.value = 42;
      return await next();
    };

    const composed = compose([mw]);
    const handler = () => {
      assertEquals(ctx.state.value, 42);
      return Promise.resolve(new Response("OK"));
    };

    await composed(ctx, handler);
  });

  it("should allow middleware to short-circuit", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);
    let handlerCalled = false;

    const mw: Middleware = () => {
      return Promise.resolve(new Response("Short-circuit", { status: 403 }));
    };

    const composed = compose([mw]);
    const handler = () => {
      handlerCalled = true;
      return Promise.resolve(new Response("OK"));
    };

    const res = await composed(ctx, handler);

    assertEquals(res.status, 403);
    assertEquals(handlerCalled, false);
  });

  it("should throw if middleware array is invalid", () => {
    let error: Error | null = null;
    try {
      compose("invalid" as any);
    } catch (e) {
      error = e as Error;
    }
    assertEquals(error instanceof TypeError, true);
  });

  it("should throw if middleware item is not function", () => {
    let error: Error | null = null;
    try {
      compose([null as any]);
    } catch (e) {
      error = e as Error;
    }
    assertEquals(error instanceof TypeError, true);
  });

  it("should reject if next() called multiple times", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw: Middleware = async (_ctx, next) => {
      await next();
      await next(); // Second call should fail
      return new Response("OK");
    };

    const composed = compose([mw]);
    const handler = () => Promise.resolve(new Response("OK"));

    await assertRejects(
      async () => await composed(ctx, handler),
      Error,
      "next() called multiple times",
    );
  });

  it("should pass context through all middleware", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw1: Middleware = async (ctx, next) => {
      ctx.state.a = 1;
      return await next();
    };

    const mw2: Middleware = async (ctx, next) => {
      ctx.state.b = 2;
      return await next();
    };

    const composed = compose([mw1, mw2]);
    const handler = () => {
      assertEquals(ctx.state.a, 1);
      assertEquals(ctx.state.b, 2);
      return Promise.resolve(new Response("OK"));
    };

    await composed(ctx, handler);
  });
});

describe("errorHandler", () => {
  it("should catch errors from downstream", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = errorHandler();
    const handler = () => {
      throw new Error("Test error");
    };

    const res = await mw(ctx, handler);

    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "Internal Server Error");
    assertEquals(body.message, "Test error");
  });

  it("should use custom error handler if provided", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = errorHandler((error, ctx) => {
      return ctx.json({ custom: error.message }, 418);
    });

    const handler = () => {
      throw new Error("Custom error");
    };

    const res = await mw(ctx, handler);

    assertEquals(res.status, 418);
    const body = await res.json();
    assertEquals(body.custom, "Custom error");
  });

  it("should pass through successful responses", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = errorHandler();
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(res.status, 200);
    assertEquals(await res.text(), "OK");
  });
});

describe("logger", () => {
  it("should call next and return response", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = logger();
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(res.status, 200);
  });

  it("should work with error responses", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = logger();
    const handler = () =>
      Promise.resolve(new Response("Error", { status: 500 }));

    const res = await mw(ctx, handler);

    assertEquals(res.status, 500);
  });
});

describe("cors", () => {
  it("should handle preflight OPTIONS request", async () => {
    const req = new Request("http://localhost:8000/test", {
      method: "OPTIONS",
    });
    const ctx = new Context(req);

    const mw = cors();
    const handler = () => Promise.resolve(new Response("Should not be called"));

    const res = await mw(ctx, handler);

    assertEquals(res.status, 204);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(
      res.headers.get("Access-Control-Allow-Methods"),
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
  });

  it("should add CORS headers to normal requests", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = cors();
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  it("should use custom origin", async () => {
    const req = new Request("http://localhost:8000/test");
    const ctx = new Context(req);

    const mw = cors({ origin: "https://example.com" });
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      "https://example.com",
    );
  });

  it("should add credentials header when enabled", async () => {
    const req = new Request("http://localhost:8000/test", {
      method: "OPTIONS",
    });
    const ctx = new Context(req);

    const mw = cors({ credentials: true });
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(res.headers.get("Access-Control-Allow-Credentials"), "true");
  });

  it("should use custom methods", async () => {
    const req = new Request("http://localhost:8000/test", {
      method: "OPTIONS",
    });
    const ctx = new Context(req);

    const mw = cors({ methods: ["GET", "POST"] });
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, POST");
  });

  it("should use custom headers", async () => {
    const req = new Request("http://localhost:8000/test", {
      method: "OPTIONS",
    });
    const ctx = new Context(req);

    const mw = cors({ headers: ["X-Custom-Header"] });
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(
      res.headers.get("Access-Control-Allow-Headers"),
      "X-Custom-Header",
    );
  });

  it("should set max age", async () => {
    const req = new Request("http://localhost:8000/test", {
      method: "OPTIONS",
    });
    const ctx = new Context(req);

    const mw = cors({ maxAge: 3600 });
    const handler = () => Promise.resolve(new Response("OK"));

    const res = await mw(ctx, handler);

    assertEquals(res.headers.get("Access-Control-Max-Age"), "3600");
  });
});
