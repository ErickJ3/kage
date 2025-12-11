/**
 * Basic server example demonstrating core Kage features.
 *
 * Run with:
 *   deno run --allow-net examples/basic_server.ts
 */

import { Kage } from "../mod.ts";

new Kage()
  .get("/", (ctx) =>
    ctx.json({
      message: "Welcome to Kage!",
      version: "0.1.0",
    }))
  .get("/users/:id", (ctx) =>
    ctx.json({
      userId: ctx.params.id,
      name: `User ${ctx.params.id}`,
    }))
  .get("/orgs/:orgId/repos/:repoId", (ctx) =>
    ctx.json({
      organization: ctx.params.orgId,
      repository: ctx.params.repoId,
    }))
  .post("/users", (ctx) =>
    ctx.json({
      created: true,
      id: crypto.randomUUID(),
    }))
  .get("/custom", (ctx) => {
    return ctx.response("Custom response", {
      status: 201,
      headers: { "X-Custom-Header": "value" },
    });
  })
  .get("/text", (ctx) => ctx.text("Plain text response")).delete(
    "/users/:id",
    (ctx) => ctx.noContent(),
  )
  .listen({
    port: 8000,
    onListen: ({ hostname, port }) => {
      console.log(`Server running on http://${hostname}:${port}`);
      console.log("\nTry these endpoints:");
      console.log("  GET  http://localhost:8000/");
      console.log("  GET  http://localhost:8000/users/123");
      console.log("  GET  http://localhost:8000/orgs/kage/repos/core");
      console.log("  POST http://localhost:8000/users");
      console.log("  GET  http://localhost:8000/custom");
      console.log("  GET  http://localhost:8000/text");
    },
  });
