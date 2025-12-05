import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Context } from "../src/context/mod.ts";

describe("Context", () => {
  describe("constructor and reset", () => {
    it("should create context with request", () => {
      const request = new Request("http://localhost:8000/users/123");
      const ctx = new Context(request);

      assertEquals(ctx.method, "GET");
      assertEquals(ctx.path, "/users/123");
      assertExists(ctx.request);
    });

    it("should create context with params", () => {
      const request = new Request("http://localhost:8000/users/123");
      const ctx = new Context(request, { id: "123" });

      assertEquals(ctx.params.id, "123");
    });

    it("should reset context for reuse", () => {
      const ctx = new Context();
      const request1 = new Request("http://localhost:8000/first");
      ctx.reset(request1, { a: "1" });

      assertEquals(ctx.path, "/first");
      assertEquals(ctx.params.a, "1");

      const request2 = new Request("http://localhost:8000/second");
      ctx.reset(request2, { b: "2" });

      assertEquals(ctx.path, "/second");
      assertEquals(ctx.params.b, "2");
    });

    it("should handle URL with query string", () => {
      const request = new Request(
        "http://localhost:8000/search?q=deno&limit=10",
      );
      const ctx = new Context(request);

      assertEquals(ctx.path, "/search");
      assertEquals(ctx.query.get("q"), "deno");
      assertEquals(ctx.query.get("limit"), "10");
    });

    it("should handle URL with hash", () => {
      const request = new Request("http://localhost:8000/page#section");
      const ctx = new Context(request);

      assertEquals(ctx.path, "/page");
    });
  });

  describe("state management", () => {
    it("should initialize state lazily", () => {
      const request = new Request("http://localhost:8000/");
      const ctx = new Context(request);

      ctx.state.user = { id: 1 };
      assertEquals(ctx.state.user, { id: 1 });
    });

    it("should reset state on context reset", () => {
      const ctx = new Context();
      const request1 = new Request("http://localhost:8000/");
      ctx.reset(request1);
      ctx.state.user = { id: 1 };

      const request2 = new Request("http://localhost:8000/");
      ctx.reset(request2);

      assertEquals(ctx.state.user, undefined);
    });

    it("should allow setting entire state object", () => {
      const request = new Request("http://localhost:8000/");
      const ctx = new Context(request);

      ctx.state = { custom: "value" };
      assertEquals(ctx.state.custom, "value");
    });
  });

  describe("request properties", () => {
    it("should expose method", () => {
      const request = new Request("http://localhost:8000/", { method: "POST" });
      const ctx = new Context(request);

      assertEquals(ctx.method, "POST");
    });

    it("should expose headers", () => {
      const request = new Request("http://localhost:8000/", {
        headers: { "X-Custom": "value" },
      });
      const ctx = new Context(request);

      assertEquals(ctx.headers.get("X-Custom"), "value");
    });

    it("should expose URL object", () => {
      const request = new Request("http://localhost:8000/path?foo=bar");
      const ctx = new Context(request);

      assertEquals(ctx.url.pathname, "/path");
      assertEquals(ctx.url.searchParams.get("foo"), "bar");
    });
  });

  describe("body parsing", () => {
    it("should parse JSON body", async () => {
      const request = new Request("http://localhost:8000/", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = new Context(request);

      const body = await ctx.bodyJson<{ name: string }>();
      assertEquals(body.name, "test");
    });

    it("should parse text body", async () => {
      const request = new Request("http://localhost:8000/", {
        method: "POST",
        body: "Hello, World!",
      });
      const ctx = new Context(request);

      const body = await ctx.bodyText();
      assertEquals(body, "Hello, World!");
    });

    it("should parse form data", async () => {
      const formData = new FormData();
      formData.append("name", "test");

      const request = new Request("http://localhost:8000/", {
        method: "POST",
        body: formData,
      });
      const ctx = new Context(request);

      const body = await ctx.bodyFormData();
      assertEquals(body.get("name"), "test");
    });

    it("should get body as ArrayBuffer", async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const request = new Request("http://localhost:8000/", {
        method: "POST",
        body: data,
      });
      const ctx = new Context(request);

      const buffer = await ctx.bodyArrayBuffer();
      assertEquals(new Uint8Array(buffer), data);
    });

    it("should get body as Blob", async () => {
      const request = new Request("http://localhost:8000/", {
        method: "POST",
        body: "blob content",
      });
      const ctx = new Context(request);

      const blob = await ctx.bodyBlob();
      assertEquals(await blob.text(), "blob content");
    });
  });

  describe("response helpers", () => {
    it("should create JSON response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.json({ message: "hello" });

      assertEquals(response.status, 200);
      assertEquals(
        response.headers.get("Content-Type"),
        "application/json; charset=utf-8",
      );
      assertEquals(await response.json(), { message: "hello" });
    });

    it("should create JSON response with custom status", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.json({ created: true }, 201);

      assertEquals(response.status, 201);
    });

    it("should create text response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.text("Hello");

      assertEquals(response.status, 200);
      assertEquals(
        response.headers.get("Content-Type"),
        "text/plain; charset=utf-8",
      );
      assertEquals(await response.text(), "Hello");
    });

    it("should create text response with custom status", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.text("Created", 201);

      assertEquals(response.status, 201);
    });

    it("should create HTML response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.html("<h1>Hello</h1>");

      assertEquals(response.status, 200);
      assertEquals(
        response.headers.get("Content-Type"),
        "text/html; charset=utf-8",
      );
      assertEquals(await response.text(), "<h1>Hello</h1>");
    });

    it("should create HTML response with custom status", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.html("<h1>Error</h1>", 500);

      assertEquals(response.status, 500);
    });

    it("should create redirect response", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.redirect("/new-location");

      assertEquals(response.status, 302);
      assertEquals(response.headers.get("Location"), "/new-location");
    });

    it("should create permanent redirect", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.redirect("/new-location", 301);

      assertEquals(response.status, 301);
    });

    it("should create no content response", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.noContent();

      assertEquals(response.status, 204);
    });

    it("should create not found response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.notFound();

      assertEquals(response.status, 404);
      assertEquals(await response.json(), { error: "Not Found" });
    });

    it("should create not found with custom message", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.notFound("User not found");

      assertEquals(await response.json(), { error: "User not found" });
    });

    it("should create bad request response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.badRequest();

      assertEquals(response.status, 400);
      assertEquals(await response.json(), { error: "Bad Request" });
    });

    it("should create unauthorized response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.unauthorized();

      assertEquals(response.status, 401);
      assertEquals(await response.json(), { error: "Unauthorized" });
    });

    it("should create forbidden response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.forbidden();

      assertEquals(response.status, 403);
      assertEquals(await response.json(), { error: "Forbidden" });
    });

    it("should create internal error response", async () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.internalError();

      assertEquals(response.status, 500);
      assertEquals(await response.json(), { error: "Internal Server Error" });
    });

    it("should create binary response", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const data = new Uint8Array([1, 2, 3]);
      const response = ctx.binary(data);

      assertEquals(response.status, 200);
      assertEquals(
        response.headers.get("Content-Type"),
        "application/octet-stream",
      );
    });

    it("should create binary response with custom content type", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const data = new Uint8Array([1, 2, 3]);
      const response = ctx.binary(data, "image/png", 201);

      assertEquals(response.status, 201);
      assertEquals(response.headers.get("Content-Type"), "image/png");
    });

    it("should create stream response", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("chunk"));
          controller.close();
        },
      });
      const response = ctx.stream(stream);

      assertEquals(response.status, 200);
      assertEquals(
        response.headers.get("Content-Type"),
        "application/octet-stream",
      );
    });

    it("should create stream response with custom content type", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const stream = new ReadableStream();
      const response = ctx.stream(stream, "text/event-stream", 200);

      assertEquals(response.headers.get("Content-Type"), "text/event-stream");
    });

    it("should create generic response", () => {
      const ctx = new Context(new Request("http://localhost:8000/"));
      const response = ctx.response("body", { status: 201 });

      assertEquals(response.status, 201);
    });
  });
});
