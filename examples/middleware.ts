import {
  cors,
  errorHandler,
  Kage,
  logger,
  type Middleware,
} from "../packages/core/src/mod.ts";

// rate limiter middleware
function rateLimit(limit: number, windowMs: number): Middleware {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const ip = c.headers.get("x-forwarded-for") ?? "unknown";
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now > record.resetAt) {
      requests.set(ip, { count: 1, resetAt: now + windowMs });
    } else if (record.count >= limit) {
      return c.json({ error: "many requests" }, 429);
    } else {
      record.count++;
    }

    return await next();
  };
}

// request id middleware
function requestId(): Middleware {
  return async (_, next) => {
    const id = crypto.randomUUID();
    const response = await next();
    response.headers.set("X-Request-ID", id);
    return response;
  };
}

// timing header middleware
function timing(): Middleware {
  return async (_, next) => {
    const start = performance.now();
    const response = await next();
    const duration = (performance.now() - start).toFixed(2);
    response.headers.set("X-Response-Time", `${duration}ms`);
    return response;
  };
}

const app = new Kage()
  .use(
    errorHandler((error, c) => {
      console.error(`[ERROR] ${error.message}`);
      return c.json({ error: error.message }, 500);
    }),
  )
  .use(logger())
  .use(cors({ origin: "*", credentials: true }))
  .use(requestId())
  .use(timing())
  .use(rateLimit(100, 60_000)) // 100 req/min
  .get("/", (c) =>
    c.json({
      message: "avaiable middlewares",
      endpoints: ["GET /", "GET /error", "GET /slow"],
    }))
  .get("/error", () => {
    throw new Error("something wrong!");
  })
  .get("/slow", async (c) => {
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ message: "slow response" });
  });

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Kage middlewares: http://${hostname}:${port}`);
  },
});
