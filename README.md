# Kage (影)

A Deno-native web framework for speed and security, multi-tenant APIs.

Pronounced "kahg" (rhymes with "lodge").

## Why Kage?

Frameworks like Hono and Oak target multiple runtimes. Kage doesn't — it's built exclusively for Deno and takes full advantage of it: declarative permissions per route, transparent workers, and tenant isolation as first-class concepts.

## Benchmarks

| Scenario         | Kage       | Hono   | Oak    |
| ---------------- | ---------- | ------ | ------ |
| Simple route     | **56,572** | 46,862 | 24,688 |
| Parameterized    | **57,340** | 42,703 | 25,852 |
| JSON parsing     | **24,925** | 21,630 | 14,229 |
| Middleware chain | **59,449** | 42,462 | 25,177 |

_req/s with oha (100 connections, 10s) on Intel i5-11300H_

## Installation

```typescript
import { Kage, t } from "jsr:@kage/core";
```

## Example

```typescript
import { Kage, t } from "@kage/core";

new Kage()
  .get("/users", {
    permissions: ["net:api.example.com"], // optional
    handler: async (ctx) => {
      const users = await fetch("https://api.example.com/users");
      return ctx.json(await users.json());
    },
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
