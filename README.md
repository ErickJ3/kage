# Kage (影)

A Deno-native web framework focused on speed and developer experience.

Pronounced "kahg" (rhymes with "lodge").

## Why Kage?

Frameworks like Hono and Oak target multiple runtimes. Kage doesn't — it's built exclusively for Deno and takes full advantage of it: native TypeScript, transparent workers, and maximum performance.

## Benchmarks

| Scenario         | Kage        | Hono       | Oak        |
| ---------------- | ----------- | ---------- | ---------- |
| Simple route     | **97,583**  | 87,428     | 48,135     |
| Parameterized    | **98,433**  | 86,335     | 47,709     |
| JSON parsing     | **45,774**  | 41,221     | 26,451     |
| Middleware chain | **109,522** | 78,552     | 47,238     |

_req/s with oha (100 connections, 10s)_

## Installation

```typescript
import { Kage } from "jsr:@kage/core";
```

## Example

```typescript
import { Kage, t } from "@kage/core";

new Kage()
  .get("/", (ctx) => ctx.json({ message: "Hello, Kage!" }))
  .post("/users", {
    schemas: {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
      }),
    },
    handler: (ctx) => ctx.json({ id: crypto.randomUUID(), ...ctx.body }, 201),
  })
  .listen({ port: 8000 });
```

## Development

```bash
deno task test        # run tests
deno task test:watch  # watch mode
deno task bench       # benchmarks
deno task check       # type check
deno task fmt         # format
deno task lint        # lint
```

## Status

Early development. Not production-ready.

## License

MIT
