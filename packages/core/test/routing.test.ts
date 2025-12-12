import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";
import { Kage } from "~/app/kage.ts";
import { createRoute, route, RouteBuilder } from "~/routing/builder.ts";

describe("routing/builder", () => {
  describe("createRoute()", () => {
    it("should create route definition with path and handler", () => {
      const routeDef = createRoute({
        path: "/users",
        handler: (ctx) => ctx.json({ users: [] }),
      });

      assertEquals(routeDef.path, "/users");
      assertExists(routeDef.handler);
      assertEquals(routeDef.schemas, {});
    });

    it("should create route with schemas", () => {
      const routeDef = createRoute({
        path: "/users/:id",
        schema: {
          params: z.object({ id: z.string() }),
          query: z.object({ include: z.string().optional() }),
        },
        handler: (ctx) => ctx.json({ id: ctx.params.id }),
      });

      assertEquals(routeDef.path, "/users/:id");
      assertExists(routeDef.schemas.params);
      assertExists(routeDef.schemas.query);
    });

    it("should create route with body schema", () => {
      const routeDef = createRoute({
        path: "/users",
        schema: {
          body: z.object({
            name: z.string(),
            email: z.string(),
          }),
        },
        handler: (ctx) => ctx.json({ created: true }),
      });

      assertExists(routeDef.schemas.body);
    });

    it("should create route with response schema", () => {
      const routeDef = createRoute({
        path: "/users",
        schema: {
          response: z.object({
            id: z.number(),
            name: z.string(),
          }),
        },
        handler: () => ({ id: 1, name: "test" }),
      });

      assertExists(routeDef.schemas.response);
    });
  });

  describe("route() builder", () => {
    it("should create RouteBuilder instance", () => {
      const builder = route("/users");
      assertEquals(builder instanceof RouteBuilder, true);
    });

    it("should chain params schema", () => {
      const routeDef = route("/users/:id")
        .params(z.object({ id: z.string() }))
        .handler((ctx) => ctx.json({ id: ctx.params.id }));

      assertEquals(routeDef.path, "/users/:id");
      assertExists(routeDef.schemas.params);
    });

    it("should chain query schema", () => {
      const routeDef = route("/users")
        .query(z.object({ page: z.number(), limit: z.number() }))
        .handler((ctx) => ctx.json({ query: ctx.query }));

      assertExists(routeDef.schemas.query);
    });

    it("should chain body schema", () => {
      const routeDef = route("/users")
        .body(z.object({ name: z.string() }))
        .handler((ctx) => ctx.json({ body: ctx.body }));

      assertExists(routeDef.schemas.body);
    });

    it("should chain response schema", () => {
      const routeDef = route("/users")
        .response(z.object({ success: z.boolean() }))
        .handler(() => ({ success: true }));

      assertExists(routeDef.schemas.response);
    });

    it("should chain all schemas", () => {
      const routeDef = route("/users/:id")
        .params(z.object({ id: z.string() }))
        .query(z.object({ include: z.string().optional() }))
        .body(z.object({ name: z.string() }))
        .response(z.object({ updated: z.boolean() }))
        .handler(() => ({ updated: true }));

      assertEquals(routeDef.path, "/users/:id");
      assertExists(routeDef.schemas.params);
      assertExists(routeDef.schemas.query);
      assertExists(routeDef.schemas.body);
      assertExists(routeDef.schemas.response);
    });
  });

  describe("schema validation integration", () => {
    it("should validate params schema", async () => {
      const app = new Kage();

      app.get(
        "/users/:id",
        { params: z.object({ id: z.string().min(1) }) },
        (ctx) => ({ id: ctx.params.id }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users/123"),
      );
      const body = await res.json();
      assertEquals(body.id, "123");
    });

    it("should return 400 for invalid params", async () => {
      const app = new Kage();

      app.get(
        "/users/:id",
        { params: z.object({ id: z.coerce.number() }) },
        (ctx) => ({ id: ctx.params.id }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users/abc"),
      );
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Validation failed");
    });

    it("should validate query schema", async () => {
      const app = new Kage();

      app.get(
        "/users",
        { query: z.object({ page: z.string() }) },
        (ctx) => ({ page: ctx.query.page }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users?page=1"),
      );
      const body = await res.json();
      assertEquals(body.page, "1");
    });

    it("should return 400 for invalid query", async () => {
      const app = new Kage();

      app.get(
        "/users",
        { query: z.object({ page: z.coerce.number() }) },
        (ctx) => ({ page: ctx.query.page }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users?page=abc"),
      );
      assertEquals(res.status, 400);
    });

    it("should validate body schema", async () => {
      const app = new Kage();

      app.post(
        "/users",
        { body: z.object({ name: z.string() }) },
        (ctx) => ({ name: ctx.body.name }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "John" }),
        }),
      );
      const body = await res.json();
      assertEquals(body.name, "John");
    });

    it("should return 400 for invalid body", async () => {
      const app = new Kage();

      app.post(
        "/users",
        { body: z.object({ name: z.string().min(1) }) },
        (ctx) => ({ name: ctx.body.name }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        }),
      );
      assertEquals(res.status, 400);
    });

    it("should return 400 for invalid JSON body", async () => {
      const app = new Kage();

      app.post(
        "/users",
        { body: z.object({ name: z.string() }) },
        (ctx) => ({ name: ctx.body.name }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        }),
      );
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Invalid JSON body");
    });

    it("should validate response schema in development (runtime)", async () => {
      const originalEnv = Deno.env.get("DENO_ENV");
      Deno.env.set("DENO_ENV", "development");

      const warnings: unknown[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);

      try {
        const app = new Kage();

        // Runtime validation works for both direct objects and ctx.json() responses
        app.get(
          "/users",
          { response: z.object({ id: z.number() }) },
          (ctx) => ctx.json({ id: "not-a-number" }),
        );

        await app.fetch(new Request("http://localhost/users"));
        assertEquals(warnings.length > 0, true);
      } finally {
        console.warn = originalWarn;
        if (originalEnv) {
          Deno.env.set("DENO_ENV", originalEnv);
        } else {
          Deno.env.delete("DENO_ENV");
        }
      }
    });

    it("should work with config object syntax", async () => {
      const app = new Kage();

      app.post("/users", {
        schemas: {
          body: z.object({ name: z.string() }),
        },
        handler: (ctx) => ({ received: ctx.body.name }),
      });

      const res = await app.fetch(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Alice" }),
        }),
      );
      const body = await res.json();
      assertEquals(body.received, "Alice");
    });
  });
});
