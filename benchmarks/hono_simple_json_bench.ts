/**
 * Simple JSON benchmark for Hono - no middleware, just return array of users
 */

import { Hono } from "npm:hono@4";

const users = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
  { id: 3, name: "Charlie", email: "charlie@example.com" },
  { id: 4, name: "Diana", email: "diana@example.com" },
  { id: 5, name: "Eve", email: "eve@example.com" },
];

const app = new Hono();

app.get("/users", (c) => c.json(users));

console.log("Starting Hono benchmark server on http://localhost:3002");

Deno.serve({ port: 3002 }, app.fetch);
