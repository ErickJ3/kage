# Kage (カゲ)

Type-safe web framework for Deno.

Pronounced "kahg" (rhymes with "lodge").

## Why Kage?

Built for Deno with good performance and type safety. Plugin system with decorators and derived values that just work.

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
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ format: "email" }),
    }),
  }, (c) => c.json({ id: crypto.randomUUID(), ...c.body }, 201))
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
