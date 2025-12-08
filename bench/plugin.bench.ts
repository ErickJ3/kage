import { Context } from "../packages/core/src/context/context.ts";

const baseRequest = new Request("http://localhost:8000/users/123", {
  headers: { "Authorization": "Bearer token123", "X-Request-Id": "req-456" },
});
const params = { id: "123" };
const ctx = new Context(baseRequest, params, null, "/users/123");

const decorators = { db: { query: () => [] }, cache: { get: () => null } };
const manyDecorators = Object.fromEntries(
  Array.from({ length: 20 }, (_, i) => [`service${i}`, { name: `svc${i}` }]),
);

Deno.bench("plugin - Object.assign empty", () => {
  const target = {};
  Object.assign(target, {});
});

Deno.bench("plugin - Object.assign 2 decorators", () => {
  const target = {};
  Object.assign(target, decorators);
});

Deno.bench("plugin - Object.assign 20 decorators", () => {
  const target = {};
  Object.assign(target, manyDecorators);
});

Deno.bench("plugin - spread 2 decorators", () => {
  void { ...decorators };
});

Deno.bench("plugin - spread 20 decorators", () => {
  void { ...manyDecorators };
});

Deno.bench("plugin - manual assign 2 keys", () => {
  const target: Record<string, unknown> = {};
  target.db = decorators.db;
  target.cache = decorators.cache;
});

const deriveContext = {
  request: ctx.request,
  headers: ctx.headers,
  method: ctx.method,
  path: ctx.path,
  url: ctx.url,
  params: ctx.params,
  query: ctx.query,
};

Deno.bench("plugin - create derive context", () => {
  void {
    request: ctx.request,
    headers: ctx.headers,
    method: ctx.method,
    path: ctx.path,
    url: ctx.url,
    params: ctx.params,
    query: ctx.query,
  };
});

const syncDerive = (_ctx: typeof deriveContext) => ({ userId: "123" });
const asyncDerive = (_ctx: typeof deriveContext) =>
  Promise.resolve({ userId: "123" });

Deno.bench("plugin - sync derive function", () => {
  syncDerive(deriveContext);
});

Deno.bench("plugin - async derive function", async () => {
  await asyncDerive(deriveContext);
});

const deriveFns = [
  (_ctx: typeof deriveContext) => ({ a: 1 }),
  (_ctx: typeof deriveContext) => ({ b: 2 }),
  (_ctx: typeof deriveContext) => ({ c: 3 }),
];

Deno.bench("plugin - 3 derive functions loop", () => {
  const target: Record<string, unknown> = {};
  for (const fn of deriveFns) {
    const derived = fn(deriveContext);
    Object.assign(target, derived);
  }
});

const manyDeriveFns = Array.from(
  { length: 10 },
  (_, i) => (_ctx: typeof deriveContext) => ({
    [`key${i}`]: i,
  }),
);

Deno.bench("plugin - 10 derive functions loop", () => {
  const target: Record<string, unknown> = {};
  for (const fn of manyDeriveFns) {
    const derived = fn(deriveContext);
    Object.assign(target, derived);
  }
});

type BeforeHandleHook = (ctx: Context) => Response | void;

const beforeHookPass: BeforeHandleHook = (_ctx) => {};
const beforeHookReturn: BeforeHandleHook = (_ctx) => new Response("blocked");

Deno.bench("plugin - beforeHandle pass through", () => {
  const result = beforeHookPass(ctx);
  void (result instanceof Response);
});

Deno.bench("plugin - beforeHandle return Response", () => {
  const result = beforeHookReturn(ctx);
  void (result instanceof Response);
});

const beforeHooks: BeforeHandleHook[] = [
  (_ctx) => {},
  (_ctx) => {},
  (_ctx) => {},
];

Deno.bench("plugin - 3 beforeHandle hooks loop", () => {
  for (const hook of beforeHooks) {
    const result = hook(ctx);
    if (result instanceof Response) {
      void result;
      break;
    }
  }
});

type AfterHandleHook = (ctx: Context, response: Response) => Response;

const response = new Response("ok");
const afterHookPass: AfterHandleHook = (_ctx, res) => res;
const afterHookTransform: AfterHandleHook = (_ctx, res) =>
  new Response(res.body, {
    status: res.status,
    headers: { ...Object.fromEntries(res.headers), "X-Custom": "value" },
  });

Deno.bench("plugin - afterHandle pass through", () => {
  afterHookPass(ctx, response);
});

Deno.bench("plugin - afterHandle transform", () => {
  afterHookTransform(ctx, response);
});

const afterHooks: AfterHandleHook[] = [
  (_ctx, res) => res,
  (_ctx, res) => res,
  (_ctx, res) => res,
];

Deno.bench("plugin - 3 afterHandle hooks loop", () => {
  let res = response;
  for (const hook of afterHooks) {
    res = hook(ctx, res);
  }
});

const state = { requestCount: 0, startTime: Date.now() };

Deno.bench("plugin - access state property", () => {
  state.requestCount;
});

Deno.bench("plugin - mutate state property", () => {
  state.requestCount++;
});

Deno.bench("plugin - instanceof Response check", () => {
  const result: unknown = response;
  result instanceof Response;
});

Deno.bench("plugin - typeof + constructor check", () => {
  const result: unknown = response;
  typeof result === "object" && result !== null &&
    result.constructor === Response;
});
