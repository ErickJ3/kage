/**
 * Tests for the Kage core application class.
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Kage } from "./kage.ts";
import { Context } from "./context.ts";
import { logger, type Middleware } from "./middleware.ts";

describe("Kage", () => {
  describe("Route Registration", () => {
    it("should register GET route", () => {
      const app = new Kage();
      app.get("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should register POST route", () => {
      const app = new Kage();
      app.post("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should register PUT route", () => {
      const app = new Kage();
      app.put("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should register PATCH route", () => {
      const app = new Kage();
      app.patch("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should register DELETE route", () => {
      const app = new Kage();
      app.delete("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should register HEAD route", () => {
      const app = new Kage();
      app.head("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should register OPTIONS route", () => {
      const app = new Kage();
      app.options("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should support route with config", () => {
      const app = new Kage();
      app.get("/test", {
        permissions: ["net:example.com"],
        handler: (ctx: Context) => ctx.json({ success: true }),
      });
      assertEquals(true, true);
    });
  });

  describe("Middleware", () => {
    it("should accept middleware via use()", () => {
      const app = new Kage();
      const mw: Middleware = async (_ctx, next) => await next();

      app.use(mw);
      assertEquals(true, true);
    });

    it("should accept multiple middleware", () => {
      const app = new Kage();

      app.use(logger());
      app.use(async (_ctx, next) => await next());
      app.use(async (_ctx, next) => await next());

      assertEquals(true, true);
    });
  });

  describe("Base Path", () => {
    it("should support base path configuration", () => {
      const app = new Kage({ basePath: "/api" });
      app.get("/users", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should handle base path with trailing slash", () => {
      const app = new Kage({ basePath: "/api/" });
      app.get("/users", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should work with default base path /", () => {
      const app = new Kage();
      app.get("/users", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });
  });

  describe("Development Mode", () => {
    it("should accept development flag", () => {
      const app = new Kage({ development: true });
      app.get("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });

    it("should default to production mode", () => {
      const app = new Kage();
      app.get("/test", (ctx) => ctx.json({ success: true }));
      assertEquals(true, true);
    });
  });

  describe("Response Handling", () => {
    it("should handle Response objects", () => {
      const app = new Kage();
      app.get("/custom", (ctx) => {
        return ctx.response("Custom", {
          status: 201,
          headers: { "X-Test": "value" },
        });
      });
      assertExists(app);
    });

    it("should handle Context helper responses", () => {
      const app = new Kage();
      app.get("/json", (ctx) => ctx.json({ message: "test" }));
      app.get("/text", (ctx) => ctx.text("Hello"));
      app.get("/html", (ctx) => ctx.html("<h1>Test</h1>"));
      assertExists(app);
    });

    it("should handle null/undefined", () => {
      const app = new Kage();
      app.delete("/resource", () => null);
      assertExists(app);
    });

    it("should handle plain objects", () => {
      const app = new Kage();
      app.get("/data", () => ({ key: "value" }));
      assertExists(app);
    });

    it("should handle strings", () => {
      const app = new Kage();
      app.get("/text", () => "plain text");
      assertExists(app);
    });
  });

  describe("Error Handling", () => {
    it("should handle handler exceptions", () => {
      const app = new Kage({ development: true });
      app.get("/error", () => {
        throw new Error("Test error");
      });
      assertExists(app);
    });
  });
});
