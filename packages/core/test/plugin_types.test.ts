import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Kage, type P } from "../src/mod.ts";

function createHandler<
  TDecorators extends Record<string, unknown>,
  TState extends Record<string, unknown>,
  TDerived extends Record<string, unknown>,
>(
  app: Kage<TDecorators, TState, TDerived>,
): (req: Request) => Promise<Response> {
  return (app as unknown as {
    handleRequest: (req: Request) => Promise<Response>;
  }).handleRequest.bind(app);
}

describe("Plugin inference", () => {
  it("should infer types from factory plugin with config", async () => {
    function myPlugin(options: { prefix?: string } = {}) {
      const prefix = options.prefix ?? "default";

      return <TD extends P, TS extends P, TDR extends P>(
        app: Kage<TD, TS, TDR>,
      ) =>
        app
          .decorate("pluginPrefix", prefix)
          .state("counter", 0)
          .derive(() => ({
            requestId: `${prefix}-${Date.now()}`,
          }));
    }

    const app = new Kage()
      .use(myPlugin({ prefix: "test" }))
      .get("/", (ctx) => {
        const prefix: string = ctx.pluginPrefix;
        const counter: number = ctx.store.counter;
        const requestId: string = ctx.requestId;

        ctx.store.counter++;

        return ctx.json({ prefix, counter, requestId });
      });

    const handler = createHandler(app);
    const response = await handler(new Request("http://localhost/"));
    const data = await response.json();

    assertEquals(data.prefix, "test");
    assertEquals(data.counter, 0);
    assertEquals(typeof data.requestId, "string");
    assertEquals(data.requestId.startsWith("test-"), true);
  });

  it("should infer types from simple plugin", async () => {
    function simplePlugin<TD extends P, TS extends P, TDR extends P>(
      app: Kage<TD, TS, TDR>,
    ) {
      return app.decorate("version", "1.0.0" as const);
    }

    const app = new Kage()
      .use(simplePlugin)
      .get("/", (ctx) => {
        const version: "1.0.0" = ctx.version;
        return ctx.json({ version });
      });

    const handler = createHandler(app);
    const response = await handler(new Request("http://localhost/"));
    const data = await response.json();

    assertEquals(data.version, "1.0.0");
  });

  it("should chain multiple factory plugins with correct types", async () => {
    function authPlugin(secret: string) {
      return <TD extends P, TS extends P, TDR extends P>(
        app: Kage<TD, TS, TDR>,
      ) =>
        app.derive(({ headers }) => ({
          isAuth: headers.get("authorization") === secret,
        }));
    }

    function counterPlugin(logEvery: number) {
      return <TD extends P, TS extends P, TDR extends P>(
        app: Kage<TD, TS, TDR>,
      ) =>
        app.state("requests", 0).onAfterHandle((ctx, res) => {
          ctx.store.requests++;
          if (ctx.store.requests % logEvery === 0) {
            console.log(`Requests: ${ctx.store.requests}`);
          }
          return res;
        });
    }

    const app = new Kage()
      .use(authPlugin("secret123"))
      .use(counterPlugin(10))
      .get("/", (ctx) => {
        return ctx.json({
          isAuth: ctx.isAuth,
          requests: ctx.store.requests,
        });
      });

    const handler = createHandler(app);

    const res1 = await handler(new Request("http://localhost/"));
    assertEquals(await res1.json(), { isAuth: false, requests: 0 });

    const res2 = await handler(
      new Request("http://localhost/", {
        headers: { authorization: "secret123" },
      }),
    );
    assertEquals(await res2.json(), { isAuth: true, requests: 1 });
  });
});
