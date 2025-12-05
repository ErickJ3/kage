/**
 * Simple JSON benchmark - no middleware, just return array of users
 */

import { Kage } from "../packages/core/mod.ts";

const users = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
  { id: 3, name: "Charlie", email: "charlie@example.com" },
  { id: 4, name: "Diana", email: "diana@example.com" },
  { id: 5, name: "Eve", email: "eve@example.com" },
];

const app = new Kage();

app.get("/users", () => users);

console.log("Starting Kage benchmark server on http://localhost:3000");

await app.listen({ port: 3000 });
