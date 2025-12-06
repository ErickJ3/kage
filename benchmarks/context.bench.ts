import { Context } from "../packages/core/src/context/context.ts";

const baseRequest = new Request(
  "http://localhost:8000/users/123?foo=bar&baz=qux",
);
const params = { id: "123" };

Deno.bench("context - create new", () => {
  new Context(baseRequest, params, null, "/users/123");
});

Deno.bench("context - create with URL", () => {
  const url = new URL(baseRequest.url);
  new Context(baseRequest, params, url, url.pathname);
});

const existingContext = new Context(baseRequest, params, null, "/users/123");

Deno.bench("context - reset existing", () => {
  existingContext.reset(baseRequest, params, null, "/users/123");
});

Deno.bench("context - access method", () => {
  existingContext.method;
});

Deno.bench("context - access headers", () => {
  existingContext.headers;
});

Deno.bench("context - access path", () => {
  existingContext.path;
});

Deno.bench("context - access url (lazy)", () => {
  const ctx = new Context(baseRequest, params, null, "/users/123");
  ctx.url;
});

Deno.bench("context - access query", () => {
  existingContext.query;
});

Deno.bench("context - access state (lazy init)", () => {
  const ctx = new Context(baseRequest, params, null, "/users/123");
  ctx.state;
});

Deno.bench("context - json response", () => {
  existingContext.json({ message: "hello", count: 42 });
});

Deno.bench("context - json response with status", () => {
  existingContext.json({ error: "not found" }, 404);
});

Deno.bench("context - text response", () => {
  existingContext.text("Hello World");
});

Deno.bench("context - text response with status", () => {
  existingContext.text("Not Found", 404);
});

Deno.bench("context - html response", () => {
  existingContext.html("<h1>Hello</h1>");
});

Deno.bench("context - redirect response", () => {
  existingContext.redirect("/new-location");
});

Deno.bench("context - noContent response", () => {
  existingContext.noContent();
});

Deno.bench("context - notFound response", () => {
  existingContext.notFound();
});

Deno.bench("context - badRequest response", () => {
  existingContext.badRequest();
});

Deno.bench("context - unauthorized response", () => {
  existingContext.unauthorized();
});

Deno.bench("context - binary response", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  existingContext.binary(data);
});

const largeJson = {
  users: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
  })),
};

Deno.bench("context - json large object", () => {
  existingContext.json(largeJson);
});

const smallJson = { id: 1, name: "test" };

Deno.bench("context - json small object", () => {
  existingContext.json(smallJson);
});

Deno.bench("context - response raw", () => {
  existingContext.response("hello", { status: 200 });
});
