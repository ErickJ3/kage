# Kage

Pronounced "kahg" (like "lodge" but with a "k"). The Deno-native framework for
secure, scalable multi-tenant APIs.

## Overview

Kage is a TypeScript-first web framework built exclusively for Deno that
leverages its unique security model and runtime capabilities. Unlike
multi-runtime frameworks, Kage embraces Deno-specific features to provide
permission-aware routing, transparent workers, and first-class multi-tenancy
support.

## Core Philosophy

- **Security by design**: Declarative permissions at the route level
- **Type safety**: End-to-end TypeScript without code generation
- **Edge-first**: Optimized for Deno Deploy and edge runtimes
- **Multi-tenant native**: Isolation and namespacing as primitives
- **Zero compromise**: Performance competitive with fastest frameworks

## Features

- Permission-aware routing with granular Deno permissions per route
- Schema-driven validation with automatic type inference
- Transparent Web Workers for parallel execution
- Multi-tenant isolation with namespace support
- Built for edge deployment on Deno Deploy
- Minimal dependencies, maximum performance

## Status

Early development. Not ready for production use.

## Installation

```typescript
import { Kage } from "jsr:@kage/core";
```

## Quick Start

```typescript
import { Kage } from "@kage/core";
import { z } from "zod";

const app = new Kage();

// Permission-aware route
app.get("/users", {
  permissions: ["net:api.example.com"],
  handler: async (ctx) => {
    const users = await fetch("https://api.example.com/users");
    return ctx.json(await users.json());
  },
});

// Schema-validated route
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
    const user = ctx.body; // Fully typed
    return { id: crypto.randomUUID(), createdAt: new Date() };
  },
});

app.listen({ port: 8000 });
```

## Development

```bash
# Run tests
deno task test

# Run tests in watch mode
deno task test:watch

# Run benchmarks
deno task bench

# Type check
deno task check

# Format code
deno task fmt

# Lint code
deno task lint
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and
architecture decisions.

## License

MIT
