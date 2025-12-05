/**
 * Tests for Context class.
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Context } from "./context.ts";

describe("Context", () => {
  describe("Construction", () => {
    it("should create context from request", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      assertEquals(ctx.request, req);
      assertEquals(ctx.url.pathname, "/test");
      assertEquals(ctx.params, {});
      assertEquals(ctx.state, {});
    });

    it("should accept params in constructor", () => {
      const req = new Request("http://localhost:8000/users/123");
      const ctx = new Context(req, { id: "123" });

      assertEquals(ctx.params, { id: "123" });
    });

    it("should initialize empty state", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      assertEquals(ctx.state, {});
    });
  });

  describe("Properties", () => {
    it("should expose method", () => {
      const req = new Request("http://localhost:8000/test", { method: "POST" });
      const ctx = new Context(req);

      assertEquals(ctx.method, "POST");
    });

    it("should expose headers", () => {
      const req = new Request("http://localhost:8000/test", {
        headers: { "Content-Type": "application/json" },
      });
      const ctx = new Context(req);

      assertEquals(ctx.headers.get("Content-Type"), "application/json");
    });

    it("should expose query params", () => {
      const req = new Request("http://localhost:8000/search?q=deno&limit=10");
      const ctx = new Context(req);

      assertEquals(ctx.query.get("q"), "deno");
      assertEquals(ctx.query.get("limit"), "10");
    });

    it("should expose pathname", () => {
      const req = new Request("http://localhost:8000/users/123?foo=bar");
      const ctx = new Context(req);

      assertEquals(ctx.path, "/users/123");
    });
  });

  describe("State Management", () => {
    it("should allow setting state", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      ctx.state.user = { id: 123 };

      assertEquals(ctx.state.user, { id: 123 });
    });

    it("should allow multiple state properties", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      ctx.state.user = { id: 123 };
      ctx.state.session = { token: "abc" };

      assertEquals(ctx.state.user, { id: 123 });
      assertEquals(ctx.state.session, { token: "abc" });
    });
  });

  describe("Response Helpers", () => {
    it("should create JSON response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.json({ message: "test" });

      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get("Content-Type"),
        "application/json; charset=utf-8",
      );
    });

    it("should create JSON response with custom status", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.json({ error: "not found" }, 404);

      assertEquals(res.status, 404);
    });

    it("should create text response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.text("Hello World");

      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get("Content-Type"),
        "text/plain; charset=utf-8",
      );
    });

    it("should create HTML response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.html("<h1>Hello</h1>");

      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get("Content-Type"),
        "text/html; charset=utf-8",
      );
    });

    it("should create redirect response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.redirect("/new-location");

      assertEquals(res.status, 302);
      assertEquals(res.headers.get("Location"), "/new-location");
    });

    it("should create redirect with custom status", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.redirect("/permanent", 301);

      assertEquals(res.status, 301);
    });

    it("should create no content response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.noContent();

      assertEquals(res.status, 204);
    });
  });

  describe("Error Response Helpers", () => {
    it("should create not found response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.notFound();

      assertEquals(res.status, 404);
    });

    it("should create not found with custom message", async () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.notFound("Resource not found");
      const body = await res.json();

      assertEquals(res.status, 404);
      assertEquals(body, { error: "Resource not found" });
    });

    it("should create bad request response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.badRequest();

      assertEquals(res.status, 400);
    });

    it("should create unauthorized response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.unauthorized();

      assertEquals(res.status, 401);
    });

    it("should create forbidden response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.forbidden();

      assertEquals(res.status, 403);
    });

    it("should create internal error response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.internalError();

      assertEquals(res.status, 500);
    });
  });

  describe("Body Parsing", () => {
    it("should parse JSON body", async () => {
      const req = new Request("http://localhost:8000/test", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = new Context(req);

      const body = await ctx.bodyJson();

      assertEquals(body, { name: "test" });
    });

    it("should parse text body", async () => {
      const req = new Request("http://localhost:8000/test", {
        method: "POST",
        body: "plain text",
      });
      const ctx = new Context(req);

      const text = await ctx.bodyText();

      assertEquals(text, "plain text");
    });

    it("should parse form data", async () => {
      const formData = new FormData();
      formData.append("key", "value");

      const req = new Request("http://localhost:8000/test", {
        method: "POST",
        body: formData,
      });
      const ctx = new Context(req);

      const data = await ctx.bodyFormData();

      assertEquals(data.get("key"), "value");
    });
  });

  describe("Generic Response", () => {
    it("should create generic response", () => {
      const req = new Request("http://localhost:8000/test");
      const ctx = new Context(req);

      const res = ctx.response("test body", { status: 201 });

      assertEquals(res.status, 201);
      assertExists(res.body);
    });
  });
});
