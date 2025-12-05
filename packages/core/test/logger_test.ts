/**
 * Tests for logger middleware.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { logger } from "../src/middleware/mod.ts";
import { Context } from "../src/context/mod.ts";

describe("logger middleware", () => {
  it("should log request method and path", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const middleware = logger();
      const ctx = new Context(new Request("http://localhost:8000/users"));

      await middleware(ctx, () => Promise.resolve(new Response("OK")));

      assertEquals(logs.length, 1);
      assertStringIncludes(logs[0], "GET");
      assertStringIncludes(logs[0], "/users");
      assertStringIncludes(logs[0], "ms");
    } finally {
      console.log = originalLog;
    }
  });

  it("should log POST requests", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const middleware = logger();
      const ctx = new Context(
        new Request("http://localhost:8000/api/data", { method: "POST" }),
      );

      await middleware(
        ctx,
        () => Promise.resolve(new Response("Created", { status: 201 })),
      );

      assertEquals(logs.length, 1);
      assertStringIncludes(logs[0], "POST");
      assertStringIncludes(logs[0], "/api/data");
    } finally {
      console.log = originalLog;
    }
  });

  it("should pass through response unchanged", async () => {
    const originalLog = console.log;
    console.log = () => {};

    try {
      const middleware = logger();
      const ctx = new Context(new Request("http://localhost:8000/"));

      const response = await middleware(
        ctx,
        () =>
          Promise.resolve(
            new Response("Test Body", {
              status: 201,
              headers: { "X-Custom": "value" },
            }),
          ),
      );

      assertEquals(response.status, 201);
      assertEquals(response.headers.get("X-Custom"), "value");
      assertEquals(await response.text(), "Test Body");
    } finally {
      console.log = originalLog;
    }
  });

  it("should measure duration", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const middleware = logger();
      const ctx = new Context(new Request("http://localhost:8000/slow"));

      await middleware(ctx, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response("OK");
      });

      const match = logs[0].match(/(\d+)ms/);
      const duration = match ? parseInt(match[1], 10) : 0;
      assertEquals(duration >= 10, true);
    } finally {
      console.log = originalLog;
    }
  });
});
