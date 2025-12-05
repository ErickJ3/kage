/**
 * Tests for the route builder and typed routing system.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { z } from "zod";
import { createRoute, route, wrapTypedHandler } from "./route_builder.ts";
import { Context } from "./context.ts";

describe("createRoute", () => {
  it("should create a route definition with path", () => {
    const routeDef = createRoute({
      path: "/users/:id",
      handler: (ctx) => ctx.json({ id: ctx.params.id }),
    });

    assertEquals(routeDef.path, "/users/:id");
    assertEquals(typeof routeDef.handler, "function");
    assertEquals(routeDef.schemas, {});
  });

  it("should create a route definition with schemas", () => {
    const routeDef = createRoute({
      path: "/users/:id",
      schema: {
        params: z.object({ id: z.string().uuid() }),
        query: z.object({ include: z.string().optional() }),
      },
      handler: (ctx) => {
        return ctx.json({
          id: ctx.params.id,
          include: ctx.validatedQuery.include,
        });
      },
    });

    assertEquals(routeDef.path, "/users/:id");
    assertEquals(typeof routeDef.handler, "function");
    assertEquals(typeof routeDef.schemas.params, "object");
    assertEquals(typeof routeDef.schemas.query, "object");
  });

  it("should create a route definition with permissions", () => {
    const routeDef = createRoute({
      path: "/admin",
      permissions: ["net:api.example.com", "env:API_KEY"],
      handler: (ctx) => ctx.json({ admin: true }),
    });

    assertEquals(routeDef.permissions, ["net:api.example.com", "env:API_KEY"]);
  });

  it("should create a route definition with body schema", () => {
    const routeDef = createRoute({
      path: "/users",
      schema: {
        body: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      },
      handler: (ctx) => {
        return ctx.json({
          created: true,
          name: ctx.validatedBody.name,
        });
      },
    });

    assertEquals(typeof routeDef.schemas.body, "object");
  });
});

describe("RouteBuilder (fluent API)", () => {
  it("should build route with params schema", () => {
    const routeDef = route("/users/:id")
      .params(z.object({ id: z.string().uuid() }))
      .handler((ctx) => ctx.json({ id: ctx.params.id }));

    assertEquals(routeDef.path, "/users/:id");
    assertEquals(typeof routeDef.schemas.params, "object");
  });

  it("should build route with query schema", () => {
    const routeDef = route("/search")
      .query(z.object({ q: z.string(), page: z.coerce.number().optional() }))
      .handler((ctx) => {
        return ctx.json({
          query: ctx.validatedQuery.q,
          page: ctx.validatedQuery.page ?? 1,
        });
      });

    assertEquals(routeDef.path, "/search");
    assertEquals(typeof routeDef.schemas.query, "object");
  });

  it("should build route with body schema", () => {
    const routeDef = route("/users")
      .body(z.object({ name: z.string() }))
      .handler((ctx) => {
        return ctx.json({ name: ctx.validatedBody.name });
      });

    assertEquals(typeof routeDef.schemas.body, "object");
  });

  it("should build route with response schema", () => {
    const routeDef = route("/users/:id")
      .response(z.object({ id: z.string(), name: z.string() }))
      .handler((ctx) => ({ id: ctx.params.id, name: "John" }));

    assertEquals(typeof routeDef.schemas.response, "object");
  });

  it("should build route with all schemas", () => {
    const routeDef = route("/users/:id")
      .params(z.object({ id: z.string().uuid() }))
      .query(z.object({ include: z.string().optional() }))
      .body(z.object({ name: z.string() }))
      .response(z.object({ id: z.string(), name: z.string() }))
      .handler((ctx) => ({
        id: ctx.params.id,
        name: ctx.validatedBody.name,
      }));

    assertEquals(routeDef.path, "/users/:id");
    assertEquals(typeof routeDef.schemas.params, "object");
    assertEquals(typeof routeDef.schemas.query, "object");
    assertEquals(typeof routeDef.schemas.body, "object");
    assertEquals(typeof routeDef.schemas.response, "object");
  });

  it("should build route with permissions", () => {
    const routeDef = route("/admin")
      .permissions(["net:api.example.com"])
      .handler((ctx) => ctx.json({ admin: true }));

    assertEquals(routeDef.permissions, ["net:api.example.com"]);
  });
});

describe("wrapTypedHandler", () => {
  it("should validate query parameters", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ q: ctx.validatedQuery.q }),
      { query: z.object({ q: z.string() }) },
    );

    const req = new Request("http://localhost/search?q=hello");
    const ctx = new Context(req);

    const response = await handler(ctx);
    assertEquals(response instanceof Response, true);

    const data = await (response as Response).json();
    assertEquals(data.q, "hello");
  });

  it("should return 400 for invalid query parameters", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ q: ctx.validatedQuery.q }),
      { query: z.object({ q: z.string().min(3) }) },
    );

    const req = new Request("http://localhost/search?q=ab");
    const ctx = new Context(req);

    const response = (await handler(ctx)) as Response;
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Validation Error");
  });

  it("should validate body", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ name: (ctx.validatedBody as { name: string }).name }),
      { body: z.object({ name: z.string() }) },
    );

    const req = new Request("http://localhost/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "John" }),
    });
    const ctx = new Context(req);

    const response = await handler(ctx);
    assertEquals(response instanceof Response, true);

    const data = await (response as Response).json();
    assertEquals(data.name, "John");
  });

  it("should return 400 for invalid body", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ name: (ctx.validatedBody as { name: string }).name }),
      { body: z.object({ name: z.string(), email: z.string().email() }) },
    );

    const req = new Request("http://localhost/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "John", email: "invalid" }),
    });
    const ctx = new Context(req);

    const response = (await handler(ctx)) as Response;
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Validation Error");
    assertEquals(data.details[0].field, "body.email");
  });

  it("should return 400 for invalid JSON body", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ name: (ctx.validatedBody as { name: string }).name }),
      { body: z.object({ name: z.string() }) },
    );

    const req = new Request("http://localhost/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const ctx = new Context(req);

    const response = (await handler(ctx)) as Response;
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Invalid JSON body");
  });

  it("should validate params", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ id: ctx.params.id }),
      { params: z.object({ id: z.string().uuid() }) },
    );

    const req = new Request("http://localhost/users/123e4567-e89b-12d3-a456-426614174000");
    const ctx = new Context(req, { id: "123e4567-e89b-12d3-a456-426614174000" });

    const response = await handler(ctx);
    assertEquals(response instanceof Response, true);

    const data = await (response as Response).json();
    assertEquals(data.id, "123e4567-e89b-12d3-a456-426614174000");
  });

  it("should return 400 for invalid params", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ id: ctx.params.id }),
      { params: z.object({ id: z.string().uuid() }) },
    );

    const req = new Request("http://localhost/users/not-a-uuid");
    const ctx = new Context(req, { id: "not-a-uuid" });

    const response = (await handler(ctx)) as Response;
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Validation Error");
  });

  it("should pass through without schemas", async () => {
    const handler = wrapTypedHandler(
      (ctx) => ctx.json({ path: ctx.path }),
      {},
    );

    const req = new Request("http://localhost/test");
    const ctx = new Context(req);

    const response = await handler(ctx);
    assertEquals(response instanceof Response, true);

    const data = await (response as Response).json();
    assertEquals(data.path, "/test");
  });
});
