/**
 * Tests for the mount() method - modular routing.
 */

import { assertEquals } from "@std/assert";
import { Kage } from "../src/mod.ts";

Deno.test("mount()", async (t) => {
  await t.step("should mount routes with explicit prefix", async () => {
    const usersRouter = new Kage()
      .get("/", () => ({ route: "users-list" }))
      .get("/:id", (ctx) => ({ route: "user-detail", id: ctx.params.id }))
      .post("/", () => ({ route: "create-user" }));

    const app = new Kage()
      .mount("/api/users", usersRouter)
      .get("/health", () => ({ status: "ok" }));

    const listResponse = await app.fetch(
      new Request("http://localhost/api/users"),
    );
    assertEquals((await listResponse.json()).route, "users-list");

    const detailResponse = await app.fetch(
      new Request("http://localhost/api/users/123"),
    );
    const detailData = await detailResponse.json();
    assertEquals(detailData.route, "user-detail");
    assertEquals(detailData.id, "123");

    const createResponse = await app.fetch(
      new Request("http://localhost/api/users", { method: "POST" }),
    );
    assertEquals((await createResponse.json()).route, "create-user");

    const healthResponse = await app.fetch(
      new Request("http://localhost/health"),
    );
    assertEquals((await healthResponse.json()).status, "ok");
  });

  await t.step(
    "should mount routes using prefix from mounted app",
    async () => {
      const authRoutes = new Kage({ prefix: "/auth" })
        .get("/login", () => ({ route: "login" }))
        .post("/logout", () => ({ route: "logout" }))
        .get("/me", () => ({ route: "me" }));

      const app = new Kage().mount(authRoutes);

      const loginResponse = await app.fetch(
        new Request("http://localhost/auth/login"),
      );
      assertEquals((await loginResponse.json()).route, "login");

      const logoutResponse = await app.fetch(
        new Request("http://localhost/auth/logout", { method: "POST" }),
      );
      assertEquals((await logoutResponse.json()).route, "logout");

      const meResponse = await app.fetch(
        new Request("http://localhost/auth/me"),
      );
      assertEquals((await meResponse.json()).route, "me");
    },
  );

  await t.step("should inherit parent decorators", async () => {
    const usersRouter = new Kage()
      .get("/", (ctx) => ({
        // @ts-ignore - decorator from parent
        dbName: ctx.db?.name,
      }));

    const app = new Kage()
      .decorate("db", { name: "test-db" })
      .mount("/users", usersRouter);

    const response = await app.fetch(
      new Request("http://localhost/users"),
    );
    assertEquals((await response.json()).dbName, "test-db");
  });

  await t.step("should inherit parent state", async () => {
    const counterRouter = new Kage()
      .get("/", (ctx) => {
        // @ts-ignore - state from parent
        ctx.store.count++;
        // @ts-ignore - state from parent
        return { count: ctx.store.count };
      });

    const app = new Kage()
      .state("count", 0)
      .mount("/counter", counterRouter);

    const res1 = await app.fetch(new Request("http://localhost/counter"));
    assertEquals((await res1.json()).count, 1);

    const res2 = await app.fetch(new Request("http://localhost/counter"));
    assertEquals((await res2.json()).count, 2);
  });

  await t.step("should mount multiple routers", async () => {
    const usersRouter = new Kage()
      .get("/", () => ({ resource: "users" }));

    const postsRouter = new Kage()
      .get("/", () => ({ resource: "posts" }));

    const commentsRouter = new Kage({ prefix: "/comments" })
      .get("/", () => ({ resource: "comments" }));

    const app = new Kage()
      .mount("/api/users", usersRouter)
      .mount("/api/posts", postsRouter)
      .mount(commentsRouter);

    const usersRes = await app.fetch(
      new Request("http://localhost/api/users"),
    );
    assertEquals((await usersRes.json()).resource, "users");

    const postsRes = await app.fetch(
      new Request("http://localhost/api/posts"),
    );
    assertEquals((await postsRes.json()).resource, "posts");

    const commentsRes = await app.fetch(
      new Request("http://localhost/comments"),
    );
    assertEquals((await commentsRes.json()).resource, "comments");
  });

  await t.step("should work with nested prefixes", async () => {
    const idRouter = new Kage()
      .get("/", (ctx) => {
        // @ts-ignore - param from parent mount prefix
        return { id: ctx.params.id };
      });

    const usersRouter = new Kage()
      .mount("/:id", idRouter);

    const app = new Kage()
      .mount("/api/users", usersRouter);

    const response = await app.fetch(
      new Request("http://localhost/api/users/42"),
    );
    assertEquals((await response.json()).id, "42");
  });

  await t.step("should mount a generic request handler", async () => {
    const genericHandler = (request: Request): Response => {
      const url = new URL(request.url);
      return Response.json({
        path: url.pathname,
        method: request.method,
      });
    };

    const app = new Kage()
      .get("/", () => ({ route: "home" }))
      .mount("/api/auth", genericHandler);

    const authResponse = await app.fetch(
      new Request("http://localhost/api/auth"),
    );
    const authData = await authResponse.json();
    assertEquals(authData.path, "/api/auth");
    assertEquals(authData.method, "GET");

    const loginResponse = await app.fetch(
      new Request("http://localhost/api/auth/login", { method: "POST" }),
    );
    const loginData = await loginResponse.json();
    assertEquals(loginData.path, "/api/auth/login");
    assertEquals(loginData.method, "POST");

    const callbackResponse = await app.fetch(
      new Request("http://localhost/api/auth/callback/google"),
    );
    const callbackData = await callbackResponse.json();
    assertEquals(callbackData.path, "/api/auth/callback/google");

    const homeResponse = await app.fetch(
      new Request("http://localhost/"),
    );
    assertEquals((await homeResponse.json()).route, "home");
  });

  await t.step("should mount async generic handler", async () => {
    const asyncHandler = async (request: Request): Promise<Response> => {
      await new Promise((r) => setTimeout(r, 1));
      const url = new URL(request.url);
      return Response.json({ async: true, path: url.pathname });
    };

    const app = new Kage().mount("/async", asyncHandler);

    const response = await app.fetch(
      new Request("http://localhost/async/test"),
    );
    const data = await response.json();
    assertEquals(data.async, true);
    assertEquals(data.path, "/async/test");
  });

  await t.step("should apply parent hooks to mounted routes", async () => {
    const calls: string[] = [];

    const usersRouter = new Kage()
      .get("/", () => {
        calls.push("handler");
        return { ok: true };
      });

    const app = new Kage()
      .onBeforeHandle(() => {
        calls.push("before");
      })
      .onAfterHandle((_, response) => {
        calls.push("after");
        return response;
      })
      .mount("/users", usersRouter);

    await app.fetch(new Request("http://localhost/users"));

    assertEquals(calls, ["before", "handler", "after"]);
  });

  await t.step("should work with derive from parent", async () => {
    const usersRouter = new Kage()
      .get("/", (ctx) => ({
        // @ts-ignore - derived from parent
        userId: ctx.userId,
      }));

    const app = new Kage()
      .derive(({ headers }) => ({
        userId: headers.get("x-user-id") ?? "anonymous",
      }))
      .mount("/users", usersRouter);

    const response = await app.fetch(
      new Request("http://localhost/users", {
        headers: { "x-user-id": "user-123" },
      }),
    );
    assertEquals((await response.json()).userId, "user-123");
  });
});
