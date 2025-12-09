/**
 * Hono framework benchmark.
 *
 * Run with: deno run --allow-net bench/cross_framework/hono_bench.ts
 */

import { Hono } from "hono";

const PORT = 3000;
const app = new Hono();

// Scenario 1: Simple static route
app.get("/", (c) => c.json({ message: "Hello, World!" }));

// Scenario 2: Parameterized route
app.get("/users/:id", (c) => {
  const id = c.req.param("id");
  return c.json({
    id,
    name: `User ${id}`,
  });
});

// Scenario 3: JSON body parsing
app.post("/users", async (c) => {
  const body = await c.req.json<{ name: string; email: string }>();
  return c.json({
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
  });
});

// Scenario 4: Middleware chain
app.use(async (_c, next) => {
  await next();
});

app.use(async (_c, next) => {
  await next();
});

app.use(async (_c, next) => {
  await next();
});

app.get("/middleware", (c) => c.json({ message: "After middleware" }));

console.log(`Hono server running on http://localhost:${PORT}`);
console.log("Press Ctrl+C to stop\n");

Deno.serve({ port: PORT }, app.fetch);
