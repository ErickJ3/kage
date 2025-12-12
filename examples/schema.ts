import { Kage } from "../mod.ts";
import { z } from "zod";

const app = new Kage()
  .post(
    "/users",
    {
      body: z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        age: z.number().int().min(0).max(150).optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    (c) => (
      {
        created: true,
        user: {
          ...c.body,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
      }
    ),
  )
  .get(
    "/search",
    {
      query: z.object({
        q: z.string().min(1),
        limit: z.string().regex(/^\d+$/).optional(),
        offset: z.string().regex(/^\d+$/).optional(),
      }),
    },
    (c) =>
      c.json({
        query: c.query.q,
        limit: c.query.limit ? parseInt(c.query.limit) : 10,
        offset: c.query.offset ? parseInt(c.query.offset) : 0,
        results: [],
      }),
  )
  .get(
    "/users/:id",
    {
      params: z.object({
        id: z.string().uuid(),
      }),
    },
    (c) =>
      c.json({
        id: c.params.id,
        name: "User",
        email: "user@example.com",
      }),
  );

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
