import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";
import { Kage } from "~/app/kage.ts";

describe("Integration Tests", () => {
  describe("Full request lifecycle", () => {
    it("should handle complete CRUD flow", async () => {
      const app = new Kage();
      const users: { id: number; name: string }[] = [];
      let nextId = 1;

      app.get("/users", () => users);

      app.post(
        "/users",
        { body: z.object({ name: z.string() }) },
        (ctx) => {
          const user = { id: nextId++, name: ctx.body.name };
          users.push(user);
          return ctx.json(user, 201);
        },
      );

      app.get("/users/:id", (ctx) => {
        const user = users.find((u) => u.id === parseInt(ctx.params.id));
        if (!user) return ctx.notFound();
        return user;
      });

      app.put(
        "/users/:id",
        { body: z.object({ name: z.string() }) },
        (ctx) => {
          const idx = users.findIndex((u) => u.id === parseInt(ctx.params.id));
          if (idx === -1) return ctx.notFound();
          users[idx].name = ctx.body.name;
          return users[idx];
        },
      );

      app.delete("/users/:id", (ctx) => {
        const idx = users.findIndex((u) => u.id === parseInt(ctx.params.id));
        if (idx === -1) return ctx.notFound();
        users.splice(idx, 1);
        return ctx.noContent();
      });

      const createRes = await app.fetch(
        new Request("http://localhost/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Alice" }),
        }),
      );
      assertEquals(createRes.status, 201);
      const created = await createRes.json();
      assertEquals(created.name, "Alice");
      assertEquals(created.id, 1);

      const listRes = await app.fetch(new Request("http://localhost/users"));
      const list = await listRes.json();
      assertEquals(list.length, 1);

      const getRes = await app.fetch(new Request("http://localhost/users/1"));
      const user = await getRes.json();
      assertEquals(user.name, "Alice");

      const updateRes = await app.fetch(
        new Request("http://localhost/users/1", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Bob" }),
        }),
      );
      const updated = await updateRes.json();
      assertEquals(updated.name, "Bob");

      const deleteRes = await app.fetch(
        new Request("http://localhost/users/1", { method: "DELETE" }),
      );
      assertEquals(deleteRes.status, 204);

      const finalList = await app.fetch(new Request("http://localhost/users"));
      const finalUsers = await finalList.json();
      assertEquals(finalUsers.length, 0);
    });

    it("should handle middleware chain correctly", async () => {
      const logs: string[] = [];

      const app = new Kage();

      app.use(async (_ctx, next) => {
        logs.push("m1-before");
        const res = await next();
        logs.push("m1-after");
        return res;
      });

      app.use(async (_ctx, next) => {
        logs.push("m2-before");
        const res = await next();
        logs.push("m2-after");
        return res;
      });

      app.get("/test", () => {
        logs.push("handler");
        return { ok: true };
      });

      await app.fetch(new Request("http://localhost/test"));

      assertEquals(logs, [
        "m1-before",
        "m2-before",
        "handler",
        "m2-after",
        "m1-after",
      ]);
    });

    it("should handle hooks in correct order", async () => {
      const logs: string[] = [];

      const app = new Kage();

      app.onRequest((_req, ctx) => {
        logs.push("onRequest");
        ctx.set("startTime", Date.now());
        return null;
      });

      app.onBeforeHandle(() => {
        logs.push("onBeforeHandle");
      });

      app.onAfterHandle((_ctx, res) => {
        logs.push("onAfterHandle");
        return res;
      });

      app.onResponse((res, _req, ctx) => {
        logs.push("onResponse");
        assertExists(ctx.get("startTime"));
        return res;
      });

      app.get("/test", () => {
        logs.push("handler");
        return { ok: true };
      });

      await app.fetch(new Request("http://localhost/test"));

      assertEquals(logs, [
        "onRequest",
        "onBeforeHandle",
        "handler",
        "onAfterHandle",
        "onResponse",
      ]);
    });

    it("should handle error hooks", async () => {
      const app = new Kage();

      app.onError((error, req, _ctx) => {
        return Response.json(
          { error: (error as Error).message, path: new URL(req.url).pathname },
          { status: 500 },
        );
      });

      app.get("/error", () => {
        throw new Error("Test error");
      });

      const res = await app.fetch(new Request("http://localhost/error"));
      assertEquals(res.status, 500);

      const body = await res.json();
      assertEquals(body.error, "Test error");
      assertEquals(body.path, "/error");
    });
  });

  describe("Plugin system integration", () => {
    it("should work with multiple plugins", async () => {
      const app = new Kage()
        .decorate("auth", { verify: () => true })
        .derive((ctx) => ({
          user: ctx.headers.get("Authorization") ? { id: 1 } : null,
        }))
        .decorate("logger", {
          log: (msg: string) => console.log(msg),
        });

      app.get("/profile", (ctx) => {
        if (!ctx.user) return ctx.unauthorized();
        return { userId: ctx.user.id, hasAuth: ctx.auth.verify() };
      });

      const noAuthRes = await app.fetch(
        new Request("http://localhost/profile"),
      );
      assertEquals(noAuthRes.status, 401);

      const authRes = await app.fetch(
        new Request("http://localhost/profile", {
          headers: { Authorization: "Bearer token" },
        }),
      );
      const body = await authRes.json();
      assertEquals(body.userId, 1);
      assertEquals(body.hasAuth, true);
    });

    it("should maintain state across requests", async () => {
      const app = new Kage().state("counter", 0);

      app.get("/increment", (ctx) => {
        ctx.store.counter++;
        return { count: ctx.store.counter };
      });

      const res1 = await app.fetch(new Request("http://localhost/increment"));
      assertEquals((await res1.json()).count, 1);

      const res2 = await app.fetch(new Request("http://localhost/increment"));
      assertEquals((await res2.json()).count, 2);
    });
  });

  describe("Group and mount integration", () => {
    it("should handle nested groups with isolation", async () => {
      const app = new Kage().decorate("version", "1.0");

      app.group("/api", (g) =>
        g
          .decorate("apiKey", "secret")
          .group("/v1", (v1) =>
            v1
              .decorate("v1Only", true)
              .get("/test", (ctx) => ({
                version: ctx.version,
                apiKey: ctx.apiKey,
                v1Only: ctx.v1Only,
              })))
          .group("/v2", (v2) =>
            v2.get("/test", (ctx) => ({
              version: ctx.version,
              apiKey: ctx.apiKey,
              hasV1: "v1Only" in ctx,
            }))));

      const v1Res = await app.fetch(
        new Request("http://localhost/api/v1/test"),
      );
      const v1Body = await v1Res.json();
      assertEquals(v1Body.version, "1.0");
      assertEquals(v1Body.apiKey, "secret");
      assertEquals(v1Body.v1Only, true);

      const v2Res = await app.fetch(
        new Request("http://localhost/api/v2/test"),
      );
      const v2Body = await v2Res.json();
      assertEquals(v2Body.version, "1.0");
      assertEquals(v2Body.apiKey, "secret");
      assertEquals(v2Body.hasV1, false);
    });

    it("should mount sub-applications", async () => {
      const usersApp = new Kage({ prefix: "/users" });
      usersApp.get("/", () => [{ id: 1, name: "Alice" }]);
      usersApp.get("/:id", (ctx) => ({ id: ctx.params.id }));

      const postsApp = new Kage({ prefix: "/posts" });
      postsApp.get("/", () => [{ id: 1, title: "Hello" }]);

      const app = new Kage();
      app.mount(usersApp);
      app.mount(postsApp);

      const usersRes = await app.fetch(new Request("http://localhost/users"));
      assertEquals((await usersRes.json()).length, 1);

      const userRes = await app.fetch(new Request("http://localhost/users/1"));
      assertEquals((await userRes.json()).id, "1");

      const postsRes = await app.fetch(new Request("http://localhost/posts"));
      assertEquals((await postsRes.json()).length, 1);
    });

    it("should mount with custom prefix", async () => {
      const api = new Kage();
      api.get("/health", () => ({ status: "ok" }));

      const app = new Kage();
      app.mount("/v1", api);

      const res = await app.fetch(new Request("http://localhost/v1/health"));
      assertEquals((await res.json()).status, "ok");
    });

    it("should mount generic handler", async () => {
      const app = new Kage();

      app.mount("/external", (req) => {
        return Response.json({
          proxied: true,
          path: new URL(req.url).pathname,
        });
      });

      const res = await app.fetch(
        new Request("http://localhost/external/some/path"),
      );
      const body = await res.json();
      assertEquals(body.proxied, true);
    });
  });

  describe("Response types", () => {
    it("should handle all response helper methods", async () => {
      const app = new Kage();

      app.get("/json", (ctx) => ctx.json({ test: true }));
      app.get("/text", (ctx) => ctx.text("Hello"));
      app.get("/html", (ctx) => ctx.html("<h1>Hello</h1>"));
      app.get("/redirect", (ctx) => ctx.redirect("/target"));
      app.get("/no-content", (ctx) => ctx.noContent());
      app.get("/not-found", (ctx) => ctx.notFound());
      app.get("/bad-request", (ctx) => ctx.badRequest("Invalid"));
      app.get("/unauthorized", (ctx) => ctx.unauthorized());
      app.get("/forbidden", (ctx) => ctx.forbidden());
      app.get("/error", (ctx) => ctx.internalError());
      app.get("/binary", (ctx) => ctx.binary(new Uint8Array([1, 2, 3])));

      assertEquals(
        (await app.fetch(new Request("http://localhost/json"))).status,
        200,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/text"))).status,
        200,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/html"))).status,
        200,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/redirect"))).status,
        302,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/no-content"))).status,
        204,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/not-found"))).status,
        404,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/bad-request"))).status,
        400,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/unauthorized"))).status,
        401,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/forbidden"))).status,
        403,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/error"))).status,
        500,
      );
      assertEquals(
        (await app.fetch(new Request("http://localhost/binary"))).status,
        200,
      );
    });

    it("should auto-serialize different return types", async () => {
      const app = new Kage();

      app.get("/object", () => ({ key: "value" }));
      app.get("/string", () => "plain text");
      app.get("/null", () => null);
      app.get("/response", () => new Response("direct"));
      app.get("/uint8", () => new Uint8Array([1, 2, 3]));
      app.get("/buffer", () => new ArrayBuffer(8));

      const objRes = await app.fetch(new Request("http://localhost/object"));
      assertEquals(
        objRes.headers.get("Content-Type"),
        "application/json",
      );

      const strRes = await app.fetch(new Request("http://localhost/string"));
      assertEquals(
        strRes.headers.get("Content-Type"),
        "text/plain; charset=utf-8",
      );

      const nullRes = await app.fetch(new Request("http://localhost/null"));
      assertEquals(nullRes.status, 204);

      const respRes = await app.fetch(new Request("http://localhost/response"));
      assertEquals(await respRes.text(), "direct");

      const uint8Res = await app.fetch(new Request("http://localhost/uint8"));
      assertEquals(
        uint8Res.headers.get("Content-Type"),
        "application/octet-stream",
      );

      const bufRes = await app.fetch(new Request("http://localhost/buffer"));
      assertEquals(
        bufRes.headers.get("Content-Type"),
        "application/octet-stream",
      );
    });
  });

  describe("Schema validation integration", () => {
    it("should validate complex nested schemas", async () => {
      const app = new Kage();

      const CreateOrderSchema = z.object({
        customer: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().min(1),
          }),
        ),
      });

      app.post("/orders", { body: CreateOrderSchema }, (ctx) => {
        return ctx.json({ orderId: "123", ...ctx.body }, 201);
      });

      const validRes = await app.fetch(
        new Request("http://localhost/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: { name: "John", email: "john@example.com" },
            items: [{ productId: "p1", quantity: 2 }],
          }),
        }),
      );
      assertEquals(validRes.status, 201);

      const invalidRes = await app.fetch(
        new Request("http://localhost/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: { name: "John", email: "invalid-email" },
            items: [],
          }),
        }),
      );
      assertEquals(invalidRes.status, 400);
    });
  });

  describe("Async handlers", () => {
    it("should handle async operations", async () => {
      const app = new Kage();

      app.get("/async", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { async: true };
      });

      app.get("/parallel", async () => {
        const [a, b] = await Promise.all([
          Promise.resolve(1),
          Promise.resolve(2),
        ]);
        return { sum: a + b };
      });

      const asyncRes = await app.fetch(new Request("http://localhost/async"));
      assertEquals((await asyncRes.json()).async, true);

      const parallelRes = await app.fetch(
        new Request("http://localhost/parallel"),
      );
      assertEquals((await parallelRes.json()).sum, 3);
    });

    it("should handle async middleware", async () => {
      const app = new Kage();
      const delays: number[] = [];

      app.use(async (_ctx, next) => {
        const start = Date.now();
        const res = await next();
        delays.push(Date.now() - start);
        return res;
      });

      app.get("/slow", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true };
      });

      await app.fetch(new Request("http://localhost/slow"));
      assertEquals(delays[0] >= 50, true);
    });
  });
});
