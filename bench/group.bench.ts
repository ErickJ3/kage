import { Kage } from "../packages/core/src/mod.ts";

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

const appBaseline = new Kage();
appBaseline.get("/", () => ({ ok: true }));
const handlerBaseline = createHandler(appBaseline);
const reqBaseline = new Request("http://localhost/");

Deno.bench("group - baseline (no plugins)", async () => {
  await handlerBaseline(reqBaseline);
});

const appGlobalPlugins = new Kage()
  .decorate("db", { query: () => [] })
  .state("counter", 0)
  .derive(({ headers }) => ({ auth: headers.get("authorization") }))
  .get("/", (ctx) => ({
    db: ctx.db.query,
    counter: ctx.store.counter,
    auth: ctx.auth,
  }));
const handlerGlobalPlugins = createHandler(appGlobalPlugins);
const reqGlobalPlugins = new Request("http://localhost/", {
  headers: { authorization: "Bearer token" },
});

Deno.bench("group - global plugins only", async () => {
  await handlerGlobalPlugins(reqGlobalPlugins);
});

const appSimpleGroup = new Kage()
  .group("/api", (api) => api.get("/", () => ({ ok: true })));
const handlerSimpleGroup = createHandler(appSimpleGroup);
const reqSimpleGroup = new Request("http://localhost/api/");

Deno.bench("group - simple (prefix only)", async () => {
  await handlerSimpleGroup(reqSimpleGroup);
});

const appGroupDecorators = new Kage()
  .decorate("global", "global-value")
  .group("/api", (api) =>
    api
      .decorate("apiVersion", "v1")
      .decorate("apiName", "MyAPI")
      .get("/", (ctx) => ({
        global: ctx.global,
        version: ctx.apiVersion,
        name: ctx.apiName,
      })));
const handlerGroupDecorators = createHandler(appGroupDecorators);
const reqGroupDecorators = new Request("http://localhost/api/");

Deno.bench("group - with decorators (2 local + 1 inherited)", async () => {
  await handlerGroupDecorators(reqGroupDecorators);
});

const appGroupDerives = new Kage()
  .derive(() => ({ globalDerived: "global" }))
  .group("/api", (api) =>
    api
      .derive(({ headers }) => ({ apiKey: headers.get("x-api-key") }))
      .derive(() => ({ requestId: "req-123" }))
      .get("/", (ctx) => ({
        global: ctx.globalDerived,
        apiKey: ctx.apiKey,
        requestId: ctx.requestId,
      })));
const handlerGroupDerives = createHandler(appGroupDerives);
const reqGroupDerives = new Request("http://localhost/api/", {
  headers: { "x-api-key": "secret" },
});

Deno.bench("group - with derives (2 local + 1 inherited)", async () => {
  await handlerGroupDerives(reqGroupDerives);
});

const appGroupState = new Kage()
  .state("globalCounter", 0)
  .group("/api", (api) =>
    api
      .state("apiCounter", 0)
      .get("/", (ctx) => {
        ctx.store.apiCounter++;
        return {
          global: ctx.store.globalCounter,
          api: ctx.store.apiCounter,
        };
      }));
const handlerGroupState = createHandler(appGroupState);
const reqGroupState = new Request("http://localhost/api/");

Deno.bench("group - with state (prototype chain)", async () => {
  await handlerGroupState(reqGroupState);
});

const appGroupHooks = new Kage()
  .onBeforeHandle(() => {
    // global before
  })
  .group("/api", (api) =>
    api
      .onBeforeHandle(() => {
        // api before
      })
      .onAfterHandle((_ctx, res) => res)
      .get("/", () => ({ ok: true })));
const handlerGroupHooks = createHandler(appGroupHooks);
const reqGroupHooks = new Request("http://localhost/api/");

Deno.bench("group - with hooks (2 before + 1 after)", async () => {
  await handlerGroupHooks(reqGroupHooks);
});

const appGroupLifecycle = new Kage()
  .group("/api", (api) =>
    api
      .onRequest((_req, ctx) => {
        ctx.set("startTime", Date.now());
        return null;
      })
      .onResponse((res, _req, ctx) => {
        void ctx.get("startTime");
        return res;
      })
      .get("/", () => ({ ok: true })));
const handlerGroupLifecycle = createHandler(appGroupLifecycle);
const reqGroupLifecycle = new Request("http://localhost/api/");

Deno.bench("group - with onRequest/onResponse", async () => {
  await handlerGroupLifecycle(reqGroupLifecycle);
});

const appFullGroup = new Kage()
  .decorate("db", { query: () => [] })
  .state("globalCounter", 0)
  .derive(() => ({ version: "1.0" }))
  .group("/api", (api) =>
    api
      .state("apiRequestCount", 0)
      .decorate("apiVersion", "v1")
      .derive(({ headers }) => ({
        apiKey: headers.get("x-api-key"),
        requestId: "req-123",
      }))
      .onBeforeHandle((ctx): Response | void => {
        ctx.store.apiRequestCount++;
        if (!ctx.apiKey) {
          return ctx.unauthorized("API key required");
        }
      })
      .onAfterHandle((_ctx, response) => {
        const headers = new Headers(response.headers);
        headers.set("X-API-Version", "v1");
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      })
      .get("/", (ctx) => ({
        version: ctx.version,
        apiVersion: ctx.apiVersion,
        apiKey: ctx.apiKey,
        requestId: ctx.requestId,
        globalCounter: ctx.store.globalCounter,
        apiRequestCount: ctx.store.apiRequestCount,
      })));
