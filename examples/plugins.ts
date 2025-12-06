import { Kage } from "../packages/core/src/mod.ts";

// adds a version decorator
function version<
  TD extends Record<string, unknown>,
  TS extends Record<string, unknown>,
  TDR extends Record<string, unknown>,
>(app: Kage<TD, TS, TDR>) {
  return app.decorate("version", "1.0.0");
}

// factory: configurable request counter
function counter(options: { logEvery?: number } = {}) {
  const logEvery = options.logEvery ?? 10;

  return <
    TD extends Record<string, unknown>,
    TS extends Record<string, unknown>,
    TDR extends Record<string, unknown>,
  >(app: Kage<TD, TS, TDR>) =>
    app
      .state("requestCount", 0)
      .onAfterHandle((ctx, response) => {
        ctx.store.requestCount++;
        if (ctx.store.requestCount % logEvery === 0) {
          console.log(`[counter] ${ctx.store.requestCount} requests served`);
        }
        return response;
      });
}

// authentication with derive
function auth<
  TD extends Record<string, unknown>,
  TS extends Record<string, unknown>,
  TDR extends Record<string, unknown>,
>(app: Kage<TD, TS, TDR>) {
  return app.derive((ctx) => {
    const token = ctx.request.headers.get("Authorization");
    if (!token?.startsWith("Bearer ")) {
      return { user: null, isAuthenticated: false as const };
    }
    const userId = token.slice(7);
    return {
      user: { id: userId, name: `User ${userId}` },
      isAuthenticated: true as const,
    };
  });
}

// adds timing state
function timing<
  TD extends Record<string, unknown>,
  TS extends Record<string, unknown>,
  TDR extends Record<string, unknown>,
>(app: Kage<TD, TS, TDR>) {
  return app
    .state("startTime", Date.now())
    .onResponse((response) => {
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          "X-Response-Time": `${Date.now()}ms`,
        },
      });
    });
}

const app = new Kage({ development: true })
  .use(version)
  .use(counter({ logEvery: 5 }))
  .use(auth)
  .use(timing)
  .get("/", (ctx) =>
    ctx.json({
      name: "Kage Plugins",
      version: ctx.version,
      requestCount: ctx.store.requestCount,
      endpoints: [
        "GET /",
        "GET /me",
        "GET /admin (protected)",
      ],
    }))
  .get("/me", (ctx) =>
    ctx.json({
      authenticated: ctx.isAuthenticated,
      user: ctx.user,
    }))
  .get("/admin", (ctx) => {
    if (!ctx.isAuthenticated) {
      return ctx.unauthorized("Authentication required");
    }
    return ctx.json({
      message: "Welcome to admin panel",
      user: ctx.user,
    });
  })
  .group("/api", (group) =>
    group
      .derive(() => ({ apiVersion: "v1" }))
      .get("/info", (ctx) =>
        ctx.json({
          apiVersion: ctx.apiVersion,
          user: ctx.user,
        }))
      .get("/stats", (ctx) =>
        ctx.json({
          totalRequests: ctx.store.requestCount,
        })));

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Plugin demo: http://${hostname}:${port}`);
    console.log("\nTry these commands:");
    console.log("  curl http://localhost:8000/");
    console.log("  curl http://localhost:8000/me");
    console.log(
      '  curl -H "Authorization: Bearer alice" http://localhost:8000/me',
    );
    console.log("  curl http://localhost:8000/admin");
    console.log(
      '  curl -H "Authorization: Bearer alice" http://localhost:8000/admin',
    );
    console.log("  curl http://localhost:8000/api/info");
    console.log("  curl http://localhost:8000/api/stats");
  },
});
