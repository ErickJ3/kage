import { Kage } from "../mod.ts";

type AppDecorators = {
  db: { name: string; query: (sql: string) => unknown[] };
};

type AppState = {
  requestCount: number;
};

// user router: can be in a separate file (routes/route.users.ts)
const usersRouter = new Kage<AppDecorators, AppState>()
  .get("/", (c) => ({
    users: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ],
    db: c.db.name,
  }))
  .get("/:id", (c) => ({
    id: c.params.id,
    name: `User ${c.params.id}`,
  }))
  .post("/", () => ({
    created: true,
    id: crypto.randomUUID(),
  }));

// posts router: standalone, no parent dependencies (routes/route.posts.ts)
const postsRouter = new Kage()
  .get("/", () => ({
    posts: [
      { id: 1, title: "Hello World" },
      { id: 2, title: "Getting Started with Kage" },
    ],
  }))
  .get("/:id", (c) => ({
    id: c.params.id,
    title: `Post ${c.params.id}`,
  }));

// auth router with prefix (routes/route.auth.ts)
const authRouter = new Kage<AppDecorators>({ prefix: "/auth" })
  .get("/login", () => ({ form: "login" }))
  .post("/login", () => ({ success: true, token: "jwt-token" }))
  .post("/logout", () => ({ success: true }))
  .get("/me", (c) => ({
    user: { id: 1, name: "Current User" },
    dbConnected: c.db.name,
  }));

const app = new Kage()
  .decorate("db", {
    name: "main-db",
    query: (sql: string) => {
      console.log(`Executing: ${sql}`);
      return [];
    },
  })
  .state("requestCount", 0)
  .mount("/api/users", usersRouter)
  .mount("/api/posts", postsRouter)
  .mount(authRouter)
  .get("/", (c) =>
    c.json({
      message: "Welcome to Kage!",
      endpoints: {
        users: "/api/users",
        posts: "/api/posts",
        auth: "/auth",
        health: "/health",
      },
    }))
  .get("/health", (c) => ({
    status: "ok",
    db: c.db.name,
    requests: c.store.requestCount,
  }));

await app.listen({
  port: 8080,
  onListen: ({ hostname, port }) => {
    console.log(`Server running on http://${hostname}:${port}`);
    console.log("\nEndpoints:");
    console.log("  GET  http://localhost:8080/");
    console.log("  GET  http://localhost:8080/health");
    console.log("");
    console.log("  Users:");
    console.log("  GET  http://localhost:8080/api/users");
    console.log("  GET  http://localhost:8080/api/users/123");
    console.log("  POST http://localhost:8080/api/users");
    console.log("");
    console.log("  Posts:");
    console.log("  GET  http://localhost:8080/api/posts");
    console.log("  GET  http://localhost:8080/api/posts/456");
    console.log("");
    console.log("  Auth:");
    console.log("  GET  http://localhost:8080/auth/login");
    console.log("  POST http://localhost:8080/auth/login");
    console.log("  POST http://localhost:8080/auth/logout");
    console.log("  GET  http://localhost:8080/auth/me");
  },
});
