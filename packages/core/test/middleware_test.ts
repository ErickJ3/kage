/**
 * Tests for middleware utilities.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { compose } from "../src/middleware/mod.ts";
import { Context } from "../src/context/mod.ts";
import type { Middleware } from "../src/middleware/mod.ts";

describe("compose", () => {
  it("should compose middleware in order", async () => {
    const order: number[] = [];

    const mw1: Middleware = async (_ctx, next) => {
      order.push(1);
      const response = await next();
      order.push(4);
      return response;
    };

    const mw2: Middleware = async (_ctx, next) => {
      order.push(2);
      const response = await next();
      order.push(3);
      return response;
    };

    const composed = compose([mw1, mw2]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    await composed(ctx, () => Promise.resolve(new Response("OK")));

    assertEquals(order, [1, 2, 3, 4]);
  });

  it("should pass context through middleware chain", async () => {
    const mw1: Middleware = async (ctx, next) => {
      ctx.state.value = 1;
      return await next();
    };

    const mw2: Middleware = async (ctx, next) => {
      ctx.state.value = (ctx.state.value as number) + 1;
      return await next();
    };

    const composed = compose([mw1, mw2]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    await composed(ctx, () => {
      assertEquals(ctx.state.value, 2);
      return Promise.resolve(new Response("OK"));
    });
  });

  it("should allow middleware to return early", async () => {
    const order: number[] = [];

    const mw1: Middleware = async (_ctx, next) => {
      order.push(1);
      const response = await next();
      order.push(4);
      return response;
    };

    const mw2: Middleware = () => {
      order.push(2);
      return Promise.resolve(new Response("Early return"));
    };

    const mw3: Middleware = async (_ctx, next) => {
      order.push(3);
      return await next();
    };

    const composed = compose([mw1, mw2, mw3]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    const response = await composed(
      ctx,
      () => Promise.resolve(new Response("Final")),
    );

    assertEquals(order, [1, 2, 4]);
    assertEquals(await response.text(), "Early return");
  });

  it("should handle empty middleware array", async () => {
    const composed = compose([]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    const response = await composed(
      ctx,
      () => Promise.resolve(new Response("Handler")),
    );

    assertEquals(await response.text(), "Handler");
  });

  it("should throw on non-array input", () => {
    // @ts-expect-error Testing invalid input
    const fn = () => compose("not an array");
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
      assertEquals((e as Error).message, "Middleware must be an array");
    }
    assertEquals(threw, true);
  });

  it("should throw on non-function middleware", () => {
    // @ts-expect-error Testing invalid input
    const fn = () => compose([() => {}, "not a function"]);
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
      assertEquals(
        (e as Error).message,
        "Middleware must be composed of functions",
      );
    }
    assertEquals(threw, true);
  });

  it("should reject when next() called multiple times", async () => {
    const mw: Middleware = async (_ctx, next) => {
      await next();
      return await next();
    };
    const passThrough: Middleware = (_ctx, next) => next();

    const composed = compose([mw, passThrough, passThrough, passThrough]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    await assertRejects(
      () => composed(ctx, () => Promise.resolve(new Response("OK"))),
      Error,
      "next() called multiple times",
    );
  });

  it("should propagate errors from middleware", async () => {
    const mw: Middleware = () => {
      throw new Error("Middleware error");
    };
    const passThrough: Middleware = (_ctx, next) => next();

    const composed = compose([mw, passThrough, passThrough, passThrough]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    await assertRejects(
      () => composed(ctx, () => Promise.resolve(new Response("OK"))),
      Error,
      "Middleware error",
    );
  });

  it("should propagate errors from handler", async () => {
    const passThrough: Middleware = (_ctx, next) => next();
    const composed = compose([
      passThrough,
      passThrough,
      passThrough,
      passThrough,
    ]);
    const ctx = new Context(new Request("http://localhost:8000/"));

    await assertRejects(
      () =>
        composed(ctx, () => {
          throw new Error("Handler error");
        }),
      Error,
      "Handler error",
    );
  });
});
