import { Context } from "../packages/core/src/context/context.ts";

const baseRequest = new Request("http://localhost:8000/users/123?foo=bar", {
  headers: { "Authorization": "Bearer token123", "X-Request-Id": "req-456" },
});
const params = { id: "123" };
const ctx = new Context(baseRequest, params, null, "/users/123");

const decorators2 = { db: { query: () => [] }, cache: { get: () => null } };
const decorators5 = {
  db: { query: () => [] },
  cache: { get: () => null },
  logger: { log: () => {} },
  config: { env: "prod" },
  metrics: { inc: () => {} },
};

Deno.bench("opt - Object.assign decorators", () => {
  const target: Record<string, unknown> = {};
  Object.assign(target, decorators2);
});

const decoratorKeys2 = Object.keys(decorators2) as (keyof typeof decorators2)[];

Deno.bench("opt - manual loop assign decorators", () => {
  const target: Record<string, unknown> = {};
  for (const key of decoratorKeys2) {
    target[key] = decorators2[key];
  }
});

Deno.bench("opt - direct property assign 2", () => {
  const target: Record<string, unknown> = {};
  target.db = decorators2.db;
  target.cache = decorators2.cache;
});

const decoratorEntries2 = Object.entries(decorators2);

Deno.bench("opt - cached entries assign", () => {
  const target: Record<string, unknown> = {};
  for (const [key, value] of decoratorEntries2) {
    target[key] = value;
  }
});

Deno.bench("opt - Object.assign 5 decorators", () => {
  const target: Record<string, unknown> = {};
  Object.assign(target, decorators5);
});

const decoratorKeys5 = Object.keys(decorators5) as (keyof typeof decorators5)[];

Deno.bench("opt - manual loop 5 decorators", () => {
  const target: Record<string, unknown> = {};
  for (const key of decoratorKeys5) {
    target[key] = decorators5[key];
  }
});

