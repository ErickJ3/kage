import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { Type } from "@sinclair/typebox";
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
          params: Type.Object({ id: Type.String() }),
          query: Type.Object({ include: Type.Optional(Type.String()) }),
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
          body: Type.Object({
            name: Type.String(),
            email: Type.String(),
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
          response: Type.Object({
            id: Type.Number(),
            name: Type.String(),
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
        .params(Type.Object({ id: Type.String() }))
        .handler((ctx) => ctx.json({ id: ctx.params.id }));

      assertEquals(routeDef.path, "/users/:id");
      assertExists(routeDef.schemas.params);
    });

    it("should chain query schema", () => {
      const routeDef = route("/users")
        .query(Type.Object({ page: Type.Number(), limit: Type.Number() }))
        .handler((ctx) => ctx.json({ query: ctx.query }));

      assertExists(routeDef.schemas.query);
    });

    it("should chain body schema", () => {
      const routeDef = route("/users")
        .body(Type.Object({ name: Type.String() }))
        .handler((ctx) => ctx.json({ body: ctx.body }));

      assertExists(routeDef.schemas.body);
    });

    it("should chain response schema", () => {
      const routeDef = route("/users")
        .response(Type.Object({ success: Type.Boolean() }))
        .handler(() => ({ success: true }));

      assertExists(routeDef.schemas.response);
    });

    it("should chain all schemas", () => {
      const routeDef = route("/users/:id")
        .params(Type.Object({ id: Type.String() }))
        .query(Type.Object({ include: Type.Optional(Type.String()) }))
        .body(Type.Object({ name: Type.String() }))
        .response(Type.Object({ updated: Type.Boolean() }))
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
        { params: Type.Object({ id: Type.String({ minLength: 1 }) }) },
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
        { params: Type.Object({ id: Type.Number() }) },
        (ctx) => ({ id: ctx.params.id }),
      );

      const res = await app.fetch(
        new Request("http://localhost/users/abc"),
      );
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Validation Error");
    });

    it("should validate query schema", async () => {
      const app = new Kage();

      app.get(
        "/users",
        { query: Type.Object({ page: Type.String() }) },
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
        { query: Type.Object({ page: Type.Number() }) },
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
        { body: Type.Object({ name: Type.String() }) },
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
        { body: Type.Object({ name: Type.String({ minLength: 1 }) }) },
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
        { body: Type.Object({ name: Type.String() }) },
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

    it("should validate response schema in development", async () => {
      const originalEnv = Deno.env.get("DENO_ENV");
      Deno.env.set("DENO_ENV", "development");

      const warnings: unknown[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);

      try {
        const app = new Kage();

        app.get(
          "/users",
          { response: Type.Object({ id: Type.Number() }) },
          () => ({ id: "not-a-number" }),
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
          body: Type.Object({ name: Type.String() }),
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