const handlerFullGroup = createHandler(appFullGroup);
const reqFullGroup = new Request("http://localhost/api/", {
  headers: { "x-api-key": "test-key" },
});

Deno.bench(
  "group - full featured (decorators + state + derives + hooks)",
  async () => {
    await handlerFullGroup(reqFullGroup);
  },
);

const appNestedGroups = new Kage()
  .decorate("level", 0)
  .state("rootState", "root")
  .group("/api", (api) =>
    api
      .decorate("level", 1)
      .state("apiState", "api")
      .group("/users", (users) =>
        users
          .decorate("level", 2)
          .state("usersState", "users")
          .get("/", (ctx) => ({
            level: ctx.level,
            rootState: ctx.store.rootState,
            apiState: ctx.store.apiState,
            usersState: ctx.store.usersState,
          }))));
const handlerNestedGroups = createHandler(appNestedGroups);
const reqNestedGroups = new Request("http://localhost/api/users/");

Deno.bench("group - nested (2 levels deep)", async () => {
  await handlerNestedGroups(reqNestedGroups);
});

const appDeeplyNested = new Kage()
  .decorate("l0", true)
  .group("/l1", (l1) =>
    l1
      .decorate("l1", true)
      .group("/l2", (l2) =>
        l2
          .decorate("l2", true)
          .group("/l3", (l3) =>
            l3
              .decorate("l3", true)
              .group("/l4", (l4) =>
                l4
                  .decorate("l4", true)
                  .get("/", (ctx) => ({
                    l0: ctx.l0,
                    l1: ctx.l1,
                    l2: ctx.l2,
                    l3: ctx.l3,
                    l4: ctx.l4,
                  }))))));
const handlerDeeplyNested = createHandler(appDeeplyNested);
const reqDeeplyNested = new Request("http://localhost/l1/l2/l3/l4/");

Deno.bench("group - deeply nested (4 levels)", async () => {
  await handlerDeeplyNested(reqDeeplyNested);
});

const appSiblingGroups = new Kage()
  .group("/api", (api) =>
    api
      .decorate("type", "api")
      .state("counter", 0)
      .get("/", (ctx) => ({ type: ctx.type, counter: ctx.store.counter })))
  .group("/admin", (admin) =>
    admin
      .decorate("type", "admin")
      .state("counter", 100)
      .get("/", (ctx) => ({ type: ctx.type, counter: ctx.store.counter })));
const handlerSiblingGroups = createHandler(appSiblingGroups);
const reqSiblingApi = new Request("http://localhost/api/");
const reqSiblingAdmin = new Request("http://localhost/admin/");

Deno.bench("group - sibling groups (api)", async () => {
  await handlerSiblingGroups(reqSiblingApi);
});

Deno.bench("group - sibling groups (admin)", async () => {
  await handlerSiblingGroups(reqSiblingAdmin);
});

const appManualEquivalent = new Kage()
  .decorate("db", { query: () => [] })
  .decorate("apiVersion", "v1")
  .state("globalCounter", 0)
  .state("apiRequestCount", 0)
  .derive(() => ({ version: "1.0" }))
  .derive(({ headers }) => ({
    apiKey: headers.get("x-api-key"),
    requestId: "req-123",
  }))
  .onBeforeHandle((ctx): Response | void => {
    ctx.store.apiRequestCount++;
    if (!ctx.apiKey) {
      return ctx.unauthorized("API key required");
    }
  })
  .onAfterHandle((_ctx, response) => {
    const headers = new Headers(response.headers);
    headers.set("X-API-Version", "v1");
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  })
  .get("/api/", (ctx) => ({
    version: ctx.version,
    apiVersion: ctx.apiVersion,
    apiKey: ctx.apiKey,
    requestId: ctx.requestId,
    globalCounter: ctx.store.globalCounter,
    apiRequestCount: ctx.store.apiRequestCount,
  }));
const handlerManualEquivalent = createHandler(appManualEquivalent);
const reqManualEquivalent = new Request("http://localhost/api/", {
  headers: { "x-api-key": "test-key" },
});

Deno.bench(
  "group - equivalent WITHOUT groups (baseline comparison)",
  async () => {
    await handlerManualEquivalent(reqManualEquivalent);
  },
);

const baseCtx = { request: reqBaseline, params: {}, method: "GET" };

Deno.bench("micro - Object.create() overhead", () => {
  Object.create(baseCtx);
});

Deno.bench("micro - spread copy overhead", () => {
  void { ...baseCtx };
});

Deno.bench("micro - Object.assign to new object", () => {
  Object.assign({}, baseCtx);
});

const parentState = { globalCounter: 0 };
const localState = { apiCounter: 0 };

Deno.bench("micro - state spread (copy)", () => {
  void { ...parentState, ...localState };
});

Deno.bench("micro - state Object.create + assign (prototype)", () => {
  Object.assign(Object.create(parentState), localState);
});