Deno.bench("opt - create derive context object", () => {
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

Deno.bench("opt - pass ctx directly to derive", () => {
  void ctx;
});

const syncDerive = (c: Context) => ({ userId: c.params.id });
const asyncDerive = (c: Context) => Promise.resolve({ userId: c.params.id });

Deno.bench("opt - sync derive with ctx", () => {
  syncDerive(ctx);
});

Deno.bench("opt - async derive with ctx", async () => {
  await asyncDerive(ctx);
});

const syncDerives = [
  (c: Context) => ({ a: c.params.id }),
  (c: Context) => ({ b: c.method }),
  (c: Context) => ({ c: c.path }),
];

Deno.bench("opt - 3 sync derives with Object.assign", () => {
  const target: Record<string, unknown> = {};
  for (const fn of syncDerives) {
    Object.assign(target, fn(ctx));
  }
});

Deno.bench("opt - 3 sync derives with spread accumulator", () => {
  let result = {};
  for (const fn of syncDerives) {
    result = { ...result, ...fn(ctx) };
  }
  void result;
});

Deno.bench("opt - 3 sync derives direct assign", () => {
  const target: Record<string, unknown> = {};
  for (const fn of syncDerives) {
    const derived = fn(ctx);
    for (const key in derived) {
      target[key] = derived[key as keyof typeof derived];
    }
  }
});

const complexUrl =
  "http://localhost:8000/api/v1/users/123/posts/456?include=comments&sort=date#section";

function parsePathCharCode(urlStr: string): string {
  let i = 0;
  const len = urlStr.length;
  while (i < len && urlStr.charCodeAt(i) !== 58) i++;
  if (i >= len) return "/";
  i += 3;
  while (i < len && urlStr.charCodeAt(i) !== 47) i++;
  if (i >= len) return "/";
  const pathStart = i;
  while (i < len) {
    const c = urlStr.charCodeAt(i);
    if (c === 63 || c === 35) break;
    i++;
  }
  return urlStr.slice(pathStart, i);
}

function parsePathIndexOf(urlStr: string): string {
  const schemeEnd = urlStr.indexOf("://");
  if (schemeEnd === -1) return "/";
  const pathStart = urlStr.indexOf("/", schemeEnd + 3);
  if (pathStart === -1) return "/";
  let pathEnd = urlStr.indexOf("?", pathStart);
  if (pathEnd === -1) pathEnd = urlStr.indexOf("#", pathStart);
  if (pathEnd === -1) pathEnd = urlStr.length;
  return urlStr.slice(pathStart, pathEnd);
}

function parsePathHybrid(urlStr: string): string {
  const schemeEnd = urlStr.indexOf("://");
  if (schemeEnd === -1) return "/";
  const pathStart = urlStr.indexOf("/", schemeEnd + 3);
  if (pathStart === -1) return "/";
  let i = pathStart;
  const len = urlStr.length;
  while (i < len) {
    const c = urlStr.charCodeAt(i);
    if (c === 63 || c === 35) break;
    i++;
  }
  return urlStr.slice(pathStart, i);
}

Deno.bench("opt - path charCode complex", () => {
  parsePathCharCode(complexUrl);
});

Deno.bench("opt - path indexOf complex", () => {
  parsePathIndexOf(complexUrl);
});

Deno.bench("opt - path hybrid complex", () => {
  parsePathHybrid(complexUrl);
});

const simpleUrl = "http://localhost:8000/users";

Deno.bench("opt - path charCode simple", () => {
  parsePathCharCode(simpleUrl);
});

Deno.bench("opt - path indexOf simple", () => {
  parsePathIndexOf(simpleUrl);
});

Deno.bench("opt - path hybrid simple", () => {
  parsePathHybrid(simpleUrl);
});

type Middleware = (
  ctx: Context,
  next: () => Promise<Response>,
) => Promise<Response>;

function composeOriginal(middleware: Middleware[]): Middleware {
  return function composedMiddleware(
    ctx: Context,
    next: () => Promise<Response>,
  ): Promise<Response> {
    let index = -1;
    function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;
      let fn: Middleware | (() => Promise<Response>) | undefined =
        middleware[i];
      if (i === middleware.length) {
        fn = next;
      }
      if (!fn) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return dispatch(0);
  };
}

function composeOptimized(middleware: Middleware[]): Middleware {
  const len = middleware.length;
  if (len === 0) {
    return (_ctx, next) => next();
  }
  if (len === 1) {
    const m0 = middleware[0];
    return (ctx, next) => m0(ctx, next);
  }
  if (len === 2) {
    const m0 = middleware[0];
    const m1 = middleware[1];
    return (ctx, next) => m0(ctx, () => m1(ctx, next));
  }
  if (len === 3) {
    const m0 = middleware[0];
    const m1 = middleware[1];
    const m2 = middleware[2];
    return (ctx, next) => m0(ctx, () => m1(ctx, () => m2(ctx, next)));
  }
  return function composedMiddleware(
    ctx: Context,
    next: () => Promise<Response>,
  ): Promise<Response> {
    let index = -1;
    function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;
      const fn = i === len ? next : middleware[i];
      if (!fn) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return dispatch(0);
  };
}

const passThrough: Middleware = async (_ctx, next) => await next();
const finalHandler = () => Promise.resolve(new Response("ok"));

const original1 = composeOriginal([passThrough]);
const optimized1 = composeOptimized([passThrough]);

Deno.bench("opt - compose original 1 middleware", async () => {
  await original1(ctx, finalHandler);
});

Deno.bench("opt - compose optimized 1 middleware", async () => {
  await optimized1(ctx, finalHandler);
});

const original3 = composeOriginal([passThrough, passThrough, passThrough]);
const optimized3 = composeOptimized([passThrough, passThrough, passThrough]);

Deno.bench("opt - compose original 3 middleware", async () => {
  await original3(ctx, finalHandler);
});

Deno.bench("opt - compose optimized 3 middleware", async () => {
  await optimized3(ctx, finalHandler);
});

const original0 = composeOriginal([]);
const optimized0 = composeOptimized([]);

Deno.bench("opt - compose original 0 middleware", async () => {
  await original0(ctx, finalHandler);
});

Deno.bench("opt - compose optimized 0 middleware", async () => {
  await optimized0(ctx, finalHandler);
});

type BeforeHook = (ctx: Context) => Response | void | Promise<Response | void>;

const hooks: BeforeHook[] = [() => {}, () => {}, () => {}];

Deno.bench("opt - hooks with await", async () => {
  for (const hook of hooks) {
    const result = await hook(ctx);
    if (result instanceof Response) {
      void result;
      break;
    }
  }
});

Deno.bench("opt - hooks sync check first", () => {
  for (const hook of hooks) {
    const result = hook(ctx);
    if (result instanceof Response) {
      void result;
      break;
    }
    if (result instanceof Promise) {
      void result;
      break;
    }
  }
});

const state = { counter: 0, startTime: 0 };

Deno.bench("opt - state via property", () => {
  state.counter++;
});

const stateProxy = new Proxy(state, {
  get(target, prop) {
    return target[prop as keyof typeof target];
  },
  set(target, prop, value) {
    target[prop as keyof typeof target] = value;
    return true;
  },
});

Deno.bench("opt - state via proxy", () => {
  stateProxy.counter++;
});

Deno.bench("opt - check instanceof Response", () => {
  const r: unknown = new Response("ok");
  void (r instanceof Response);
});

Deno.bench("opt - check constructor === Response", () => {
  const r = new Response("ok");
  void (r.constructor === Response);
});

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const JSON_INIT: ResponseInit = { headers: JSON_HEADERS };
const frozenInit: ResponseInit = Object.freeze({
  headers: Object.freeze(JSON_HEADERS),
});

const data = { id: 1, name: "test" };

Deno.bench("opt - Response with inline headers", () => {
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});

Deno.bench("opt - Response with cached init", () => {
  new Response(JSON.stringify(data), JSON_INIT);
});

Deno.bench("opt - Response with frozen init", () => {
  new Response(JSON.stringify(data), frozenInit);
});

Deno.bench("opt - Response.json static", () => {
  Response.json(data);
});
