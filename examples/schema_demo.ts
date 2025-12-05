/**
 * Schema validation demonstration with Zod.
 *
 * Run with:
 *   deno run --allow-net examples/schema_demo.ts
 */

import { type Context, Kage } from "../mod.ts";
import { validateSchema, z } from "../packages/schema/mod.ts";

const app = new Kage({ development: true });

// User schema with validation rules
const userSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().max(150).optional(),
  tags: z.array(z.string()).optional(),
});

// Create user with schema validation
app.use(validateSchema({ body: userSchema }));
app.post("/users", (ctx: Context) => {
  // Body is automatically validated - access from state
  const user = ctx.state.validatedBody as z.infer<typeof userSchema>;

  return ctx.json({
    created: true,
    user: {
      ...user,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
  }, 201);
});

// Query validation example
const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

app.use(validateSchema({ query: searchSchema }));
app.get("/search", (ctx: Context) => {
  const query = ctx.state.validatedQuery as z.infer<typeof searchSchema>;

  return ctx.json({
    query: query.q,
    limit: query.limit ? parseInt(query.limit) : 10,
    offset: query.offset ? parseInt(query.offset) : 0,
    results: [],
  });
});

// Path params validation
const userParamsSchema = z.object({
  id: z.string().uuid(),
});

app.use(validateSchema({ params: userParamsSchema }));
app.get("/users/:id", (ctx: Context) => {
  const params = ctx.state.validatedParams as z.infer<typeof userParamsSchema>;

  return ctx.json({
    id: params.id,
    name: "User",
    email: "user@example.com",
  });
});

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Schema demo running on http://${hostname}:${port}`);
    console.log("\nTry these commands:");
    console.log(
      '  curl -X POST -H "Content-Type: application/json" -d \'{"name":"Alice","email":"alice@example.com","age":30}\' http://localhost:8000/users',
    );
    console.log(
      '  curl -X POST -H "Content-Type: application/json" -d \'{"name":"","email":"invalid"}\' http://localhost:8000/users',
    );
    console.log("  curl http://localhost:8000/search?q=test&limit=5");
    console.log(
      "  curl http://localhost:8000/users/123e4567-e89b-12d3-a456-426614174000",
    );
    console.log("  curl http://localhost:8000/users/invalid-uuid");
  },
});
