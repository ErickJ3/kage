/**
 * High-performance routing engine for Kage framework.
 *
 * Implements RegExp-based routing without linear loops using a trie structure
 * for O(log n) route matching performance.
 *
 * @module
 */

export { Router } from "./router.ts";
export type {
  Handler,
  HttpMethod,
  Match,
  Route,
  RouteConfig,
} from "./types.ts";
