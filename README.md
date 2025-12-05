# Kage

A Deno-native web framework for secure, multi-tenant APIs.

Pronounced "kahg" (rhymes with "lodge").

## Why Kage?

Frameworks like Hono and Oak target multiple runtimes. Kage doesn't — it's built exclusively for Deno and takes full advantage of it: declarative permissions per route, transparent workers, and tenant isolation as first-class concepts.

## Benchmarks

| Scenario         | Kage       | Hono   | Oak    |
|------------------|------------|--------|--------|
| Simple route     | **88,893** | 70,420 | 37,608 |
| Parameterized    | **84,934** | 69,456 | 39,816 |
| JSON parsing     | **36,220** | 33,532 | 21,025 |
| Middleware chain | **85,140** | 62,547 | 40,377 |

*req/s with oha (100 connections, 10s)*

## Installation

```typescript
import { Kage } from "jsr:@kage/core";
```

## Example

```typescript
import { Kage } from "@kage/core";
import { z } from "zod";

const app = new Kage();

// Route with explicit permissions
app.get("/users", {
  permissions: ["net:api.example.com"],
  handler: async (ctx) => {
    const users = await fetch("https://api.example.com/users");
    return ctx.json(await users.json());
  },
});

// Route with schema validation
app.post("/users", {
  body: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  response: z.object({
    id: z.string(),
    createdAt: z.date(),
  }),
  handler: async (ctx) => {
    const user = ctx.body; // fully typed
    return { id: crypto.randomUUID(), createdAt: new Date() };
  },
});

app.listen({ port: 8000 });
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
