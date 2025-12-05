import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Router } from "../src/router.ts";

describe("Router", () => {
  describe("add()", () => {
    it("should register static route", () => {
      const router = new Router();
      const handler = (_ctx: unknown) => ({ success: true });

      router.add("GET", "/users", handler);

      const match = router.find("GET", "/users");
      assertExists(match);
      assertEquals(match!.handler, handler);
      assertEquals(match!.params, {});
    });

    it("should register route with single parameter", () => {
      const router = new Router();
      const handler = (_ctx: unknown) => ({ success: true });

      router.add("GET", "/users/:id", handler);

      const match = router.find("GET", "/users/123");
      assertExists(match);
      assertEquals(match!.params, { id: "123" });
    });

    it("should register route with multiple parameters", () => {
      const router = new Router();
      const handler = (_ctx: unknown) => ({ success: true });

      router.add("GET", "/users/:userId/posts/:postId", handler);

      const match = router.find("GET", "/users/42/posts/99");
      assertExists(match);
      assertEquals(match!.params, { userId: "42", postId: "99" });
    });

    it("should register wildcard route", () => {
      const router = new Router();
      const handler = (_ctx: unknown) => ({ success: true });

      router.add("GET", "/files/*", handler);

      const match = router.find("GET", "/files/documents/report.pdf");
      assertExists(match);
    });

    it("should throw on duplicate route registration", () => {
      const router = new Router();
      const handler = (_ctx: unknown) => ({ success: true });

      router.add("GET", "/users", handler);

      assertThrows(
        () => router.add("GET", "/users", handler),
        Error,
        "Route already registered",
      );
    });

    it("should throw on path not starting with /", () => {
      const router = new Router();
      const handler = (_ctx: unknown) => ({ success: true });

      assertThrows(
        () => router.add("GET", "users", handler),
        Error,
        "Route path must start with /",
      );
    });

    it("should allow same path for different methods", () => {
      const router = new Router();
      const getHandler = (_ctx: unknown) => ({ method: "GET" });
      const postHandler = (_ctx: unknown) => ({ method: "POST" });

      router.add("GET", "/users", getHandler);
      router.add("POST", "/users", postHandler);

      const getMatch = router.find("GET", "/users");
      const postMatch = router.find("POST", "/users");

      assertExists(getMatch);
      assertExists(postMatch);
      assertEquals(getMatch!.handler, getHandler);
      assertEquals(postMatch!.handler, postHandler);
    });
  });

  describe("find()", () => {
    it("should return null for non-existent route", () => {
      const router = new Router();

      const match = router.find("GET", "/nonexistent");

      assertEquals(match, null);
    });

    it("should return null for wrong method", () => {
      const router = new Router();
      router.add("GET", "/users", (_ctx: unknown) => ({ success: true }));

      const match = router.find("POST", "/users");

      assertEquals(match, null);
    });

    it("should match exact static routes only", () => {
      const router = new Router();
      router.add("GET", "/users", (_ctx: unknown) => ({ success: true }));

      const exactMatch = router.find("GET", "/users");
      assertExists(exactMatch);

      assertEquals(router.find("GET", "/users/123"), null);
      assertEquals(router.find("GET", "/user"), null);
      assertEquals(router.find("GET", "/users/"), null);
    });

    it("should extract single parameter correctly", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/users/abc123");

      assertExists(match);
      assertEquals(match!.params, { id: "abc123" });
    });

    it("should extract multiple parameters correctly", () => {
      const router = new Router();
      router.add(
        "GET",
        "/orgs/:orgId/teams/:teamId/members/:memberId",
        (_ctx: unknown) => ({ success: true }),
      );

      const match = router.find("GET", "/orgs/org1/teams/team2/members/user3");

      assertExists(match);
      assertEquals(match!.params, {
        orgId: "org1",
        teamId: "team2",
        memberId: "user3",
      });
    });

    it("should handle numeric parameters", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/users/42");

      assertExists(match);
      assertEquals(match!.params, { id: "42" });
    });

    it("should handle UUID parameters", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({ success: true }));

      const uuid = "123e4567-e89b-12d3-a456-426614174000";
      const match = router.find("GET", `/users/${uuid}`);

      assertExists(match);
      assertEquals(match!.params, { id: uuid });
    });

    it("should match routes in registration order", () => {
      const router = new Router();
      const handler1 = (_ctx: unknown) => ({ handler: 1 });
      const handler2 = (_ctx: unknown) => ({ handler: 2 });

      router.add("GET", "/users/:id", handler1);
      router.add("GET", "/users/*", handler2);

      const match = router.find("GET", "/users/123");

      assertExists(match);
      assertEquals(match!.handler, handler1);
    });

    it("should handle wildcard matching", () => {
      const router = new Router();
      router.add("GET", "/files/*", (_ctx: unknown) => ({ success: true }));

      const match1 = router.find("GET", "/files/doc.pdf");
      const match2 = router.find("GET", "/files/folder/subfolder/image.png");

      assertExists(match1);
      assertExists(match2);
    });

    it("should not match parameter across path segments", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/users/123/posts");

      assertEquals(match, null);
    });

    it("should handle URL-encoded parameters", () => {
      const router = new Router();
      router.add("GET", "/search/:query", (_ctx: unknown) => ({
        success: true,
      }));

      const match = router.find("GET", "/search/hello%20world");

      assertExists(match);
      assertEquals(match!.params, { query: "hello%20world" });
    });

    it("should handle special characters in parameters", () => {
      const router = new Router();
      router.add("GET", "/tags/:tag", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/tags/c++");

      assertExists(match);
      assertEquals(match!.params, { tag: "c++" });
    });
  });

  describe("Security", () => {
    it("should prevent path traversal in parameters", () => {
      const router = new Router();
      router.add("GET", "/files/:filename", (_ctx: unknown) => ({
        success: true,
      }));

      const match = router.find("GET", "/files/../etc/passwd");

      assertEquals(match, null);
    });

    it("should not allow / in parameter values", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/users/123/456");

      assertEquals(match, null);
    });

    it("should handle malformed paths safely", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({ success: true }));

      assertEquals(router.find("GET", ""), null);
      assertEquals(router.find("GET", "//"), null);
      assertEquals(router.find("GET", "/users//"), null);
      assertEquals(router.find("GET", "/%00"), null);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty path segment in pattern", () => {
      const router = new Router();
      router.add("GET", "/", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/");

      assertExists(match);
    });

    it("should handle trailing slash differences", () => {
      const router = new Router();
      router.add("GET", "/users", (_ctx: unknown) => ({ success: true }));

      assertExists(router.find("GET", "/users"));
      assertEquals(router.find("GET", "/users/"), null);
    });

    it("should handle routes with dots", () => {
      const router = new Router();
      router.add("GET", "/file.json", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/file.json");

      assertExists(match);
    });

    it("should handle routes with query string-like patterns", () => {
      const router = new Router();
      router.add("GET", "/search", (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", "/search");

      assertExists(match);
    });

    it("should handle very long paths", () => {
      const router = new Router();
      const longPath = "/a".repeat(1000);
      router.add("GET", longPath, (_ctx: unknown) => ({ success: true }));

      const match = router.find("GET", longPath);

      assertExists(match);
    });

    it("should handle many parameters", () => {
      const router = new Router();
      router.add("GET", "/:a/:b/:c/:d/:e/:f/:g/:h/:i/:j", (_ctx: unknown) => ({
        success: true,
      }));

      const match = router.find("GET", "/1/2/3/4/5/6/7/8/9/10");

      assertExists(match);
      assertEquals(match!.params, {
        a: "1",
        b: "2",
        c: "3",
        d: "4",
        e: "5",
        f: "6",
        g: "7",
        h: "8",
        i: "9",
        j: "10",
      });
    });
  });

  describe("Utility Methods", () => {
    it("should return all routes via getRoutes()", () => {
      const router = new Router();
      router.add("GET", "/users", (_ctx: unknown) => ({}));
      router.add("POST", "/users", (_ctx: unknown) => ({}));
      router.add("GET", "/posts", (_ctx: unknown) => ({}));

      const routes = router.getRoutes();

      assertEquals(routes.length, 3);
      const paths = routes.map((r) => r.path);
      assertEquals(paths.includes("/users"), true);
      assertEquals(paths.includes("/posts"), true);
    });

    it("should clear all routes via clear()", () => {
      const router = new Router();
      router.add("GET", "/users", (_ctx: unknown) => ({}));
      router.add("POST", "/users", (_ctx: unknown) => ({}));

      router.clear();

      assertEquals(router.getRoutes().length, 0);
      assertEquals(router.find("GET", "/users"), null);
    });

    it("should return empty array for getRoutes() on empty router", () => {
      const router = new Router();

      const routes = router.getRoutes();

      assertEquals(routes, []);
    });
  });

  describe("Performance Characteristics", () => {
    it("should handle large number of routes efficiently", () => {
      const router = new Router();

      for (let i = 0; i < 1000; i++) {
        router.add("GET", `/route${i}/:id`, (_ctx: unknown) => ({ id: i }));
      }

      for (let i = 0; i < 10; i++) {
        router.find("GET", "/route500/123");
      }

      const start = performance.now();
      const match = router.find("GET", "/route999/123");
      const duration = performance.now() - start;

      assertExists(match);
      assertEquals(match!.params, { id: "123" });
      assertEquals(duration < 10, true, `Took ${duration}ms, expected <10ms`);
    });

    it("should not degrade with multiple lookups", () => {
      const router = new Router();
      router.add("GET", "/users/:id", (_ctx: unknown) => ({}));

      const durations: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        router.find("GET", "/users/123");
        durations.push(performance.now() - start);
      }

      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const max = Math.max(...durations);

      assertEquals(avg < 0.1, true, `Average: ${avg}ms`);
      assertEquals(max < 1, true, `Max: ${max}ms`);
    });
  });
});
