import { Kage, type P } from "../packages/core/src/mod.ts";

function version<TD extends P, TS extends P, TDR extends P>(
  app: Kage<TD, TS, TDR>,
) {
  return app.decorate("version", "1.0.0");
}

function counter(options: { logEvery?: number } = {}) {
  const logEvery = options.logEvery ?? 10;

  return <TD extends P, TS extends P, TDR extends P>(app: Kage<TD, TS, TDR>) =>
    app.state("requestCount", 0).onAfterHandle((c, res) => {
      c.store.requestCount++;

      if (c.store.requestCount % logEvery === 0) {
        console.log(`[counter] ${c.store.requestCount} requests`);
      }

      return res;
    });
}

function auth<TD extends P, TS extends P, TDR extends P>(
  app: Kage<TD, TS, TDR>,
) {
  return app.derive((c) => {
    const token = c.headers.get("Authorization");

    if (!token?.startsWith("Bearer ")) {
      return { user: null, isAuthenticated: false as const };
    }

    return {
      user: { id: token.slice(7), name: `User ${token.slice(7)}` },
      isAuthenticated: true as const,
    };
  });
}

function timing<TD extends P, TS extends P, TDR extends P>(
  app: Kage<TD, TS, TDR>,
) {
  return app
    .onRequest((_, c) => {
      c.set("startTime", performance.now());
      return null;
    })
    .onResponse((res, _, c) => {
      const start = c.get<number>("startTime") ?? 0;
      const duration = (performance.now() - start).toFixed(2);
      const headers = new Headers(res.headers);

      headers.set("X-Response-Time", `${duration}ms`);

      return new Response(res.body, {
        status: res.status,
        headers,
      });
    });
}

const app = new Kage()
  .use(version)
  .use(counter({ logEvery: 5 }))
  .use(auth)
  .use(timing)
  .get("/", (c) =>
    c.json({
      version: c.version,
      requests: c.store.requestCount,
      endpoints: ["GET /", "GET /me", "GET /admin", "GET /api/info"],
    }))
  .get("/me", (c) => c.json({ authenticated: c.isAuthenticated, user: c.user }))
  .group("/admin", (group) =>
    group
      .use((g) =>
        g.onBeforeHandle((c) =>
          c.isAuthenticated
            ? undefined
            : c.unauthorized("Authentication required")
        )
      )
      .get("/", (c) => c.json({ message: "Admin panel", user: c.user }))
      .get("/stats", (c) => c.json({ requests: c.store.requestCount })))
  .group("/api", (group) =>
    group
      .derive(() => ({ apiVersion: "v1" }))
      .get("/info", (c) => c.json({ apiVersion: c.apiVersion, user: c.user })));

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Plugins: http://${hostname}:${port}`);
  },
});
