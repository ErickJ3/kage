import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";
import {
  validate,
  validateOrThrow,
  validationErrorResponse,
} from "~/schema/mod.ts";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
  validateSchema,
} from "~/schema/middleware.ts";
import { Context } from "~/context/context.ts";
import { Kage } from "~/app/kage.ts";

describe("schema/standard", () => {
  describe("validate()", () => {
    it("should validate valid data", async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const result = await validate(schema, { name: "John", age: 30 });

      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.data, { name: "John", age: 30 });
      }
    });

    it("should return errors for invalid data", async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const result = await validate(schema, {
        name: "John",
        age: "not a number",
      });

      assertEquals(result.success, false);
      if (!result.success) {
        assertExists(result.issues);
        assertEquals(result.issues.length > 0, true);
      }
    });

    it("should validate email format", async () => {
      const schema = z.object({
        email: z.string().email(),
      });

      const validResult = await validate(schema, { email: "test@example.com" });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { email: "not-an-email" });
      assertEquals(invalidResult.success, false);
    });

    it("should validate uuid format", async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      const validResult = await validate(schema, {
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { id: "not-a-uuid" });
      assertEquals(invalidResult.success, false);
    });

    it("should validate url format", async () => {
      const schema = z.object({
        url: z.string().url(),
      });

      const validResult = await validate(schema, {
        url: "https://example.com",
      });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { url: "not-a-url" });
      assertEquals(invalidResult.success, false);
    });

    it("should validate datetime format", async () => {
      const schema = z.object({
        timestamp: z.string().datetime(),
      });

      const validResult = await validate(schema, {
        timestamp: "2024-01-15T10:30:00Z",
      });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { timestamp: "not-a-date" });
      assertEquals(invalidResult.success, false);
    });

    it("should validate date format", async () => {
      const schema = z.object({
        date: z.string().date(),
      });

      const validResult = await validate(schema, { date: "2024-01-15" });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { date: "15-01-2024" });
      assertEquals(invalidResult.success, false);
    });

    it("should validate time format", async () => {
      const schema = z.object({
        time: z.string().time(),
      });

      const validResult = await validate(schema, { time: "10:30:00" });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { time: "invalid" });
      assertEquals(invalidResult.success, false);
    });

    it("should validate nested objects", async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            city: z.string(),
          }),
        }),
      });

      const validResult = await validate(schema, {
        user: { name: "John", address: { city: "NYC" } },
      });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, {
        user: { name: "John", address: { city: 123 } },
      });
      assertEquals(invalidResult.success, false);
    });

    it("should validate arrays", async () => {
      const schema = z.object({
        tags: z.array(z.string()),
      });

      const validResult = await validate(schema, { tags: ["a", "b", "c"] });
      assertEquals(validResult.success, true);

      const invalidResult = await validate(schema, { tags: [1, 2, 3] });
      assertEquals(invalidResult.success, false);
    });

    it("should handle optional fields", async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });

      const result = await validate(schema, { name: "John" });
      assertEquals(result.success, true);
    });

    it("should format error path correctly", async () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            age: z.number(),
          }),
        }),
      });

      const result = await validate(schema, {
        user: { profile: { age: "not-a-number" } },
      });

      assertEquals(result.success, false);
      if (!result.success) {
        const issue = result.issues[0];
        assertExists(issue.path);
        assertEquals(issue.path!.length > 0, true);
      }
    });

    it("should handle root validation error", async () => {
      const schema = z.string();
      const result = await validate(schema, 123);

      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(result.issues[0].path?.length ?? 0, 0);
      }
    });
  });

  describe("validateOrThrow()", () => {
    it("should return data for valid input", async () => {
      const schema = z.object({ name: z.string() });
      const data = await validateOrThrow(schema, { name: "John" });
      assertEquals(data, { name: "John" });
    });

    it("should throw for invalid input", async () => {
      const schema = z.object({ name: z.string() });

      let threw = false;
      try {
        await validateOrThrow(schema, { name: 123 });
      } catch (e) {
        threw = true;
        assertEquals((e as Error).message.includes("Validation failed"), true);
      }
      assertEquals(threw, true);
    });
  });

  describe("validationErrorResponse()", () => {
    it("should create 400 response with errors", async () => {
      const errors = [
        { path: "name", message: "Required" },
        { path: "age", message: "Must be number" },
      ];

      const response = validationErrorResponse(errors);

      assertEquals(response.status, 400);
      assertEquals(
        response.headers.get("Content-Type"),
        "application/json; charset=utf-8",
      );

      const body = await response.json();
      assertEquals(body.error, "Validation failed");
      assertEquals(body.details.length, 2);
    });
  });
});

