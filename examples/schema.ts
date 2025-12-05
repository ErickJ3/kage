import { Kage, t } from "../packages/core/src/mod.ts";

const app = new Kage({ development: true })
  .post("/users", {
    schemas: {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        email: t.String({ format: "email" }),
        age: t.Optional(t.Integer({ minimum: 0, maximum: 150 })),
        tags: t.Optional(t.Array(t.String())),
      }),
    },
    handler: (ctx) =>
      ctx.json(
        {
          created: true,
          user: {
            ...ctx.body,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          },
        },
        201,
      ),
  })
  .get("/search", {
    schemas: {
      query: t.Object({
        q: t.String({ minLength: 1 }),
        limit: t.Optional(t.String({ pattern: "^\\d+$" })),
        offset: t.Optional(t.String({ pattern: "^\\d+$" })),
      }),
    },
    handler: (ctx) =>
      ctx.json({
        query: ctx.query.q,
        limit: ctx.query.limit ? parseInt(ctx.query.limit) : 10,
        offset: ctx.query.offset ? parseInt(ctx.query.offset) : 0,
        results: [],
      }),
  })
  .get("/users/:id", {
    schemas: {
      params: t.Object({
        id: t.String({ format: "uuid" }),
      }),
    },
    handler: (ctx) =>
      ctx.json({
        id: ctx.params.id,
        name: "User",
        email: "user@example.com",
      }),
  });

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Schema sample running on http://${hostname}:${port}`);
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
