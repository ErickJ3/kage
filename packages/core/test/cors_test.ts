/**
 * Tests for CORS middleware.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { cors } from "../src/middleware/mod.ts";
import { Context } from "../src/context/mod.ts";

describe("cors middleware", () => {
  describe("preflight requests", () => {
    it("should handle OPTIONS request with defaults", async () => {
      const middleware = cors();
      const ctx = new Context(
        new Request("http://localhost:8000/api", { method: "OPTIONS" }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(response.status, 204);
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
      assertEquals(
        response.headers.get("Access-Control-Allow-Methods"),
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      assertEquals(
        response.headers.get("Access-Control-Allow-Headers"),
        "Content-Type, Authorization",
      );
      assertEquals(response.headers.get("Access-Control-Max-Age"), "86400");
    });

    it("should handle OPTIONS with custom origin", async () => {
      const middleware = cors({ origin: "https://example.com" });
      const ctx = new Context(
        new Request("http://localhost:8000/api", { method: "OPTIONS" }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(
        response.headers.get("Access-Control-Allow-Origin"),
        "https://example.com",
      );
    });

    it("should handle OPTIONS with custom methods", async () => {
      const middleware = cors({ methods: ["GET", "POST"] });
      const ctx = new Context(
        new Request("http://localhost:8000/api", { method: "OPTIONS" }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(
        response.headers.get("Access-Control-Allow-Methods"),
        "GET, POST",
      );
    });

    it("should handle OPTIONS with custom headers", async () => {
      const middleware = cors({
        headers: ["X-Custom-Header", "Authorization"],
      });
      const ctx = new Context(
        new Request("http://localhost:8000/api", { method: "OPTIONS" }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(
        response.headers.get("Access-Control-Allow-Headers"),
        "X-Custom-Header, Authorization",
      );
    });

    it("should handle OPTIONS with credentials", async () => {
      const middleware = cors({ credentials: true });
      const ctx = new Context(
        new Request("http://localhost:8000/api", { method: "OPTIONS" }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(
        response.headers.get("Access-Control-Allow-Credentials"),
        "true",
      );
    });

    it("should handle OPTIONS with custom maxAge", async () => {
      const middleware = cors({ maxAge: 3600 });
      const ctx = new Context(
        new Request("http://localhost:8000/api", { method: "OPTIONS" }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(response.headers.get("Access-Control-Max-Age"), "3600");
    });
  });

  describe("actual requests", () => {
    it("should add CORS headers to GET response", async () => {
      const middleware = cors();
      const ctx = new Context(new Request("http://localhost:8000/api"));

      const response = await middleware(
        ctx,
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ data: "test" }), {
              headers: { "Content-Type": "application/json" },
            }),
          ),
      );

      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
      assertEquals(response.headers.get("Content-Type"), "application/json");
    });

    it("should add CORS headers to POST response", async () => {
      const middleware = cors({ origin: "https://example.com" });
      const ctx = new Context(
        new Request("http://localhost:8000/api", {
          method: "POST",
          body: "{}",
        }),
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("Created", { status: 201 })),
      );

      assertEquals(response.status, 201);
      assertEquals(
        response.headers.get("Access-Control-Allow-Origin"),
        "https://example.com",
      );
    });

    it("should add credentials header when enabled", async () => {
      const middleware = cors({ credentials: true });
      const ctx = new Context(new Request("http://localhost:8000/api"));

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(
        response.headers.get("Access-Control-Allow-Credentials"),
        "true",
      );
    });

    it("should not add credentials header when disabled", async () => {
      const middleware = cors({ credentials: false });
      const ctx = new Context(new Request("http://localhost:8000/api"));

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(
        response.headers.get("Access-Control-Allow-Credentials"),
        null,
      );
    });

    it("should preserve existing response headers", async () => {
      const middleware = cors();
      const ctx = new Context(new Request("http://localhost:8000/api"));

      const response = await middleware(
        ctx,
        () =>
          Promise.resolve(
            new Response("OK", {
              headers: {
                "X-Custom": "value",
                "Content-Type": "text/plain",
              },
            }),
          ),
      );

      assertEquals(response.headers.get("X-Custom"), "value");
      assertEquals(response.headers.get("Content-Type"), "text/plain");
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
    });

    it("should preserve response status", async () => {
      const middleware = cors();
      const ctx = new Context(new Request("http://localhost:8000/api"));

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("Not Found", { status: 404 })),
      );

      assertEquals(response.status, 404);
    });
  });
});
