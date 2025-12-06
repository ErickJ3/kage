import { ContextPool } from "../packages/core/src/context/pool.ts";

const baseRequest = new Request("http://localhost:8000/users/123");
const params = { id: "123" };

Deno.bench("pool - acquire from empty", () => {
  const pool = new ContextPool(256);
  pool.acquire(baseRequest, params, null, "/users/123");
});

const preallocatedPool = new ContextPool(256);
preallocatedPool.preallocate(64);

Deno.bench("pool - acquire from preallocated", () => {
  const ctx = preallocatedPool.acquire(baseRequest, params, null, "/users/123");
  preallocatedPool.release(ctx);
});

Deno.bench("pool - acquire + release cycle", () => {
  const pool = new ContextPool(256);
  pool.preallocate(1);
  const ctx = pool.acquire(baseRequest, params, null, "/users/123");
  pool.release(ctx);
});

const cyclePool = new ContextPool(256);
cyclePool.preallocate(100);

Deno.bench("pool - 10 acquire/release cycles", () => {
  const contexts = [];
  for (let i = 0; i < 10; i++) {
    contexts.push(cyclePool.acquire(baseRequest, params, null, "/users/123"));
  }
  for (const ctx of contexts) {
    cyclePool.release(ctx);
  }
});

Deno.bench("pool - preallocate 64", () => {
  const pool = new ContextPool(256);
  pool.preallocate(64);
});

Deno.bench("pool - preallocate 128", () => {
  const pool = new ContextPool(256);
  pool.preallocate(128);
});

const fullPool = new ContextPool(10);
fullPool.preallocate(10);

Deno.bench("pool - release when full (discard)", () => {
  const ctx = fullPool.acquire(baseRequest, params, null, "/users/123");
  for (let i = 0; i < 10; i++) {
    fullPool.release(fullPool.acquire(baseRequest, params, null, "/"));
  }
  fullPool.release(ctx);
});

Deno.bench("pool - size check", () => {
  preallocatedPool.size();
});

Deno.bench("pool - clear", () => {
  const pool = new ContextPool(256);
  pool.preallocate(64);
  pool.clear();
});
