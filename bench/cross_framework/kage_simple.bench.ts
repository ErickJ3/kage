/**
 * Kage framework simple benchmark (no middleware).
 *
 * Run with: deno run --allow-net bench/cross_framework/kage_simple_bench.ts
 */

import { Kage } from "../../mod.ts";

const PORT = 3001;
const app = new Kage();

app.get("/", (ctx) => ctx.json({ message: "Hello, World!" }));

console.log(`Kage (simple) server running on http://localhost:${PORT}`);
console.log("Press Ctrl+C to stop\n");

await app.listen({ port: PORT });
