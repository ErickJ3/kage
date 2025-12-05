/**
 * Middleware system demonstration.
 *
 * Shows how to use Context API and compose middleware.
 *
 * Run with:
 *   deno run --allow-net examples/middleware_demo.ts
 */

import type { Context } from "../packages/core/src/mod.ts";
import { Kage } from "../mod.ts";

const app = new Kage({
  development: true,
});

// Public endpoint - no auth required
app.get("/public", (ctx) =>
  ctx.json({
    message: "This is a public endpoint",
    timestamp: new Date().toISOString(),
  }));

// Protected endpoint - requires auth
// In a full implementation, this would use app.use(authMiddleware)
app.get("/protected", (ctx: Context) => {
  // Simulate auth check (will be middleware in future)
  const token = ctx.headers.get("Authorization");

  if (!token) {
    return ctx.unauthorized("Missing authorization token");
  }

  if (token !== "Bearer secret-token") {
    return ctx.forbidden("Invalid token");
  }

  // Access user from state (set by auth middleware)
  return ctx.json({
    message: "This is a protected endpoint",
    user: {
      id: 123,
      name: "Alice",
      role: "admin",
    },
  });
});

// Example using context helpers
app.post("/users", async (ctx: Context) => {
  // Parse JSON body
  const body = await ctx.bodyJson<{ name: string; email: string }>();

  // Validate (will use schema validation in future)
  if (!body.name || !body.email) {
    return ctx.badRequest("Missing required fields");
  }

  // Create user (simulated)
  const user = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    createdAt: new Date().toISOString(),
  };

  // Return 201 Created
  return ctx.json(user, 201);
});

// Example using query parameters
app.get("/search", (ctx: Context) => {
  const query = ctx.query.get("q");
  const limit = ctx.query.get("limit") || "10";

  if (!query) {
    return ctx.badRequest("Missing search query");
  }

  return ctx.json({
    query,
    limit: parseInt(limit, 10),
    results: [
      { id: 1, title: `Result for "${query}"` },
      { id: 2, title: `Another result for "${query}"` },
    ],
  });
});

// Example using path parameters
app.get("/users/:id", (ctx: Context) => {
  const userId = ctx.params.id;

  // Simulate database lookup
  if (userId === "999") {
    return ctx.notFound("User not found");
  }

  return ctx.json({
    id: userId,
    name: `User ${userId}`,
    email: `user${userId}@example.com`,
  });
});

// Example using different response types
app.get("/html", (ctx: Context) => {
  return ctx.html(`
    <!DOCTYPE html>
    <html>
      <head><title>Kage HTML Response</title></head>
      <body>
        <h1>Hello from Kage!</h1>
        <p>This is an HTML response using ctx.html()</p>
      </body>
    </html>
  `);
});

app.get("/text", (ctx: Context) => {
  return ctx.text("Plain text response");
});

app.get("/redirect", (ctx: Context) => {
  return ctx.redirect("/public");
});

app.delete("/users/:id", (ctx: Context) => {
  // Simulate deletion
  return ctx.noContent();
});

// Error handling example
app.get("/error", () => {
  throw new Error("Something went wrong!");
});

// Info endpoint
app.get("/", (ctx) =>
  ctx.json({
    name: "Kage Middleware Demo",
    version: "0.1.0",
    endpoints: [
      { method: "GET", path: "/public", description: "Public endpoint" },
      {
        method: "GET",
        path: "/protected",
        description: 'Protected endpoint (requires "Bearer secret-token")',
      },
      {
        method: "POST",
        path: "/users",
        description: "Create user (send JSON body)",
      },
      {
        method: "GET",
        path: "/search?q=<query>",
        description: "Search with query params",
      },
      { method: "GET", path: "/users/:id", description: "Get user by ID" },
      { method: "DELETE", path: "/users/:id", description: "Delete user" },
      { method: "GET", path: "/html", description: "HTML response example" },
      { method: "GET", path: "/text", description: "Text response example" },
      { method: "GET", path: "/redirect", description: "Redirect example" },
      { method: "GET", path: "/error", description: "Error handling example" },
    ],
  }));

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Middleware demo running on http://${hostname}:${port}`);
    console.log("\nTry these commands:");
    console.log("  curl http://localhost:8000/");
    console.log("  curl http://localhost:8000/public");
    console.log(
      '  curl -H "Authorization: Bearer secret-token" http://localhost:8000/protected',
    );
    console.log(
      '  curl -X POST -H "Content-Type: application/json" -d \'{"name":"Bob","email":"bob@example.com"}\' http://localhost:8000/users',
    );
    console.log("  curl http://localhost:8000/search?q=deno&limit=5");
    console.log("  curl http://localhost:8000/users/123");
    console.log("  curl http://localhost:8000/html");
    console.log("  curl http://localhost:8000/error");
  },
});
