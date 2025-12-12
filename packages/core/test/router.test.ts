import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { Router } from "~/router/radix.ts";
import { Context } from "~/context/context.ts";

const mockCtx = () => new Context(new Request("http://localhost/"), {});

describe("Router", () => {
  describe("add()", () => {
    it("should add static routes", () => {
      const router = new Router();
      router.add("GET", "/users", () => "users");
      router.add("GET", "/posts", () => "posts");

      const match1 = router.find("GET", "/users");
      const match2 = router.find("GET", "/posts");

      assertEquals(match1?.handler(mockCtx()), "users");
      assertEquals(match2?.handler(mockCtx()), "posts");
    });

    it("should add routes with params", () => {
      const router = new Router();
      router.add("GET", "/users/:id", () => "user");

      const match = router.find("GET", "/users/123");
      assertEquals(match?.params.id, "123");
    });

    it("should add routes with multiple params", () => {
      const router = new Router();
      router.add("GET", "/orgs/:orgId/users/:userId", () => "orgUser");

      const match = router.find("GET", "/orgs/acme/users/123");
      assertEquals(match?.params.orgId, "acme");
      assertEquals(match?.params.userId, "123");
    });

    it("should add wildcard routes", () => {
      const router = new Router();
      router.add("GET", "/static/*", () => "static");

      const match = router.find("GET", "/static/css/style.css");
      assertEquals(match?.params["*"], "css/style.css");
    });

    it("should throw for path not starting with /", () => {
      const router = new Router();
      assertThrows(
        () => router.add("GET", "users", () => "users"),
        Error,
        "Route path must start with /",
      );
    });

    it("should throw for duplicate routes", () => {
      const router = new Router();
      router.add("GET", "/users", () => "users1");

      assertThrows(
        () => router.add("GET", "/users", () => "users2"),
        Error,
        "Route already registered",
      );
    });

    it("should throw for duplicate wildcard routes", () => {
      const router = new Router();
      router.add("GET", "/static/*", () => "static1");

      assertThrows(
        () => router.add("GET", "/static/*", () => "static2"),
        Error,
        "Wildcard route already registered",
      );
    });

    it("should allow same path with different methods", () => {
      const router = new Router();
      router.add("GET", "/users", () => "get");
      router.add("POST", "/users", () => "post");

      assertEquals(router.find("GET", "/users")?.handler(mockCtx()), "get");
      assertEquals(router.find("POST", "/users")?.handler(mockCtx()), "post");
    });

    it("should handle all HTTP methods", () => {
      const router = new Router();
      const methods = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ] as const;

      for (const method of methods) {
        router.add(method, `/test-${method}`, () => method);
      }

      for (const method of methods) {
        const match = router.find(method, `/test-${method}`);
        assertEquals(match?.handler(mockCtx()), method);
      }
    });
  });

  describe("find()", () => {
    it("should return null for non-existent routes", () => {
      const router = new Router();
      router.add("GET", "/users", () => "users");

      assertEquals(router.find("GET", "/posts"), null);
      assertEquals(router.find("POST", "/users"), null);
    });

    it("should match exact paths", () => {
      const router = new Router();
      router.add("GET", "/users", () => "users");
      router.add("GET", "/users/list", () => "usersList");

      assertEquals(router.find("GET", "/users")?.handler(mockCtx()), "users");
      assertEquals(
        router.find("GET", "/users/list")?.handler(mockCtx()),
        "usersList",
      );
    });

    it("should prefer static over param routes", () => {
      const router = new Router();
      router.add("GET", "/users/me", () => "me");
      router.add("GET", "/users/:id", () => "byId");

      assertEquals(router.find("GET", "/users/me")?.handler(mockCtx()), "me");
      assertEquals(
        router.find("GET", "/users/123")?.handler(mockCtx()),
        "byId",
      );
    });

    it("should prefer param over wildcard routes", () => {
      const router = new Router();
      router.add("GET", "/files/:name", () => "byName");
      router.add("GET", "/files/*", () => "wildcard");

      assertEquals(
        router.find("GET", "/files/test.txt")?.handler(mockCtx()),
        "byName",
      );
      assertEquals(
        router.find("GET", "/files/path/to/file.txt")?.handler(mockCtx()),
        "wildcard",
      );
    });

    it("should use static cache for static routes", () => {
      const router = new Router();
      router.add("GET", "/cached", () => "cached");

      router.find("GET", "/cached");
      assertEquals(router.getStaticCacheSize() > 0, true);
    });

    it("should return frozen empty params for static routes", () => {
      const router = new Router();
      router.add("GET", "/static", () => "static");

      const match = router.find("GET", "/static");
      assertEquals(Object.isFrozen(match?.params), true);
      assertEquals(Object.keys(match?.params || {}).length, 0);
    });

    it("should handle root path", () => {
      const router = new Router();
      router.add("GET", "/", () => "root");

      const match = router.find("GET", "/");
      assertEquals(match?.handler(mockCtx()), "root");
    });

    it("should handle deep nested paths", () => {
      const router = new Router();
      router.add("GET", "/a/b/c/d/e/f", () => "deep");

      const match = router.find("GET", "/a/b/c/d/e/f");
      assertEquals(match?.handler(mockCtx()), "deep");
    });

    it("should handle params at different positions", () => {
      const router = new Router();
      router.add("GET", "/:a/b/:c/d/:e", () => "mixed");

      const match = router.find("GET", "/1/b/2/d/3");
      assertEquals(match?.params.a, "1");
      assertEquals(match?.params.c, "2");
      assertEquals(match?.params.e, "3");
    });
  });

  describe("clear()", () => {
    it("should clear all routes", () => {
      const router = new Router();
      router.add("GET", "/users", () => "users");
      router.add("POST", "/users", () => "create");

      router.clear();

      assertEquals(router.find("GET", "/users"), null);
      assertEquals(router.find("POST", "/users"), null);
    });

    it("should clear static cache", () => {
      const router = new Router();
      router.add("GET", "/cached", () => "cached");
      router.find("GET", "/cached");

      router.clear();

      assertEquals(router.getStaticCacheSize(), 0);
    });
  });

  describe("edge cases", () => {
    it("should handle trailing slashes", () => {
      const router = new Router();
      router.add("GET", "/users/", () => "withSlash");

      const match = router.find("GET", "/users/");
      assertEquals(match?.handler(mockCtx()), "withSlash");
    });

    it("should handle param-only path", () => {
      const router = new Router();
      router.add("GET", "/:id", () => "byId");

      const match = router.find("GET", "/123");
      assertEquals(match?.params.id, "123");
    });

    it("should handle wildcard capturing full path", () => {
      const router = new Router();
      router.add("GET", "/*", () => "catchAll");

      const match = router.find("GET", "/any/path/here");
      assertEquals(match?.params["*"], "any/path/here");
    });

    it("should handle empty segment after param", () => {
      const router = new Router();
      router.add("GET", "/users/:id/posts", () => "userPosts");

      const match = router.find("GET", "/users/123/posts");
      assertEquals(match?.params.id, "123");
    });

    it("should not match partial paths", () => {
      const router = new Router();
      router.add("GET", "/users/list", () => "list");

      assertEquals(router.find("GET", "/users"), null);
      assertEquals(router.find("GET", "/users/list/extra"), null);
    });

    it("should handle special characters in params", () => {
      const router = new Router();
      router.add("GET", "/files/:name", () => "file");

      const match = router.find("GET", "/files/file%20name.txt");
      assertEquals(match?.params.name, "file%20name.txt");
    });
  });
});
