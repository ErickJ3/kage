/**
 * Kage - Deno-native framework for secure, scalable multi-tenant APIs
 *
 * @example
 * ```typescript
 * import { Kage } from "@kage/core";
 *
 * const app = new Kage();
 *
 * app.get("/", () => ({ message: "Hello from Kage!" }));
 *
 * app.listen({ port: 8000 });
 * ```
 *
 * @module
 */

// Core framework exports
export * from "./packages/core/src/mod.ts";

// Router exports
export * from "./packages/router/src/mod.ts";
