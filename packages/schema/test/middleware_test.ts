import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { t } from "../src/mod.ts";
import { Context } from "@kage/core";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
  validateSchema,
} from "../src/middleware.ts";

describe("validateSchema middleware", () => {
  describe("body validation", () => {
    it("should validate and pass valid body", async () => {
      const schema = t.Object({
        name: t.String(),
        age: t.Number(),
      });

      const middleware = validateSchema({ body: schema });

      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", age: 30 }),
      });

      const ctx = new Context(req);
      let handlerCalled = false;

      const response = await middleware(ctx, () => {
        handlerCalled = true;
        assertExists(ctx.state.validatedBody);
        assertEquals(ctx.state.validatedBody, { name: "Alice", age: 30 });
        return Promise.resolve(new Response("OK"));
      });

      assertEquals(response.status, 200);
      assertEquals(handlerCalled, true);
    });

    it("should reject invalid body", async () => {
      const schema = t.Object({
        name: t.String(),
        age: t.Number(),
      });

      const middleware = validateSchema({ body: schema });

      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", age: "thirty" }),
      });

      const ctx = new Context(req);
      let handlerCalled = false;

      const response = await middleware(ctx, () => {
        handlerCalled = true;
        return Promise.resolve(new Response("OK"));
      });

      assertEquals(response.status, 400);
      assertEquals(handlerCalled, false);

      const body = await response.json();
      assertEquals(body.error, "Validation failed");
      assertExists(body.details);
    });

    it("should reject non-JSON content type", async () => {
      const schema = t.Object({ name: t.String() });
      const middleware = validateSchema({ body: schema });

      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });

      const ctx = new Context(req);
      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error, "Content-Type must be application/json");
    });

    it("should reject malformed JSON", async () => {
      const schema = t.Object({ name: t.String() });
      const middleware = validateSchema({ body: schema });

      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json",
      });

      const ctx = new Context(req);
      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error, "Invalid JSON in request body");
    });
  });

  describe("query validation", () => {
    it("should validate and pass valid query", async () => {
      const schema = t.Object({
        page: t.String(),
        limit: t.String(),
      });

      const middleware = validateSchema({ query: schema });

      const req = new Request("http://localhost/test?page=1&limit=10");
      const ctx = new Context(req);
      let handlerCalled = false;

      const response = await middleware(ctx, () => {
        handlerCalled = true;
        assertExists(ctx.state.validatedQuery);
        assertEquals(ctx.state.validatedQuery, { page: "1", limit: "10" });
        return Promise.resolve(new Response("OK"));
      });

      assertEquals(response.status, 200);
      assertEquals(handlerCalled, true);
    });

    it("should reject invalid query", async () => {
      const schema = t.Object({
        page: t.String(),
        limit: t.String(),
      });

      const middleware = validateSchema({ query: schema });

      const req = new Request("http://localhost/test?page=1");
      const ctx = new Context(req);

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(response.status, 400);
    });
  });

  describe("params validation", () => {
    it("should validate and pass valid params", async () => {
      const schema = t.Object({
        id: t.String({ format: "uuid" }),
      });

      const middleware = validateSchema({ params: schema });

      const req = new Request(
        "http://localhost/users/123e4567-e89b-12d3-a456-426614174000",
      );
      const ctx = new Context(req, {
        id: "123e4567-e89b-12d3-a456-426614174000",
      });

      const response = await middleware(ctx, () => {
        assertExists(ctx.state.validatedParams);
        return Promise.resolve(new Response("OK"));
      });

      assertEquals(response.status, 200);
    });

    it("should reject invalid params", async () => {
      const schema = t.Object({
        id: t.String({ format: "uuid" }),
      });

      const middleware = validateSchema({ params: schema });

      const req = new Request("http://localhost/users/invalid-uuid");
      const ctx = new Context(req, { id: "invalid-uuid" });

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response("OK")),
      );

      assertEquals(response.status, 400);
    });
  });
});

describe("validation helpers", () => {
  it("getValidatedBody should return typed body", () => {
    const ctx = new Context(new Request("http://localhost/test"));
    ctx.state.validatedBody = { name: "Alice", age: 30 };

    const body = getValidatedBody(ctx);
    assertEquals(body, { name: "Alice", age: 30 });
  });

  it("getValidatedQuery should return typed query", () => {
    const ctx = new Context(new Request("http://localhost/test"));
    ctx.state.validatedQuery = { page: "1", limit: "10" };

    const query = getValidatedQuery(ctx);
    assertEquals(query, { page: "1", limit: "10" });
  });

  it("getValidatedParams should return typed params", () => {
    const ctx = new Context(new Request("http://localhost/test"));
    ctx.state.validatedParams = { id: "123" };

    const params = getValidatedParams(ctx);
    assertEquals(params, { id: "123" });
  });
});
