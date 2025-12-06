/**
 * Tests for the Kage plugin system
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Kage } from "../src/app/mod.ts";
import type { Middleware } from "../src/middleware/mod.ts";

function createHandler(app: Kage): (req: Request) => Promise<Response> {
  return (app as unknown as {
    handleRequest: (req: Request) => Promise<Response>;
  }).handleRequest.bind(app);
}

describe("Plugin System", () => {
  describe("decorate()", () => {
    it("should add immutable values to context", async () => {
      const db = { query: (sql: string) => [{ id: 1, sql }] };

      const app = new Kage()
        .decorate("db", db)
        .get("/test", (ctx) => {
          return ctx.json({ result: ctx.db.query("SELECT 1") });
        });

      const handler = createHandler(app);
      const response = await handler(new Request("http://localhost/test"));
      const data = await response.json();

      assertEquals(data.result[0].id, 1);
      assertEquals(data.result[0].sql, "SELECT 1");
    });

    it("should chain multiple decorators", async () => {
      const app = new Kage()
        .decorate("service1", { name: "svc1" })
        .decorate("service2", { name: "svc2" })
        .get("/test", (ctx) => {
          return ctx.json({
            svc1: ctx.service1.name,
            svc2: ctx.service2.name,
          });
        });

      const handler = createHandler(app);
      const response = await handler(new Request("http://localhost/test"));
      const data = await response.json();

      assertEquals(data.svc1, "svc1");
      assertEquals(data.svc2, "svc2");
    });

    it("should preserve decorator types across routes", async () => {
      const app = new Kage()
        .decorate("version", "1.0.0")
        .decorate("count", 42);

      app.get("/version", (ctx) => ctx.json({ version: ctx.version }));
      app.get("/count", (ctx) => ctx.json({ count: ctx.count }));

      const handler = createHandler(app);

      const versionRes = await handler(
        new Request("http://localhost/version"),
      );
      assertEquals(await versionRes.json(), { version: "1.0.0" });

      const countRes = await handler(new Request("http://localhost/count"));
      assertEquals(await countRes.json(), { count: 42 });
    });
  });

  describe("state()", () => {
    it("should add mutable state accessible via store", async () => {
      const app = new Kage()
        .state("counter", 0)
        .get("/increment", (ctx) => {
          ctx.store.counter++;
          return ctx.json({ counter: ctx.store.counter });
        });

      const handler = createHandler(app);

      const res1 = await handler(new Request("http://localhost/increment"));
      assertEquals(await res1.json(), { counter: 1 });

      const res2 = await handler(new Request("http://localhost/increment"));
      assertEquals(await res2.json(), { counter: 2 });

      const res3 = await handler(new Request("http://localhost/increment"));
      assertEquals(await res3.json(), { counter: 3 });
    });

    it("should chain multiple state values", async () => {
      const app = new Kage()
        .state("users", [] as string[])
        .state("lastAccess", null as Date | null)
        .get("/add/:name", (ctx) => {
          ctx.store.users.push(ctx.params.name);
          ctx.store.lastAccess = new Date();
          return ctx.json({
            users: ctx.store.users,
            hasLastAccess: ctx.store.lastAccess !== null,
          });
        });

      const handler = createHandler(app);

      await handler(new Request("http://localhost/add/alice"));
      const res = await handler(new Request("http://localhost/add/bob"));
      const data = await res.json();

      assertEquals(data.users, ["alice", "bob"]);
      assertEquals(data.hasLastAccess, true);
    });

    it("should allow state modification from multiple handlers", async () => {
      const app = new Kage()
        .state("log", [] as string[])
        .get("/a", (ctx) => {
          ctx.store.log.push("route-a");
          return ctx.json({ log: ctx.store.log });
        })
        .get("/b", (ctx) => {
          ctx.store.log.push("route-b");
          return ctx.json({ log: ctx.store.log });
        });

      const handler = createHandler(app);

      await handler(new Request("http://localhost/a"));
      await handler(new Request("http://localhost/b"));
      const res = await handler(new Request("http://localhost/a"));
      const data = await res.json();

      assertEquals(data.log, ["route-a", "route-b", "route-a"]);
    });
  });

  describe("derive()", () => {
    it("should derive values from request context", async () => {
      const app = new Kage()
        .derive(({ headers }) => ({
          userId: headers.get("x-user-id"),
          lang: headers.get("accept-language")?.split(",")[0] ?? "en",
        }))
        .get("/profile", (ctx) => {
          return ctx.json({ userId: ctx.userId, lang: ctx.lang });
        });

      const handler = createHandler(app);
      const response = await handler(
        new Request("http://localhost/profile", {
          headers: {
            "x-user-id": "user-123",
            "accept-language": "pt-BR,en-US",
          },
        }),
      );
      const data = await response.json();

      assertEquals(data.userId, "user-123");
      assertEquals(data.lang, "pt-BR");
    });

    it("should chain multiple derive functions", async () => {
      const app = new Kage()
        .derive(({ headers }) => ({
          auth: headers.get("authorization"),
        }))
        .derive(({ method }) => ({
          isPost: method === "POST",
        }))
        .get("/test", (ctx) => {
          return ctx.json({ auth: ctx.auth, isPost: ctx.isPost });
        });

      const handler = createHandler(app);
      const response = await handler(
        new Request("http://localhost/test", {
          headers: { authorization: "Bearer token" },
        }),
      );
      const data = await response.json();

      assertEquals(data.auth, "Bearer token");
      assertEquals(data.isPost, false);
    });

    it("should support async derive functions", async () => {
      const app = new Kage()
        .derive(async ({ headers }) => {
          await new Promise((r) => setTimeout(r, 10));
          const token = headers.get("authorization");
          return {
            user: token ? { id: "decoded-" + token } : null,
          };
        })
        .get("/me", (ctx) => {
          return ctx.json({ user: ctx.user });
        });

      const handler = createHandler(app);
      const response = await handler(
        new Request("http://localhost/me", {
          headers: { authorization: "abc123" },
        }),
      );
      const data = await response.json();

      assertEquals(data.user, { id: "decoded-abc123" });
    });

    it("should have access to params in derive", async () => {
      const app = new Kage()
        .derive(({ params }) => ({
          upperId: params.id?.toUpperCase() ?? null,
        }))
        .get("/users/:id", (ctx) => {
          return ctx.json({
            original: ctx.params.id,
            upper: ctx.upperId,
          });
        });

      const handler = createHandler(app);
      const response = await handler(
        new Request("http://localhost/users/abc123"),
      );
      const data = await response.json();

      assertEquals(data.original, "abc123");
      assertEquals(data.upper, "ABC123");
    });
  });

  describe("use() with plugins", () => {
    it("should apply plugin function and return modified app", async () => {
      function authPlugin<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app.decorate("jwt", { verify: (t: string) => t === "valid" });
      }

      const app = new Kage()
        .use(authPlugin)
        .get("/check", (ctx) => {
          return ctx.json({ valid: ctx.jwt.verify("valid") });
        });

      const handler = createHandler(app);
      const response = await handler(new Request("http://localhost/check"));
      const data = await response.json();

      assertEquals(data.valid, true);
    });

    it("should chain multiple plugins", async () => {
      function plugin1<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app.decorate("p1", "value1");
      }

      function plugin2<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app.decorate("p2", "value2");
      }

      const app = new Kage()
        .use(plugin1)
        .use(plugin2)
        .get("/test", (ctx) => {
          return ctx.json({ p1: ctx.p1, p2: ctx.p2 });
        });

      const handler = createHandler(app);
      const response = await handler(new Request("http://localhost/test"));
      const data = await response.json();

      assertEquals(data.p1, "value1");
      assertEquals(data.p2, "value2");
    });

    it("should support configurable plugins via factory", async () => {
      function greetPlugin(greeting: string) {
        return <
          TD extends Record<string, unknown>,
          TS extends Record<string, unknown>,
          TDR extends Record<string, unknown>,
        >(app: Kage<TD, TS, TDR>) => {
          return app.decorate(
            "greet",
            (name: string) => `${greeting}, ${name}!`,
          );
        };
      }

      const app = new Kage()
        .use(greetPlugin("Hello"))
        .get("/greet/:name", (ctx) => {
          return ctx.json({ message: ctx.greet(ctx.params.name) });
        });

      const handler = createHandler(app);
      const response = await handler(
        new Request("http://localhost/greet/World"),
      );
      const data = await response.json();

      assertEquals(data.message, "Hello, World!");
    });

    it("should still support middleware via use()", async () => {
      const order: number[] = [];

      const mw: Middleware = async (_ctx, next) => {
        order.push(1);
        const response = await next();
        order.push(3);
        return response;
      };

      const app = new Kage()
        .use(mw)
        .get("/test", () => {
          order.push(2);
          return { ok: true };
        });

      const handler = createHandler(app);
      await handler(new Request("http://localhost/test"));

      assertEquals(order, [1, 2, 3]);
    });
  });

  describe("group()", () => {
    it("should create route group with prefix", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .get("/users", () => ({ route: "api-users" }))
            .get("/posts", () => ({ route: "api-posts" })))
        .get("/health", () => ({ route: "health" }));

      const handler = createHandler(app);

      const usersRes = await handler(
        new Request("http://localhost/api/users"),
      );
      assertEquals(await usersRes.json(), { route: "api-users" });

      const postsRes = await handler(
        new Request("http://localhost/api/posts"),
      );
      assertEquals(await postsRes.json(), { route: "api-posts" });

      const healthRes = await handler(
        new Request("http://localhost/health"),
      );
      assertEquals(await healthRes.json(), { route: "health" });
    });

    it("should support scoped derive in groups", async () => {
      const app = new Kage()
        .derive(() => ({ global: "yes" }))
        .group("/api", (api) =>
          api
            .derive(({ headers }) => ({
              apiKey: headers.get("x-api-key"),
            }))
            .get("/data", (ctx) => ({
              global: ctx.global,
              apiKey: ctx.apiKey,
            })))
        .get("/public", (ctx) => ({ global: ctx.global }));

      const handler = createHandler(app);

      const apiRes = await handler(
        new Request("http://localhost/api/data", {
          headers: { "x-api-key": "secret" },
        }),
      );
      assertEquals(await apiRes.json(), { global: "yes", apiKey: "secret" });

      const publicRes = await handler(
        new Request("http://localhost/public"),
      );
      assertEquals(await publicRes.json(), { global: "yes" });
    });

    it("should support scoped decorators in groups", async () => {
      const app = new Kage()
        .decorate("shared", "from-root")
        .group("/admin", (admin) =>
          admin
            .decorate("adminOnly", true)
            .get("/dashboard", (ctx) => ({
              shared: ctx.shared,
              adminOnly: ctx.adminOnly,
            })));

      const handler = createHandler(app);

      const res = await handler(
        new Request("http://localhost/admin/dashboard"),
      );
      assertEquals(await res.json(), { shared: "from-root", adminOnly: true });
    });

    it("should support multiple groups at same level", async () => {
      const app = new Kage()
        .group(
          "/api/v1",
          (v1) => v1.get("/users", () => ({ path: "/api/v1/users" })),
        )
        .group(
          "/api/v2",
          (v2) => v2.get("/users", () => ({ path: "/api/v2/users" })),
        );

      const handler = createHandler(app);

      const v1Res = await handler(
        new Request("http://localhost/api/v1/users"),
      );
      assertEquals(await v1Res.json(), { path: "/api/v1/users" });

      const v2Res = await handler(
        new Request("http://localhost/api/v2/users"),
      );
      assertEquals(await v2Res.json(), { path: "/api/v2/users" });
    });
  });

  describe("lifecycle hooks", () => {
    describe("onRequest", () => {
      it("should intercept requests", async () => {
        const intercepted: string[] = [];

        const app = new Kage()
          .onRequest((req) => {
            intercepted.push(new URL(req.url).pathname);
            return null;
          })
          .get("/test", () => ({ ok: true }));

        const handler = createHandler(app);
        await handler(new Request("http://localhost/test"));

        assertEquals(intercepted, ["/test"]);
      });

      it("should allow short-circuit with Response", async () => {
        const app = new Kage()
          .onRequest((req) => {
            if (req.headers.get("x-block") === "yes") {
              return new Response("Blocked", { status: 403 });
            }
            return null;
          })
          .get("/test", () => ({ ok: true }));

        const handler = createHandler(app);

        const blockedRes = await handler(
          new Request("http://localhost/test", {
            headers: { "x-block": "yes" },
          }),
        );
        assertEquals(blockedRes.status, 403);
        assertEquals(await blockedRes.text(), "Blocked");

        const allowedRes = await handler(
          new Request("http://localhost/test"),
        );
        assertEquals(allowedRes.status, 200);
      });

      it("should allow request modification", async () => {
        const app = new Kage()
          .onRequest((req) => {
            const newHeaders = new Headers(req.headers);
            newHeaders.set("x-injected", "value");
            return new Request(req.url, {
              method: req.method,
              headers: newHeaders,
            });
          })
          .derive(({ headers }) => ({
            injected: headers.get("x-injected"),
          }))
          .get("/test", (ctx) => ({ injected: ctx.injected }));

        const handler = createHandler(app);
        const response = await handler(new Request("http://localhost/test"));
        assertEquals(await response.json(), { injected: "value" });
      });
    });

    describe("onResponse", () => {
      it("should transform responses", async () => {
        const app = new Kage()
          .onResponse((response) => {
            const newHeaders = new Headers(response.headers);
            newHeaders.set("x-processed", "true");
            return new Response(response.body, {
              status: response.status,
              headers: newHeaders,
            });
          })
          .get("/test", () => ({ ok: true }));

        const handler = createHandler(app);
        const response = await handler(new Request("http://localhost/test"));

        assertEquals(response.headers.get("x-processed"), "true");
      });

      it("should chain multiple onResponse hooks", async () => {
        const app = new Kage()
          .onResponse((response) => {
            const newHeaders = new Headers(response.headers);
            newHeaders.set("x-hook1", "yes");
            return new Response(response.body, {
              status: response.status,
              headers: newHeaders,
            });
          })
          .onResponse((response) => {
            const newHeaders = new Headers(response.headers);
            newHeaders.set("x-hook2", "yes");
            return new Response(response.body, {
              status: response.status,
              headers: newHeaders,
            });
          })
          .get("/test", () => ({ ok: true }));

        const handler = createHandler(app);
        const response = await handler(new Request("http://localhost/test"));

        assertEquals(response.headers.get("x-hook1"), "yes");
        assertEquals(response.headers.get("x-hook2"), "yes");
      });
    });

    describe("onError", () => {
      it("should handle errors", async () => {
        const app = new Kage()
          .onError((error) => {
            if (error instanceof Error && error.message === "custom") {
              return Response.json({ error: "handled" }, { status: 400 });
            }
            return null;
          })
          .get("/error", () => {
            throw new Error("custom");
          });

        const handler = createHandler(app);
        const response = await handler(new Request("http://localhost/error"));

        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "handled" });
      });

      it("should pass to default handler if returns null", async () => {
        const app = new Kage()
          .onError(() => null)
          .get("/error", () => {
            throw new Error("unhandled");
          });

        const handler = createHandler(app);
        const response = await handler(new Request("http://localhost/error"));

        assertEquals(response.status, 500);
      });
    });

    describe("onBeforeHandle", () => {
      it("should run before handler", async () => {
        const order: string[] = [];

        const app = new Kage()
          .onBeforeHandle(() => {
            order.push("before");
          })
          .get("/test", () => {
            order.push("handler");
            return { ok: true };
          });

        const handler = createHandler(app);
        await handler(new Request("http://localhost/test"));

        assertEquals(order, ["before", "handler"]);
      });

      it("should short-circuit with Response", async () => {
        const app = new Kage()
          .derive(({ headers }) => ({
            isAuth: headers.get("authorization") !== null,
          }))
          .onBeforeHandle((ctx) => {
            if (!ctx.isAuth) {
              return Response.json({ error: "unauthorized" }, { status: 401 });
            }
            return;
          })
          .get("/protected", () => ({ secret: "data" }));

        const handler = createHandler(app);

        const unauth = await handler(
          new Request("http://localhost/protected"),
        );
        assertEquals(unauth.status, 401);

        const auth = await handler(
          new Request("http://localhost/protected", {
            headers: { authorization: "token" },
          }),
        );
        assertEquals(auth.status, 200);
        assertEquals(await auth.json(), { secret: "data" });
      });
    });

    describe("onAfterHandle", () => {
      it("should run after handler", async () => {
        const order: string[] = [];

        const app = new Kage()
          .onAfterHandle((_ctx, response) => {
            order.push("after");
            return response;
          })
          .get("/test", () => {
            order.push("handler");
            return { ok: true };
          });

        const handler = createHandler(app);
        await handler(new Request("http://localhost/test"));

        assertEquals(order, ["handler", "after"]);
      });

      it("should allow response transformation", async () => {
        const app = new Kage()
          .onAfterHandle(async (_ctx, response) => {
            const data = await response.json();
            return Response.json({ ...data, wrapped: true });
          })
          .get("/test", () => ({ original: true }));

        const handler = createHandler(app);
        const response = await handler(new Request("http://localhost/test"));

        assertEquals(await response.json(), { original: true, wrapped: true });
      });
    });
  });

  describe("combined features", () => {
    it("should work with decorate + state + derive together", async () => {
      const app = new Kage()
        .decorate("config", { appName: "TestApp" })
        .state("visits", 0)
        .derive(({ headers }) => ({
          userAgent: headers.get("user-agent") ?? "unknown",
        }))
        .get("/info", (ctx) => {
          ctx.store.visits++;
          return ctx.json({
            app: ctx.config.appName,
            visits: ctx.store.visits,
            ua: ctx.userAgent,
          });
        });

      const handler = createHandler(app);

      const res1 = await handler(
        new Request("http://localhost/info", {
          headers: { "user-agent": "TestClient/1.0" },
        }),
      );
      const data1 = await res1.json();

      assertEquals(data1.app, "TestApp");
      assertEquals(data1.visits, 1);
      assertEquals(data1.ua, "TestClient/1.0");

      const res2 = await handler(new Request("http://localhost/info"));
      const data2 = await res2.json();
      assertEquals(data2.visits, 2);
    });

    it("should work with plugins adding multiple extensions", async () => {
      function fullPlugin<
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(app: Kage<TD, TS, TDR>) {
        return app
          .decorate("logger", { log: (m: string) => m })
          .state("logs", [] as string[])
          .derive(({ path }) => ({
            requestPath: path,
          }));
      }

      const app = new Kage()
        .use(fullPlugin)
        .get("/test", (ctx) => {
          const msg = ctx.logger.log(`Request to ${ctx.requestPath}`);
          ctx.store.logs.push(msg);
          return ctx.json({ logged: msg, total: ctx.store.logs.length });
        });

      const handler = createHandler(app);

      const res = await handler(new Request("http://localhost/test"));
      const data = await res.json();

      assertEquals(data.logged, "Request to /test");
      assertEquals(data.total, 1);
    });

    it("should maintain type safety across complex chains", async () => {
      interface User {
        id: string;
        role: "admin" | "user";
      }

      const app = new Kage()
        .decorate("db", {
          getUser: (id: string): User => ({ id, role: "admin" }),
        })
        .derive(({ headers }) => {
          const userId = headers.get("x-user-id");
          return { userId };
        })
        .get("/user", (ctx) => {
          if (!ctx.userId) {
            return ctx.json({ error: "No user" }, 401);
          }
          const user = ctx.db.getUser(ctx.userId);
          return ctx.json({ user });
        });

      const handler = createHandler(app);

      const res = await handler(
        new Request("http://localhost/user", {
          headers: { "x-user-id": "123" },
        }),
      );
      const data = await res.json();

      assertEquals(data.user, { id: "123", role: "admin" });
    });
  });
});
