import { Kage } from "../packages/core/src/mod.ts";

const app = new Kage()
  .decorate("db", { query: (sql: string) => console.log("DB:", sql) })
  .state("globalCounter", 0);

/**
 * methods available in KageGroup:
 * - decorate() - add immutable values
 * - state() - add mutable state
 * - derive() - compute per-request values
 * - onBeforeHandle() - run before handler
 * - onAfterHandle() - run after handler
 * - onRequest() - run before route matching
 * - onResponse() - run after response
 * - onError() - handle errors
 * - group() - create nested groups
 * - use() - apply plugins
 */

app.group("/api", (api) =>
  api
    .state("apiRequestCount", 0)
    .decorate("apiVersion", "v1")
    .derive(({ headers }) => ({
      apiKey: headers.get("x-api-key"),
      requestId: crypto.randomUUID(),
    }))
    .onBeforeHandle((ctx): Response | void => {
      ctx.store.apiRequestCount++;
      console.log(
        `[API] Request #${ctx.store.apiRequestCount}: ${ctx.path}`,
      );
      if (!ctx.apiKey) {
        return ctx.unauthorized("API key required");
      }
    })
    .onAfterHandle((ctx, response) => {
      console.log(`[API] Response status: ${response.status}`);
      const newHeaders = new Headers(response.headers);
      newHeaders.set("X-API-Version", ctx.apiVersion);
      newHeaders.set("X-Request-ID", ctx.requestId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    })
    .onRequest((req, ctx) => {
      ctx.set("startTime", performance.now());
      console.log(`[onRequest] ${req.method} ${req.url}`);
      return null;
    })
    .onResponse((res, _req, ctx) => {
      const start = ctx.get<number>("startTime");
      if (start) {
        const duration = (performance.now() - start).toFixed(2);
        const newHeaders = new Headers(res.headers);
        newHeaders.set("X-Response-Time", `${duration}ms`);
        console.log(`[onResponse] Took ${duration}ms`);
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: newHeaders,
        });
      }
      return res;
    })
    .onError((error, _req, _ctx) => {
      console.error("[API Error]", error);
      return Response.json(
        { error: "API Error", message: String(error) },
        { status: 500 },
      );
    })
    .group("/users", (users) =>
      users
        .derive(() => ({ resource: "users" as const }))
        .get("/", (ctx) =>
          ctx.json({
            resource: ctx.resource,
            apiVersion: ctx.apiVersion,
            users: [],
          }))
        .get("/:id", (ctx) =>
          ctx.json({
            resource: ctx.resource,
            id: ctx.params.id,
          })))
    .group("/posts", (posts) =>
      posts
        .state("postCount", 0)
        .derive(() => ({ resource: "posts" as const }))
        .get("/", (ctx) =>
          ctx.json({
            resource: ctx.resource,
            posts: [],
          }))
        .post("/", (ctx) => {
          ctx.store.postCount++;
          return ctx.json({
            message: "Post created",
            totalPosts: ctx.store.postCount,
          });
        }))
    .get("/", (ctx) => {
      ctx.db.query("SELECT 1");
      return ctx.json({
        version: ctx.apiVersion,
        requestId: ctx.requestId,
        globalCounter: ctx.store.globalCounter,
        apiRequestCount: ctx.store.apiRequestCount,
      });
    })
    .get("/health", (ctx) =>
      ctx.json({
        status: "ok",
        version: ctx.apiVersion,
      })));

app.get("/", (ctx) => {
  ctx.store.globalCounter++;
  return ctx.json({
    message: "Root",
    globalCounter: ctx.store.globalCounter,
  });
});

console.log("Starting server on http://localhost:8000");
console.log("\nTry these endpoints:");
console.log("  curl http://localhost:8000/");
console.log("  curl http://localhost:8000/api/ -H 'x-api-key: test'");
console.log("  curl http://localhost:8000/api/health -H 'x-api-key: test'");
console.log("  curl http://localhost:8000/api/users/ -H 'x-api-key: test'");
console.log("  curl http://localhost:8000/api/users/123 -H 'x-api-key: test'");
console.log("  curl http://localhost:8000/api/posts/ -H 'x-api-key: test'");
console.log(
  "  curl -X POST http://localhost:8000/api/posts/ -H 'x-api-key: test'",
);

app.listen({ port: 8000 });
