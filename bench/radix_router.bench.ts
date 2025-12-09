/**
 * Benchmark comparing RegExp Router vs Radix Tree Router
 */

import { Router } from "../packages/router/src/router.ts";
import { RadixRouter } from "../packages/router/src/radix.ts";

// Create routers
const regexRouter = new Router();
const radixRouter = new RadixRouter();

// Register identical routes
const routes = [
  { method: "GET" as const, path: "/health" },
  { method: "GET" as const, path: "/metrics" },
  { method: "GET" as const, path: "/users" },
  { method: "GET" as const, path: "/users/:id" },
  { method: "POST" as const, path: "/users" },
  { method: "PUT" as const, path: "/users/:id" },
  { method: "DELETE" as const, path: "/users/:id" },
  { method: "GET" as const, path: "/users/:userId/posts" },
  { method: "GET" as const, path: "/users/:userId/posts/:postId" },
  { method: "POST" as const, path: "/users/:userId/posts" },
  {
    method: "GET" as const,
    path: "/orgs/:orgId/teams/:teamId/members/:memberId",
  },
  { method: "GET" as const, path: "/static/*" },
];

const handler = () => ({});

for (const route of routes) {
  regexRouter.add(route.method, route.path, handler);
  radixRouter.add(route.method, route.path, handler);
}

// Static route benchmark
Deno.bench("regex - static /health", () => {
  regexRouter.find("GET", "/health");
});

Deno.bench("radix - static /health", () => {
  radixRouter.find("GET", "/health");
});

// Single param benchmark
Deno.bench("regex - param /users/:id", () => {
  regexRouter.find("GET", "/users/abc123");
});

Deno.bench("radix - param /users/:id", () => {
  radixRouter.find("GET", "/users/abc123");
});

// Multiple params benchmark
Deno.bench("regex - multi /users/:userId/posts/:postId", () => {
  regexRouter.find("GET", "/users/123/posts/456");
});

Deno.bench("radix - multi /users/:userId/posts/:postId", () => {
  radixRouter.find("GET", "/users/123/posts/456");
});

// Deep nested params
Deno.bench("regex - deep /orgs/:a/teams/:b/members/:c", () => {
  regexRouter.find("GET", "/orgs/1/teams/2/members/3");
});

Deno.bench("radix - deep /orgs/:a/teams/:b/members/:c", () => {
  radixRouter.find("GET", "/orgs/1/teams/2/members/3");
});

// Wildcard
Deno.bench("regex - wildcard /static/*", () => {
  regexRouter.find("GET", "/static/js/app.min.js");
});

Deno.bench("radix - wildcard /static/*", () => {
  radixRouter.find("GET", "/static/js/app.min.js");
});

// Not found
Deno.bench("regex - not found /xyz", () => {
  regexRouter.find("GET", "/xyz");
});

Deno.bench("radix - not found /xyz", () => {
  radixRouter.find("GET", "/xyz");
});

// === Large Route Table Tests ===

// Create routers with 100 routes
const regexRouter100 = new Router();
const radixRouter100 = new RadixRouter();

for (let i = 0; i < 100; i++) {
  regexRouter100.add("GET", `/api/v1/resource${i}/:id`, handler);
  radixRouter100.add("GET", `/api/v1/resource${i}/:id`, handler);
}

Deno.bench("regex - 100 routes (first)", () => {
  regexRouter100.find("GET", "/api/v1/resource0/123");
});

Deno.bench("radix - 100 routes (first)", () => {
  radixRouter100.find("GET", "/api/v1/resource0/123");
});

Deno.bench("regex - 100 routes (middle)", () => {
  regexRouter100.find("GET", "/api/v1/resource50/123");
});

Deno.bench("radix - 100 routes (middle)", () => {
  radixRouter100.find("GET", "/api/v1/resource50/123");
});

Deno.bench("regex - 100 routes (last)", () => {
  regexRouter100.find("GET", "/api/v1/resource99/123");
});

Deno.bench("radix - 100 routes (last)", () => {
  radixRouter100.find("GET", "/api/v1/resource99/123");
});

// Create routers with 500 routes
const regexRouter500 = new Router();
const radixRouter500 = new RadixRouter();

for (let i = 0; i < 500; i++) {
  regexRouter500.add("GET", `/api/v2/entity${i}/:id/sub/:subId`, handler);
  radixRouter500.add("GET", `/api/v2/entity${i}/:id/sub/:subId`, handler);
}

Deno.bench("regex - 500 routes (last)", () => {
  regexRouter500.find("GET", "/api/v2/entity499/abc/sub/xyz");
});

Deno.bench("radix - 500 routes (last)", () => {
  radixRouter500.find("GET", "/api/v2/entity499/abc/sub/xyz");
});
