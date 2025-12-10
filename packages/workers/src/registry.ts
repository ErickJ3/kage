/**
 * Shared pool registry for managing worker pools.
 * Provides unified naming and lifecycle management.
 */

import type { WorkerPool } from "~/pool.ts";

/**
 * A registry for managing named worker pools.
 * Provides get-or-create semantics and bulk operations.
 *
 * @example
 * ```ts
 * const registry = new PoolRegistry();
 *
 * // Get or create a pool
 * const pool = registry.getOrCreate("my-worker", () =>
 *   new WorkerPool("./worker.ts")
 * );
 *
 * // Use the pool
 * await pool.exec(data);
 *
 * // Clean up all pools
 * registry.terminateAll();
 * ```
 */
export class PoolRegistry {
  private pools = new Map<string, WorkerPool>();

  /**
   * Gets an existing pool or creates a new one if it doesn't exist.
   *
   * @param name - Unique identifier for the pool
   * @param factory - Function to create a new pool if needed
   * @returns The existing or newly created pool
   */
  getOrCreate(name: string, factory: () => WorkerPool): WorkerPool {
    let pool = this.pools.get(name);
    if (!pool) {
      pool = factory();
      this.pools.set(name, pool);
    }
    return pool;
  }

  /**
   * Gets an existing pool by name.
   *
   * @param name - The pool name
   * @returns The pool if found, undefined otherwise
   */
  get(name: string): WorkerPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Checks if a pool exists with the given name.
   *
   * @param name - The pool name
   * @returns True if the pool exists
   */
  has(name: string): boolean {
    return this.pools.has(name);
  }

  /**
   * Removes a pool from the registry and terminates it.
   *
   * @param name - The pool name
   * @returns True if the pool was found and removed
   */
  delete(name: string): boolean {
    const pool = this.pools.get(name);
    if (pool) {
      pool.terminate();
      this.pools.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Terminates all pools and clears the registry.
   */
  terminateAll(): void {
    for (const pool of this.pools.values()) {
      pool.terminate();
    }
    this.pools.clear();
  }

  /**
   * Lists all registered pool names.
   *
   * @returns Array of pool names
   */
  list(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Returns the number of registered pools.
   */
  size(): number {
    return this.pools.size;
  }
}

/**
 * Registry for inline workers created with `worker()`.
 */
export const inlineRegistry = new PoolRegistry();

/**
 * Registry for parallel executors created with `parallel()`.
 */
export const parallelRegistry = new PoolRegistry();

/**
 * Generates a hash for function content (djb2 algorithm).
 * Used for stable worker naming across hot reloads.
 *
 * @param str - The string to hash
 * @returns Base-36 encoded hash
 */
export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generates a stable worker name based on function content.
 * The same function will get the same name across hot reloads.
 *
 * @param fn - The function to generate a name for
 * @param customName - Optional custom name (takes precedence)
 * @returns A unique, stable name for the worker
 */
export function generateWorkerName(
  fn: (...args: unknown[]) => unknown,
  customName?: string,
): string {
  if (customName) return customName;
  return `inline-${djb2Hash(fn.toString())}`;
}
