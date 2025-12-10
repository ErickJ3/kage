/**
 * Simple plain-text benchmark - no middleware, just return text
 * Used for measuring raw req/s performance (common benchmark pattern)
 */

import { Kage } from "../packages/core/src/mod.ts";

const app = new Kage();

app.get("/", () => "Hello, World!");

await app.listen({ port: 8080 });
