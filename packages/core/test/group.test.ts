import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Kage } from "~/app/mod.ts";

function createHandler<
  TDecorators extends Record<string, unknown>,
  TState extends Record<string, unknown>,
  TDerived extends Record<string, unknown>,
>(
  app: Kage<TDecorators, TState, TDerived>,
): (req: Request) => Promise<Response> {
  return (app as unknown as {
    handleRequest: (req: Request) => Promise<Response>;
  }).handleRequest.bind(app);
}

describe("KageGroup Isolation", () => {
  describe("decorate() isolation", () => {
    it("group decorators should not leak to root routes", async () => {
      const app = new Kage()
        .decorate("global", "global-value")
        .group("/api", (api) =>
          api
            .decorate("groupOnly", "group-value")
            .get("/test", (ctx) => ({
              global: ctx.global,
              groupOnly: ctx.groupOnly,
            })))
        .get("/root", (ctx) => ({
          global: ctx.global,
          hasGroupOnly: "groupOnly" in ctx,
        }));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      assertEquals(await apiRes.json(), {
        global: "global-value",
        groupOnly: "group-value",
      });

      const rootRes = await handler(new Request("http://localhost/root"));
      const rootData = await rootRes.json();
      assertEquals(rootData.global, "global-value");
      assertEquals(rootData.hasGroupOnly, false);
    });

    it("decorators should not leak between sibling groups", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .decorate("apiOnly", "api-value")
            .get("/test", (ctx) => ({
              apiOnly: ctx.apiOnly,
              hasAdminOnly: "adminOnly" in ctx,
            })))
        .group("/admin", (admin) =>
          admin
            .decorate("adminOnly", "admin-value")
            .get("/test", (ctx) => ({
              adminOnly: ctx.adminOnly,
              hasApiOnly: "apiOnly" in ctx,
            })));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      const apiData = await apiRes.json();
      assertEquals(apiData.apiOnly, "api-value");
      assertEquals(apiData.hasAdminOnly, false);

      const adminRes = await handler(
        new Request("http://localhost/admin/test"),
      );
      const adminData = await adminRes.json();
      assertEquals(adminData.adminOnly, "admin-value");
      assertEquals(adminData.hasApiOnly, false);
    });

    it("nested groups should inherit parent decorators", async () => {
      const app = new Kage()
        .decorate("root", "root-value")
        .group("/api", (api) =>
          api
            .decorate("api", "api-value")
            .group("/users", (users) =>
              users
                .decorate("users", "users-value")
                .get("/test", (ctx) => ({
                  root: ctx.root,
                  api: ctx.api,
                  users: ctx.users,
                }))));

      const handler = createHandler(app);
      const res = await handler(
        new Request("http://localhost/api/users/test"),
      );
      assertEquals(await res.json(), {
        root: "root-value",
        api: "api-value",
        users: "users-value",
      });
    });
  });

  describe("state() isolation", () => {
    it("group state should not leak to root routes", async () => {
      const app = new Kage()
        .state("globalCounter", 0)
        .group(
          "/api",
          (api) =>
            api.state("apiCounter", 0).get("/increment", (ctx) => {
              ctx.store.apiCounter++;
              return {
                apiCounter: ctx.store.apiCounter,
                globalCounter: ctx.store.globalCounter,
              };
            }),
        )
        .get("/root", (ctx) => {
          ctx.store.globalCounter++;
          return {
            globalCounter: ctx.store.globalCounter,
            hasApiCounter: "apiCounter" in ctx.store,
          };
        });

      const handler = createHandler(app);

      const apiRes = await handler(
        new Request("http://localhost/api/increment"),
      );
      assertEquals(await apiRes.json(), {
        apiCounter: 1,
        globalCounter: 0,
      });

      const rootRes = await handler(new Request("http://localhost/root"));
      const rootData = await rootRes.json();
      assertEquals(rootData.globalCounter, 1);
      assertEquals(rootData.hasApiCounter, false);
    });

    it("state mutations in group should not affect sibling groups", async () => {
      const app = new Kage()
        .group(
          "/api",
          (api) =>
            api.state("counter", 0).get("/increment", (ctx) => {
              ctx.store.counter++;
              return { counter: ctx.store.counter };
            }),
        )
        .group(
          "/admin",
          (admin) =>
            admin.state("counter", 100).get("/increment", (ctx) => {
              ctx.store.counter++;
              return { counter: ctx.store.counter };
            }),
        );

      const handler = createHandler(app);
      await handler(new Request("http://localhost/api/increment"));
      const apiRes = await handler(
        new Request("http://localhost/api/increment"),
      );
      assertEquals(await apiRes.json(), { counter: 2 });
      const adminRes = await handler(
        new Request("http://localhost/admin/increment"),
      );
      assertEquals(await adminRes.json(), { counter: 101 });
    });

    it("nested groups should have isolated state from parent", async () => {
      const app = new Kage()
        .state("rootCounter", 0)
        .group("/api", (api) =>
          api
            .state("apiCounter", 10)
            .group("/users", (users) =>
              users.state("usersCounter", 100).get("/test", (ctx) => {
                ctx.store.rootCounter++;
                ctx.store.apiCounter++;
                ctx.store.usersCounter++;
                return {
                  root: ctx.store.rootCounter,
                  api: ctx.store.apiCounter,
                  users: ctx.store.usersCounter,
                };
              }))
            .get("/test", (ctx) => {
              ctx.store.apiCounter++;
              return {
                root: ctx.store.rootCounter,
                api: ctx.store.apiCounter,
                hasUsersCounter: "usersCounter" in ctx.store,
              };
            }));

      const handler = createHandler(app);
      const nestedRes = await handler(
        new Request("http://localhost/api/users/test"),
      );
      assertEquals(await nestedRes.json(), {
        root: 1,
        api: 11,
        users: 101,
      });
      const parentRes = await handler(
        new Request("http://localhost/api/test"),
      );
      const parentData = await parentRes.json();
      assertEquals(parentData.hasUsersCounter, false);
    });
  });

  describe("derive() isolation", () => {
    it("group derive should not leak to root routes", async () => {
      const app = new Kage()
        .derive(() => ({ globalDerived: "global" }))
        .group("/api", (api) =>
          api
            .derive(({ headers }) => ({
              apiKey: headers.get("x-api-key"),
            }))
            .get("/test", (ctx) => ({
              globalDerived: ctx.globalDerived,
              apiKey: ctx.apiKey,
            })))
        .get("/root", (ctx) => ({
          globalDerived: ctx.globalDerived,
          hasApiKey: "apiKey" in ctx,
        }));

      const handler = createHandler(app);

      const apiRes = await handler(
        new Request("http://localhost/api/test", {
          headers: { "x-api-key": "secret" },
        }),
      );
      assertEquals(await apiRes.json(), {
        globalDerived: "global",
        apiKey: "secret",
      });

      const rootRes = await handler(new Request("http://localhost/root"));
      const rootData = await rootRes.json();
      assertEquals(rootData.globalDerived, "global");
      assertEquals(rootData.hasApiKey, false);
    });

    it("derive should not leak between sibling groups", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .derive(() => ({ resource: "api" as const }))
            .get("/test", (ctx) => ({
              resource: ctx.resource,
              hasAdminLevel: "adminLevel" in ctx,
            })))
        .group("/admin", (admin) =>
          admin
            .derive(() => ({ adminLevel: 9000 }))
            .get("/test", (ctx) => ({
              adminLevel: ctx.adminLevel,
              hasResource: "resource" in ctx,
            })));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      const apiData = await apiRes.json();
      assertEquals(apiData.resource, "api");
      assertEquals(apiData.hasAdminLevel, false);

      const adminRes = await handler(
        new Request("http://localhost/admin/test"),
      );
      const adminData = await adminRes.json();
      assertEquals(adminData.adminLevel, 9000);
      assertEquals(adminData.hasResource, false);
    });
  });

  describe("onBeforeHandle() isolation", () => {
    it("group onBeforeHandle should only apply to group routes", async () => {
      const order: string[] = [];

      const app = new Kage()
        .onBeforeHandle(() => {
          order.push("global-before");
        })
        .group("/api", (api) =>
          api
            .onBeforeHandle(() => {
              order.push("api-before");
            })
            .get("/test", () => {
              order.push("api-handler");
              return { ok: true };
            }))
        .get("/root", () => {
          order.push("root-handler");
          return { ok: true };
        });

      const handler = createHandler(app);

      order.length = 0;
      await handler(new Request("http://localhost/api/test"));
      assertEquals(order, ["global-before", "api-before", "api-handler"]);

      order.length = 0;
      await handler(new Request("http://localhost/root"));
      assertEquals(order, ["global-before", "root-handler"]);
    });

    it("onBeforeHandle should not leak between sibling groups", async () => {
      const order: string[] = [];

      const app = new Kage()
        .group("/api", (api) =>
          api
            .onBeforeHandle(() => {
              order.push("api-before");
            })
            .get("/test", () => {
              order.push("api-handler");
              return { ok: true };
            }))
        .group("/admin", (admin) =>
          admin
            .onBeforeHandle(() => {
              order.push("admin-before");
            })
            .get("/test", () => {
              order.push("admin-handler");
              return { ok: true };
            }));

      const handler = createHandler(app);

      order.length = 0;
      await handler(new Request("http://localhost/api/test"));
      assertEquals(order, ["api-before", "api-handler"]);

      order.length = 0;
      await handler(new Request("http://localhost/admin/test"));
      assertEquals(order, ["admin-before", "admin-handler"]);
    });

    it("group onBeforeHandle can short-circuit with Response", async () => {
      const app = new Kage()
        .derive(({ headers }) => ({
          apiKey: headers.get("x-api-key"),
        }))
        .group("/api", (api) =>
          api
            .onBeforeHandle((ctx): Response | void => {
              if (!ctx.apiKey) {
                return ctx.unauthorized("API key required");
              }
            })
            .get("/secret", () => ({ secret: "data" })))
        .get("/public", () => ({ public: true }));

      const handler = createHandler(app);

      const publicRes = await handler(new Request("http://localhost/public"));
      assertEquals(await publicRes.json(), { public: true });

      const unauth = await handler(new Request("http://localhost/api/secret"));
      assertEquals(unauth.status, 401);

      const auth = await handler(
        new Request("http://localhost/api/secret", {
          headers: { "x-api-key": "test" },
        }),
      );
      assertEquals(await auth.json(), { secret: "data" });
    });
  });

  describe("onAfterHandle() isolation", () => {
    it("group onAfterHandle should only apply to group routes", async () => {
      const app = new Kage()
        .onAfterHandle((_ctx, response) => {
          const headers = new Headers(response.headers);
          headers.set("x-global", "true");
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        })
        .group("/api", (api) =>
          api
            .onAfterHandle((_ctx, response) => {
              const headers = new Headers(response.headers);
              headers.set("x-api", "true");
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            })
            .get("/test", () => ({ ok: true })))
        .get("/root", () => ({ ok: true }));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      assertEquals(apiRes.headers.get("x-global"), "true");
      assertEquals(apiRes.headers.get("x-api"), "true");

      const rootRes = await handler(new Request("http://localhost/root"));
      assertEquals(rootRes.headers.get("x-global"), "true");
      assertEquals(rootRes.headers.get("x-api"), null);
    });

    it("onAfterHandle should not leak between sibling groups", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .onAfterHandle((_ctx, response) => {
              const headers = new Headers(response.headers);
              headers.set("x-api-version", "v1");
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            })
            .get("/test", () => ({ ok: true })))
        .group("/admin", (admin) =>
          admin
            .onAfterHandle((_ctx, response) => {
              const headers = new Headers(response.headers);
              headers.set("x-admin-version", "v2");
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            })
            .get("/test", () => ({ ok: true })));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      assertEquals(apiRes.headers.get("x-api-version"), "v1");
      assertEquals(apiRes.headers.get("x-admin-version"), null);

      const adminRes = await handler(
        new Request("http://localhost/admin/test"),
      );
      assertEquals(adminRes.headers.get("x-admin-version"), "v2");
      assertEquals(adminRes.headers.get("x-api-version"), null);
    });
  });

  describe("onRequest() in groups", () => {
    it("group onRequest should set context for group routes", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .onRequest((_req, ctx) => {
              ctx.set("apiStartTime", 1000);
              return null;
            })
            .onResponse((response, _req, ctx) => {
              const startTime = ctx.get<number>("apiStartTime");
              const headers = new Headers(response.headers);
              headers.set("x-api-start", String(startTime));
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            })
            .get("/test", () => ({ ok: true })));

      const handler = createHandler(app);

      const res = await handler(new Request("http://localhost/api/test"));
      assertEquals(res.headers.get("x-api-start"), "1000");
    });

    it("onRequest can short-circuit with Response in groups", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .onRequest((req, _ctx) => {
              if (req.headers.get("x-blocked") === "true") {
                return new Response("Blocked by group", { status: 403 });
              }
              return null;
            })
            .get("/test", () => ({ ok: true })))
        .get("/root", () => ({ ok: true }));

      const handler = createHandler(app);

      const rootBlocked = await handler(
        new Request("http://localhost/root", {
          headers: { "x-blocked": "true" },
        }),
      );
      assertEquals(await rootBlocked.json(), { ok: true });

      const apiBlocked = await handler(
        new Request("http://localhost/api/test", {
          headers: { "x-blocked": "true" },
        }),
      );
      assertEquals(apiBlocked.status, 403);
    });
  });

  describe("onResponse() in groups", () => {
    it("group onResponse should only transform group responses", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .onResponse((response, _req, _ctx) => {
              const headers = new Headers(response.headers);
              headers.set("x-api-processed", "true");
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            })
            .get("/test", () => ({ ok: true })))
        .get("/root", () => ({ ok: true }));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      assertEquals(apiRes.headers.get("x-api-processed"), "true");

      const rootRes = await handler(new Request("http://localhost/root"));
      assertEquals(rootRes.headers.get("x-api-processed"), null);
    });
  });

  describe("onError() in groups", () => {
    it("group onError should handle errors for group routes", async () => {
      const app = new Kage()
        .group("/api", (api) =>
          api
            .onError((error, _req, _ctx) => {
              return Response.json(
                { apiError: true, message: String(error) },
                { status: 500 },
              );
            })
            .get("/error", () => {
              throw new Error("API error");
            }))
        .onError((error, _req, _ctx) => {
          return Response.json(
            { globalError: true, message: String(error) },
            { status: 500 },
          );
        })
        .get("/error", () => {
          throw new Error("Root error");
        });

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/error"));
      const apiData = await apiRes.json();
      assertEquals(apiData.apiError, true);

      const rootRes = await handler(new Request("http://localhost/error"));
      const rootData = await rootRes.json();
      assertEquals(rootData.globalError, true);
    });
  });

  describe("nested group() isolation", () => {
    it("deeply nested groups should have proper scoping", async () => {
      const app = new Kage()
        .decorate("level", 0)
        .state("rootState", "root")
        .group("/level1", (l1) =>
          l1
            .decorate("level", 1)
            .state("l1State", "l1")
            .group("/level2", (l2) =>
              l2
                .decorate("level", 2)
                .state("l2State", "l2")
                .group("/level3", (l3) =>
                  l3
                    .decorate("level", 3)
                    .state("l3State", "l3")
                    .get("/test", (ctx) => ({
                      level: ctx.level,
                      rootState: ctx.store.rootState,
                      l1State: ctx.store.l1State,
                      l2State: ctx.store.l2State,
                      l3State: ctx.store.l3State,
                    })))
                .get("/test", (ctx) => ({
                  level: ctx.level,
                  rootState: ctx.store.rootState,
                  l1State: ctx.store.l1State,
                  l2State: ctx.store.l2State,
                  hasL3State: "l3State" in ctx.store,
                })))
            .get("/test", (ctx) => ({
              level: ctx.level,
              rootState: ctx.store.rootState,
              l1State: ctx.store.l1State,
              hasL2State: "l2State" in ctx.store,
            })));

      const handler = createHandler(app);

      const l3Res = await handler(
        new Request("http://localhost/level1/level2/level3/test"),
      );
      assertEquals(await l3Res.json(), {
        level: 3,
        rootState: "root",
        l1State: "l1",
        l2State: "l2",
        l3State: "l3",
      });

      const l2Res = await handler(
        new Request("http://localhost/level1/level2/test"),
      );
      const l2Data = await l2Res.json();
      assertEquals(l2Data.level, 2);
      assertEquals(l2Data.hasL3State, false);

      const l1Res = await handler(
        new Request("http://localhost/level1/test"),
      );
      const l1Data = await l1Res.json();
      assertEquals(l1Data.level, 1);
      assertEquals(l1Data.hasL2State, false);
    });

    it("nested hooks should chain properly", async () => {
      const order: string[] = [];

      const app = new Kage()
        .onBeforeHandle(() => {
          order.push("root-before");
        })
        .group("/api", (api) =>
          api
            .onBeforeHandle(() => {
              order.push("api-before");
            })
            .group("/users", (users) =>
              users
                .onBeforeHandle(() => {
                  order.push("users-before");
                })
                .get("/test", () => {
                  order.push("handler");
                  return { ok: true };
                })));

      const handler = createHandler(app);

      order.length = 0;
      await handler(new Request("http://localhost/api/users/test"));
      assertEquals(order, [
        "root-before",
        "api-before",
        "users-before",
        "handler",
      ]);
    });
  });

  describe("use() plugin isolation in groups", () => {
    it("plugins applied via use() should be scoped to group", async () => {
      const authPlugin = <
        TD extends Record<string, unknown>,
        TS extends Record<string, unknown>,
        TDR extends Record<string, unknown>,
      >(
        group: import("../src/app/mod.ts").KageGroup<TD, TS, TDR>,
      ) => {
        return group.derive(() => ({ authenticated: true }));
      };

      const app = new Kage()
        .group("/api", (api) =>
          api
            .use(authPlugin)
            .get("/test", (ctx) => ({
              authenticated: ctx.authenticated,
            })))
        .get("/root", (ctx) => ({
          hasAuth: "authenticated" in ctx,
        }));

      const handler = createHandler(app);

      const apiRes = await handler(new Request("http://localhost/api/test"));
      assertEquals(await apiRes.json(), { authenticated: true });

      const rootRes = await handler(new Request("http://localhost/root"));
      assertEquals(await rootRes.json(), { hasAuth: false });
    });
  });

  describe("combined isolation test", () => {
    it("full example with multiple features should maintain isolation", async () => {
      const app = new Kage()
        .decorate("db", { name: "global-db" })
        .state("globalCounter", 0)
        .derive(() => ({ version: "1.0" }))
        .onBeforeHandle(() => {
          // global before
        })
        .group("/api", (api) =>
          api
            .state("apiRequestCount", 0)
            .decorate("apiVersion", "v1")
            .derive(({ headers }) => ({
              apiKey: headers.get("x-api-key"),
              requestId: crypto.randomUUID().slice(0, 8),
            }))
            .onBeforeHandle((ctx): Response | void => {
              ctx.store.apiRequestCount++;
              if (!ctx.apiKey) {
                return ctx.unauthorized("API key required");
              }
            })
            .onAfterHandle((_ctx, response) => {
              const headers = new Headers(response.headers);
              headers.set("x-api", "true");
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            })
            .group("/users", (users) =>
              users
                .derive(() => ({ resource: "users" as const }))
                .get("/", (ctx) => ({
                  resource: ctx.resource,
                  apiVersion: ctx.apiVersion,
                  apiKey: ctx.apiKey,
                  db: ctx.db.name,
                  version: ctx.version,
                })))
            .group("/posts", (posts) =>
              posts
                .state("postCount", 0)
                .derive(() => ({ resource: "posts" as const }))
                .post("/", (ctx) => {
                  ctx.store.postCount++;
                  return {
                    resource: ctx.resource,
                    postCount: ctx.store.postCount,
                    apiRequestCount: ctx.store.apiRequestCount,
                  };
                }))
            .get("/", (ctx) => ({
              apiVersion: ctx.apiVersion,
              requestId: ctx.requestId,
              globalCounter: ctx.store.globalCounter,
              apiRequestCount: ctx.store.apiRequestCount,
            })))
        .get("/", (ctx) => {
          ctx.store.globalCounter++;
          return {
            message: "Root",
            globalCounter: ctx.store.globalCounter,
            db: ctx.db.name,
            version: ctx.version,
            hasApiVersion: "apiVersion" in ctx,
            hasApiKey: "apiKey" in ctx,
          };
        });

      const handler = createHandler(app);

      const rootRes = await handler(new Request("http://localhost/"));
      const rootData = await rootRes.json();
      assertEquals(rootData.message, "Root");
      assertEquals(rootData.globalCounter, 1);
      assertEquals(rootData.db, "global-db");
      assertEquals(rootData.version, "1.0");
      assertEquals(rootData.hasApiVersion, false);
      assertEquals(rootData.hasApiKey, false);
      assertEquals(rootRes.headers.get("x-api"), null);

      const apiUnauth = await handler(new Request("http://localhost/api/"));
      assertEquals(apiUnauth.status, 401);

      const apiRes = await handler(
        new Request("http://localhost/api/", {
          headers: { "x-api-key": "test-key" },
        }),
      );
      const apiData = await apiRes.json();
      assertEquals(apiData.apiVersion, "v1");
      assertEquals(apiData.globalCounter, 1);
      assertEquals(apiData.apiRequestCount, 2); // 1 from unauth + 1 from this request
      assertEquals(apiRes.headers.get("x-api"), "true");

      const usersRes = await handler(
        new Request("http://localhost/api/users/", {
          headers: { "x-api-key": "test-key" },
        }),
      );
      const usersData = await usersRes.json();
      assertEquals(usersData.resource, "users");
      assertEquals(usersData.apiVersion, "v1");
      assertEquals(usersData.apiKey, "test-key");
      assertEquals(usersData.db, "global-db");
      assertEquals(usersData.version, "1.0");
      assertEquals(usersRes.headers.get("x-api"), "true");

      const postsRes = await handler(
        new Request("http://localhost/api/posts/", {
          method: "POST",
          headers: { "x-api-key": "test-key" },
        }),
      );
      const postsData = await postsRes.json();
      assertEquals(postsData.resource, "posts");
      assertEquals(postsData.postCount, 1);
    });
  });
});
