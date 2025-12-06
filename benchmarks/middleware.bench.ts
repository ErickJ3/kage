import { Context } from "../packages/core/src/context/context.ts";
import { compose } from "../packages/core/src/middleware/compose.ts";
import type { Middleware } from "../packages/core/src/middleware/types.ts";

const baseRequest = new Request("http://localhost:8000/users/123");
const ctx = new Context(baseRequest, { id: "123" }, null, "/users/123");
const finalHandler = () => Promise.resolve(new Response("ok"));

const passThroughMiddleware: Middleware = async (_ctx, next) => {
  return await next();
};

const earlyReturnMiddleware: Middleware = (_ctx, _next) => {
  return Promise.resolve(new Response("blocked"));
};

const modifyResponseMiddleware: Middleware = async (_ctx, next) => {
  const response = await next();
  return new Response(response.body, {
    status: response.status,
    headers: { ...Object.fromEntries(response.headers), "X-Modified": "true" },
  });
};

const timerMiddleware: Middleware = async (_ctx, next) => {
  const start = performance.now();
  const response = await next();
  void (performance.now() - start);
  return response;
};

Deno.bench("middleware - compose empty array", () => {
  compose([]);
});

Deno.bench("middleware - compose 1 middleware", () => {
  compose([passThroughMiddleware]);
});

Deno.bench("middleware - compose 3 middleware", () => {
  compose([
    passThroughMiddleware,
    passThroughMiddleware,
    passThroughMiddleware,
  ]);
});

Deno.bench("middleware - compose 10 middleware", () => {
  compose(Array(10).fill(passThroughMiddleware));
});

const composed1 = compose([passThroughMiddleware]);
const composed3 = compose([
  passThroughMiddleware,
  passThroughMiddleware,
  passThroughMiddleware,
]);
const composed5 = compose([
  passThroughMiddleware,
  passThroughMiddleware,
  passThroughMiddleware,
  passThroughMiddleware,
  passThroughMiddleware,
]);
const composed10 = compose(Array(10).fill(passThroughMiddleware));

Deno.bench("middleware - execute 1 pass-through", async () => {
  await composed1(ctx, finalHandler);
});

Deno.bench("middleware - execute 3 pass-through", async () => {
  await composed3(ctx, finalHandler);
});

Deno.bench("middleware - execute 5 pass-through", async () => {
  await composed5(ctx, finalHandler);
});

Deno.bench("middleware - execute 10 pass-through", async () => {
  await composed10(ctx, finalHandler);
});

const composedEarlyReturn = compose([
  earlyReturnMiddleware,
  passThroughMiddleware,
  passThroughMiddleware,
]);

Deno.bench("middleware - early return (skip chain)", async () => {
  await composedEarlyReturn(ctx, finalHandler);
});

const composedWithModify = compose([
  passThroughMiddleware,
  modifyResponseMiddleware,
  passThroughMiddleware,
]);

Deno.bench("middleware - with response modification", async () => {
  await composedWithModify(ctx, finalHandler);
});

const composedTimer = compose([timerMiddleware]);

Deno.bench("middleware - timer middleware", async () => {
  await composedTimer(ctx, finalHandler);
});

const composedRealistic = compose([
  timerMiddleware,
  passThroughMiddleware,
  modifyResponseMiddleware,
]);

Deno.bench("middleware - realistic chain (timer + auth + modify)", async () => {
  await composedRealistic(ctx, finalHandler);
});

Deno.bench("middleware - direct handler (no middleware)", async () => {
  await finalHandler();
});

const singleMiddlewareManual: Middleware = passThroughMiddleware;

Deno.bench("middleware - single without compose", async () => {
  await singleMiddlewareManual(ctx, finalHandler);
});

Deno.bench("middleware - Promise.resolve overhead", async () => {
  await Promise.resolve(new Response("ok"));
});

Deno.bench("middleware - sync to async conversion", async () => {
  const syncFn = () => new Response("ok");
  await Promise.resolve(syncFn());
});

const nestedMiddleware: Middleware = async (ctx, next) => {
  const innerComposed = compose([passThroughMiddleware, passThroughMiddleware]);
  return await innerComposed(ctx, next);
};

const composedNested = compose([nestedMiddleware]);

Deno.bench("middleware - nested compose", async () => {
  await composedNested(ctx, finalHandler);
});

const stateMiddleware: Middleware = async (ctx, next) => {
  ctx.state.startTime = Date.now();
  const response = await next();
  ctx.state.endTime = Date.now();
  return response;
};

const composedState = compose([stateMiddleware]);

Deno.bench("middleware - with state mutation", async () => {
  await composedState(ctx, finalHandler);
});

function composeOptimized(middleware: Middleware[]): Middleware {
  const len = middleware.length;
  if (len === 0) {
    return (_ctx, next) => next();
  }
  if (len === 1) {
    return middleware[0];
  }
  return function (
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
      if (!fn) return Promise.resolve(new Response(null, { status: 404 }));
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return dispatch(0);
  };
}

const composedOpt3 = composeOptimized([
  passThroughMiddleware,
  passThroughMiddleware,
  passThroughMiddleware,
]);

Deno.bench("middleware - optimized compose execute 3", async () => {
  await composedOpt3(ctx, finalHandler);
});

const composedOpt1 = composeOptimized([passThroughMiddleware]);

Deno.bench("middleware - optimized compose execute 1 (fast path)", async () => {
  await composedOpt1(ctx, finalHandler);
});
