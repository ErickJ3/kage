# @kage/core

Deno web framework.

## Install

```typescript
import { Kage, t } from "jsr:@kage/core";
```

## Usage

```typescript
import { Kage, t } from "@kage/core";

const app = new Kage();

app.get("/", (ctx) => ctx.json({ message: "Hello!" }));

app.get("/users/:id", (ctx) => {
  return ctx.json({ id: ctx.params.id });
});

app.listen({ port: 8000 });
```

## License

MIT
