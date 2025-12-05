import { Kage, t } from "../packages/core/src/mod.ts";

const app = new Kage({ development: true })
  .get("/", (ctx) =>
    ctx.json({
      name: "Kage Middleware Demo",
      endpoints: [
        "GET /public",
        "GET /protected",
        "POST /users",
        "GET /search?q=<query>",
        "GET /users/:id",
        "DELETE /users/:id",
        "GET /html",
        "GET /redirect",
      ],
    }))
  .get("/public", (ctx) =>
    ctx.json({
      message: "Public endpoint",
      timestamp: new Date().toISOString(),
    }))
  .get("/protected", (ctx) => {
    const token = ctx.headers.get("Authorization");
    if (!token) return ctx.unauthorized("Missing token");
    if (token !== "Bearer secret") return ctx.forbidden("Invalid token");
    return ctx.json({
      message: "Protected data",
      user: { id: 1, name: "Alice" },
    });
  })
  .post("/users", {
    schemas: {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
      }),
    },
    handler: (ctx) =>
      ctx.json({
        id: crypto.randomUUID(),
        ...ctx.body,
        createdAt: new Date().toISOString(),
      }, 201),
  })
  .get("/search", {
    schemas: {
      query: t.Object({
        q: t.String({ minLength: 1 }),
        limit: t.Optional(t.String()),
      }),
    },
    handler: (ctx) =>
      ctx.json({
        query: ctx.query.q,
        limit: ctx.query.limit ? parseInt(ctx.query.limit) : 10,
        results: [
          { id: 1, title: `Result for "${ctx.query.q}"` },
          { id: 2, title: `Another result for "${ctx.query.q}"` },
        ],
      }),
  })
  .get("/users/:id", (ctx) => {
    if (ctx.params.id === "999") return ctx.notFound("User not found");
    return ctx.json({
      id: ctx.params.id,
      name: `User ${ctx.params.id}`,
      email: `user${ctx.params.id}@example.com`,
    });
  })
  .delete("/users/:id", (ctx) => ctx.noContent())
  .get("/html", (ctx) =>
    ctx.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Kage</title></head>
        <body><h1>Hello from Kage!</h1></body>
      </html>
    `))
  .get("/redirect", (ctx) => ctx.redirect("/public"));

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Middleware demo: http://${hostname}:${port}`);
  },
});