describe("schema/middleware", () => {
  describe("validateSchema()", () => {
    it("should validate query parameters", async () => {
      const app = new Kage();

      app.use(
        validateSchema({
          query: z.object({ page: z.string() }),
        }),
      );

      app.get("/test", (ctx) => {
        const query = getValidatedQuery(ctx as unknown as Context);
        return { query };
      });

      const res = await app.fetch(
        new Request("http://localhost/test?page=1"),
      );
      assertEquals(res.status, 200);
    });

    it("should return 400 for invalid query", async () => {
      const middleware = validateSchema({
        query: z.object({ page: z.coerce.number() }),
      });

      const ctx = new Context(
        new Request("http://localhost/test?page=abc"),
        {},
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response()),
      );

      // Note: z.coerce.number() will convert "abc" to NaN, which fails
      assertEquals(response.status, 400);
    });

    it("should validate path params", async () => {
      const middleware = validateSchema({
        params: z.object({ id: z.string().min(1) }),
      });

      const ctx = new Context(
        new Request("http://localhost/users/123"),
        { id: "123" },
      );

      let nextCalled = false;
      await middleware(ctx, () => {
        nextCalled = true;
        return Promise.resolve(new Response());
      });

      assertEquals(nextCalled, true);
      assertEquals(ctx.state.validatedParams, { id: "123" });
    });

    it("should return 400 for invalid params", async () => {
      const middleware = validateSchema({
        params: z.object({ id: z.coerce.number() }),
      });

      const ctx = new Context(
        new Request("http://localhost/users/abc"),
        { id: "abc" },
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response()),
      );

      assertEquals(response.status, 400);
    });

    it("should validate body", async () => {
      const middleware = validateSchema({
        body: z.object({ name: z.string() }),
      });

      const ctx = new Context(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "John" }),
        }),
        {},
      );

      let nextCalled = false;
      await middleware(ctx, () => {
        nextCalled = true;
        return Promise.resolve(new Response());
      });

      assertEquals(nextCalled, true);
      assertEquals(ctx.state.validatedBody, { name: "John" });
    });

    it("should return 400 for missing content-type", async () => {
      const middleware = validateSchema({
        body: z.object({ name: z.string() }),
      });

      const ctx = new Context(
        new Request("http://localhost/users", {
          method: "POST",
          body: JSON.stringify({ name: "John" }),
        }),
        {},
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response()),
      );

      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error, "Content-Type must be application/json");
    });

    it("should return 400 for invalid JSON body", async () => {
      const middleware = validateSchema({
        body: z.object({ name: z.string() }),
      });

      const ctx = new Context(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        }),
        {},
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response()),
      );

      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error, "Invalid JSON in request body");
    });

    it("should return 400 for invalid body schema", async () => {
      const middleware = validateSchema({
        body: z.object({ name: z.string().min(5) }),
      });

      const ctx = new Context(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Jo" }),
        }),
        {},
      );

      const response = await middleware(
        ctx,
        () => Promise.resolve(new Response()),
      );

      assertEquals(response.status, 400);
    });

    it("should validate response in development mode", async () => {
      const originalEnv = Deno.env.get("DENO_ENV");
      Deno.env.set("DENO_ENV", "development");

      const warnings: unknown[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);

      try {
        const middleware = validateSchema({
          response: z.object({ id: z.number() }),
        });

        const ctx = new Context(new Request("http://localhost/test"), {});

        await middleware(
          ctx,
          () => Promise.resolve(Response.json({ id: "not-a-number" })),
        );

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

    it("should skip response validation in production", async () => {
      const originalEnv = Deno.env.get("DENO_ENV");
      Deno.env.set("DENO_ENV", "production");

      const warnings: unknown[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);

      try {
        const middleware = validateSchema({
          response: z.object({ id: z.number() }),
        });

        const ctx = new Context(new Request("http://localhost/test"), {});

        await middleware(
          ctx,
          () => Promise.resolve(Response.json({ id: "not-a-number" })),
        );

        assertEquals(warnings.length, 0);
      } finally {
        console.warn = originalWarn;
        if (originalEnv) {
          Deno.env.set("DENO_ENV", originalEnv);
        } else {
          Deno.env.delete("DENO_ENV");
        }
      }
    });
  });

  describe("getValidated* helpers", () => {
    it("should get validated body from context", () => {
      const ctx = new Context(new Request("http://localhost/test"), {});
      ctx.state.validatedBody = { name: "John" };

      const body = getValidatedBody(ctx);
      assertEquals(body, { name: "John" });
    });

    it("should get validated query from context", () => {
      const ctx = new Context(new Request("http://localhost/test"), {});
      ctx.state.validatedQuery = { page: 1 };

      const query = getValidatedQuery(ctx);
      assertEquals(query, { page: 1 });
    });

    it("should get validated params from context", () => {
      const ctx = new Context(new Request("http://localhost/test"), {});
      ctx.state.validatedParams = { id: "123" };

      const params = getValidatedParams(ctx);
      assertEquals(params, { id: "123" });
    });

    it("should return undefined if not validated", () => {
      const ctx = new Context(new Request("http://localhost/test"), {});

      assertEquals(getValidatedBody(ctx), undefined);
      assertEquals(getValidatedQuery(ctx), undefined);
      assertEquals(getValidatedParams(ctx), undefined);
    });
  });
});
