# Kage (カゲ)

A Deno-native web framework focused on speed and developer experience.

Pronounced "kahg" (rhymes with "lodge").

## Why Kage?

Frameworks like Hono and Oak target multiple runtimes. Kage doesn't — it's built exclusively for Deno and takes full advantage of it: native TypeScript, transparent workers, and maximum performance.

## Installation

```typescript
import { Kage } from "jsr:@kage/core";
```

## Example

```typescript
import { Kage, t } from "@kage/core";

new Kage()
  .get("/", (c) => c.json({ message: "Hello, Kage!" }))
  .post("/users", {
    schemas: {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
      }),
    },
    handler: (c) => c.json({ id: crypto.randomUUID(), ...c.body }, 201),
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
