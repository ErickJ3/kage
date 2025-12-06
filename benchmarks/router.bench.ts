/**
 * Performance benchmarks for the Router module.
 *
 * Benchmarks cover:
 * - Static route matching
 * - Dynamic parameter extraction
 * - Multiple parameters
 * - Large route tables
 * - Route registration overhead
 */

import { Router } from "../packages/router/src/mod.ts";

/**
 * Benchmark: Static route lookup
 *
 * Measures raw performance of exact string matching without parameters.
 * This is the fastest path and sets the baseline for router performance.
 */
Deno.bench("router - static route lookup", () => {
  const router = new Router();
  router.add("GET", "/users", () => ({ users: [] }));
  router.find("GET", "/users");
});

/**
 * Benchmark: Single parameter route
 *
 * Measures parameter extraction performance.
 * Most real-world APIs have routes with at least one parameter.
 */
Deno.bench("router - single parameter", () => {
  const router = new Router();
  router.add("GET", "/users/:id", () => ({}));
  router.find("GET", "/users/abc123");
});

/**
 * Benchmark: Multiple parameters
 *
 * Measures performance degradation with multiple path parameters.
 * Common in nested resource routes like /orgs/:orgId/repos/:repoId
 */
Deno.bench("router - multiple parameters", () => {
  const router = new Router();
  router.add("GET", "/orgs/:orgId/repos/:repoId/issues/:issueId", () => ({}));
  router.find("GET", "/orgs/123/repos/456/issues/789");
});

/**
 * Benchmark: Wildcard route
 *
 * Measures greedy wildcard matching performance.
 * Used for catch-all routes and file serving.
 */
Deno.bench("router - wildcard route", () => {
  const router = new Router();
  router.add("GET", "/files/*", () => ({}));
  router.find("GET", "/files/documents/reports/2024/report.pdf");
});

/**
 * Benchmark: Large route table lookup
 *
 * Measures performance with realistic production route count.
 * Tests that lookup is sub-linear (no O(n) iteration).
 */
Deno.bench("router - 100 routes lookup", () => {
  const router = new Router();

  // Register 100 routes
  for (let i = 0; i < 100; i++) {
    router.add("GET", `/route${i}/:id`, () => ({ id: i }));
  }

  // Find route near the end
  router.find("GET", "/route99/abc123");
});

/**
 * Benchmark: Very large route table
 *
 * Stress test with 1000 routes to ensure scalability.
 * Represents large production APIs or multi-tenant applications.
 */
Deno.bench("router - 1000 routes lookup", () => {
  const router = new Router();

  for (let i = 0; i < 1000; i++) {
    router.add("GET", `/route${i}/:id`, () => ({ id: i }));
  }

  router.find("GET", "/route999/abc123");
});

/**
 * Benchmark: Route registration
 *
 * Measures overhead of adding routes (setup cost).
 * Important for applications that dynamically register routes.
 */
Deno.bench("router - route registration", () => {
  const router = new Router();
  router.add("GET", "/users/:id/posts/:postId", () => ({}));
});

/**
 * Benchmark: Method mismatch
 *
 * Measures fast-path rejection when method doesn't match.
 * Should be very fast (O(1) Map lookup).
 */
Deno.bench("router - method mismatch", () => {
  const router = new Router();
  router.add("GET", "/users", () => ({}));
  router.find("POST", "/users");
});

/**
 * Benchmark: Path mismatch on static route
 *
 * Measures rejection performance when path doesn't match.
 * Should fail fast without expensive RegExp operations.
 */
Deno.bench("router - path mismatch", () => {
  const router = new Router();
  router.add("GET", "/users", () => ({}));
  router.find("GET", "/posts");
});

/**
 * Benchmark: Multiple methods same path
 *
 * Tests performance when same path is registered for different methods.
 * Common in REST APIs (GET/POST/PUT/DELETE on same resource).
 */
Deno.bench("router - multiple methods lookup", () => {
  const router = new Router();
  router.add("GET", "/users/:id", () => ({}));
  router.add("POST", "/users/:id", () => ({}));
  router.add("PUT", "/users/:id", () => ({}));
  router.add("DELETE", "/users/:id", () => ({}));

  router.find("PUT", "/users/123");
});

/**
 * Benchmark: Complex realistic API
 *
 * Simulates a realistic REST API with mixed route types.
 * Represents real-world usage patterns.
 */
Deno.bench("router - realistic API lookup", () => {
  const router = new Router();

  // Static routes
  router.add("GET", "/health", () => ({}));
  router.add("GET", "/metrics", () => ({}));

  // User routes
  router.add("GET", "/users", () => ({}));
  router.add("GET", "/users/:id", () => ({}));
  router.add("POST", "/users", () => ({}));
  router.add("PUT", "/users/:id", () => ({}));
  router.add("DELETE", "/users/:id", () => ({}));

  // Nested resources
  router.add("GET", "/users/:userId/posts", () => ({}));
  router.add("GET", "/users/:userId/posts/:postId", () => ({}));
  router.add("POST", "/users/:userId/posts", () => ({}));

  // Deep nesting
  router.add("GET", "/orgs/:orgId/teams/:teamId/members/:memberId", () => ({}));

  // Wildcard
  router.add("GET", "/static/*", () => ({}));

  // Lookup a deeply nested route
  router.find("GET", "/users/123/posts/456");
});
