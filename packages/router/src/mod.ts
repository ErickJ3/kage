/**
 * High-performance routing engine for Kage framework.
 *
 * @module
 */

export { releaseParams, Router } from "~/router.ts";
export { RadixRouter, releaseParams as releaseRadixParams } from "~/radix.ts";
export type { Handler, HttpMethod, Match, Route } from "~/types.ts";
