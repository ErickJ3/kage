/**
 * Kage framework benchmark.
 *
 * Run with: deno run --allow-net bench/cross_framework/kage_bench.ts
 */

import { Kage } from "../../mod.ts";

const PORT = 3000;
const app = new Kage();

// Scenario 1: Simple static route
app.get("/", (ctx) => ctx.json({ message: "Hello, World!" }));

// Scenario 2: Parameterized route
app.get("/users/:id", (ctx) =>
  ctx.json({
    id: ctx.params.id,
    name: `User ${ctx.params.id}`,
  }));

// Scenario 3: JSON body parsing
app.post("/users", async (ctx) => {
  const body = await ctx.bodyJson<{ name: string; email: string }>();
  return ctx.json({
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
  });
});

// Scenario 4: Middleware chain
app.use(async (_ctx, next) => {
  return await next();
});

app.use(async (_ctx, next) => {
  return await next();
});

app.use(async (_ctx, next) => {
  return await next();
});

app.get("/middleware", (ctx) => ctx.json({ message: "After middleware" }));

console.log(`Kage server running on http://localhost:${PORT}`);
console.log("Press Ctrl+C to stop\n");

await app.listen({ port: PORT });
