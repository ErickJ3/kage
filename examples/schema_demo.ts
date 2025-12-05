import { type Context, Kage, t } from "../mod.ts";
import { type Infer, validateSchema } from "../packages/schema/src/mod.ts";

const app = new Kage({ development: true });

const userSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  email: t.String({ format: "email" }),
  age: t.Optional(t.Integer({ minimum: 0, maximum: 150 })),
  tags: t.Optional(t.Array(t.String())),
});

app.use(validateSchema({ body: userSchema }));
app.post("/users", (ctx: Context) => {
  const user = ctx.state.validatedBody as Infer<typeof userSchema>;

  return ctx.json(
    {
      created: true,
      user: {
        ...user,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
    },
    201,
  );
});

const searchSchema = t.Object({
  q: t.String({ minLength: 1 }),
  limit: t.Optional(t.String({ pattern: "^\\d+$" })),
  offset: t.Optional(t.String({ pattern: "^\\d+$" })),
});

app.use(validateSchema({ query: searchSchema }));
app.get("/search", (ctx: Context) => {
  const query = ctx.state.validatedQuery as Infer<typeof searchSchema>;

  return ctx.json({
    query: query.q,
    limit: query.limit ? parseInt(query.limit) : 10,
    offset: query.offset ? parseInt(query.offset) : 0,
    results: [],
  });
});

const userParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

app.use(validateSchema({ params: userParamsSchema }));
app.get("/users/:id", (ctx: Context) => {
  const params = ctx.state.validatedParams as Infer<typeof userParamsSchema>;

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
