import { Kage } from "../packages/core/src/app/kage.ts";

const simpleApp = new Kage();
simpleApp.get("/", (ctx) => ctx.text("Hello"));
simpleApp.get("/json", (ctx) => ctx.json({ message: "hello" }));
simpleApp.get("/users/:id", (ctx) => ctx.json({ id: ctx.params.id }));

const appWithDecorator = new Kage();
appWithDecorator
  .decorate("version", "1.0.0")
  .get("/", (ctx) => ctx.json({ version: ctx.version }));

const appWithState = new Kage();
appWithState
  .state("counter", 0)
  .get("/", (ctx) => {
    ctx.store.counter++;
    return ctx.json({ count: ctx.store.counter });
  });

const appWithDerive = new Kage();
appWithDerive
  .derive((ctx) => ({
    requestId: ctx.headers.get("x-request-id") ?? "none",
  }))
  .get("/", (ctx) => ctx.json({ requestId: ctx.requestId }));

const appWithMultiplePlugins = new Kage();
appWithMultiplePlugins
  .decorate("version", "1.0.0")
  .state("counter", 0)
  .derive((ctx) => ({ auth: ctx.headers.get("authorization") }))
  .get("/", (ctx) =>
    ctx.json({
      version: ctx.version,
      count: ctx.store.counter,
      auth: ctx.auth,
    }));

const appWithMiddleware = new Kage();
appWithMiddleware
  .use(async (_ctx, next) => await next())
  .get("/", (ctx) => ctx.text("Hello"));

const appWith3Middleware = new Kage();
appWith3Middleware
  .use(async (_ctx, next) => await next())
  .use(async (_ctx, next) => await next())
  .use(async (_ctx, next) => await next())
  .get("/", (ctx) => ctx.text("Hello"));

const appWithHooks = new Kage();
appWithHooks
  .onBeforeHandle((_ctx) => {})
  .onAfterHandle((_ctx, res) => res)
  .get("/", (ctx) => ctx.text("Hello"));

const appFull = new Kage();
appFull
  .decorate("version", "1.0.0")
  .state("requests", 0)
  .derive((ctx) => ({ requestId: ctx.headers.get("x-request-id") ?? "anon" }))
  .use(async (_ctx, next) => await next())
  .onBeforeHandle((_ctx) => {})
  .onAfterHandle((_ctx, res) => res)
  .get("/", (ctx) =>
    ctx.json({
      version: ctx.version,
      requests: ctx.store.requests++,
      requestId: ctx.requestId,
    }));

const reqSimple = new Request("http://localhost:8000/");
const reqJson = new Request("http://localhost:8000/json");
const reqParam = new Request("http://localhost:8000/users/123");
const reqWithHeaders = new Request("http://localhost:8000/", {
  headers: { "x-request-id": "req-123", "authorization": "Bearer token" },
});
const reqNotFound = new Request("http://localhost:8000/not-found");

Deno.bench("flow - simple text response", async () => {
  await simpleApp.fetch(reqSimple);
});

Deno.bench("flow - simple json response", async () => {
  await simpleApp.fetch(reqJson);
});

Deno.bench("flow - param extraction", async () => {
  await simpleApp.fetch(reqParam);
});

Deno.bench("flow - not found", async () => {
  await simpleApp.fetch(reqNotFound);
});

Deno.bench("flow - with decorator", async () => {
  await appWithDecorator.fetch(reqSimple);
});

Deno.bench("flow - with state", async () => {
  await appWithState.fetch(reqSimple);
});

Deno.bench("flow - with derive", async () => {
  await appWithDerive.fetch(reqWithHeaders);
});

Deno.bench("flow - with multiple plugins", async () => {
  await appWithMultiplePlugins.fetch(reqWithHeaders);
});

Deno.bench("flow - with 1 middleware", async () => {
  await appWithMiddleware.fetch(reqSimple);
});

Deno.bench("flow - with 3 middleware", async () => {
  await appWith3Middleware.fetch(reqSimple);
});

Deno.bench("flow - with hooks", async () => {
  await appWithHooks.fetch(reqSimple);
});

Deno.bench(
  "flow - full stack (decorator + state + derive + middleware + hooks)",
  async () => {
    await appFull.fetch(reqWithHeaders);
  },
);

const appManyRoutes = new Kage();
for (let i = 0; i < 100; i++) {
  appManyRoutes.get(`/route${i}`, (ctx) => ctx.text(`Route ${i}`));
}
appManyRoutes.get("/users/:id", (ctx) => ctx.json({ id: ctx.params.id }));

const reqFirstRoute = new Request("http://localhost:8000/route0");
const reqLastRoute = new Request("http://localhost:8000/route99");
const reqParamRoute = new Request("http://localhost:8000/users/abc123");

Deno.bench("flow - 100 routes (first)", async () => {
  await appManyRoutes.fetch(reqFirstRoute);
});

Deno.bench("flow - 100 routes (last)", async () => {
  await appManyRoutes.fetch(reqLastRoute);
});

Deno.bench("flow - 100 routes (param)", async () => {
  await appManyRoutes.fetch(reqParamRoute);
});

const appGroup = new Kage();
appGroup.group("/api", (group) =>
  group
    .derive(() => ({ apiVersion: "v1" }))
    .get("/users", (ctx) => ctx.json({ version: ctx.apiVersion })));

const reqGroup = new Request("http://localhost:8000/api/users");

Deno.bench("flow - group with scoped derive", async () => {
  await appGroup.fetch(reqGroup);
});

const appDeepPath = new Kage();
appDeepPath.get("/api/v1/users/list", (ctx) => ctx.json({ ok: true }));

const reqDeepPath = new Request("http://localhost:8000/api/v1/users/list");

Deno.bench("flow - deep path", async () => {
  await appDeepPath.fetch(reqDeepPath);
});

Deno.bench("flow - Request creation", () => {
  new Request("http://localhost:8000/users/123");
});

Deno.bench("flow - Request with headers", () => {
  new Request("http://localhost:8000/", {
    headers: { "x-request-id": "123", "authorization": "Bearer token" },
  });
});

const app3Derives = new Kage();
app3Derives
  .derive(() => ({ a: 1 }))
  .derive(() => ({ b: 2 }))
  .derive(() => ({ c: 3 }))
  .get("/", (ctx) => ctx.json({ a: ctx.a, b: ctx.b, c: ctx.c }));

Deno.bench("flow - 3 derive functions", async () => {
  await app3Derives.fetch(reqSimple);
});

const appAsyncDerive = new Kage();
appAsyncDerive
  .derive(() => Promise.resolve({ async: true }))
  .get("/", (ctx) => ctx.json({ async: ctx.async }));

Deno.bench("flow - async derive function", async () => {
  await appAsyncDerive.fetch(reqSimple);
});
