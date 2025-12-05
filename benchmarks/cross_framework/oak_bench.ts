/**
 * Oak framework benchmark.
 *
 * Run with: deno run --allow-net benchmarks/cross_framework/oak_bench.ts
 */

import { Application, Router } from "@oak/oak";

const PORT = 3000;
const router = new Router();

// Scenario 1: Simple static route
router.get("/", (ctx) => {
  ctx.response.body = { message: "Hello, World!" };
});

// Scenario 2: Parameterized route
router.get("/users/:id", (ctx) => {
  const id = ctx.params.id;
  ctx.response.body = {
    id,
    name: `User ${id}`,
  };
});

// Scenario 3: JSON body parsing
router.post("/users", async (ctx) => {
  const body = await ctx.request.body.json();
  ctx.response.body = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
  };
});

// Scenario 4: Middleware chain
router.get("/middleware", (ctx) => {
  ctx.response.body = { message: "After middleware" };
});

const app = new Application();

// Add middleware
app.use(async (_ctx, next) => {
  await next();
});

app.use(async (_ctx, next) => {
  await next();
});

app.use(async (_ctx, next) => {
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Oak server running on http://localhost:${PORT}`);
console.log("Press Ctrl+C to stop\n");

await app.listen({ port: PORT });
