import type {
  MapOptions,
  PoolMetrics,
  PoolOptions,
  TaskOptions,
} from "~/types.ts";
import { WorkerPool } from "~/pool.ts";

/**
 * A task executor bound to a specific worker pool.
 *
 * @template T - The input data type
 * @template R - The return type
 */
export interface WorkerTask<T, R> {
  /** Execute a single task */
  exec(data: T, options?: TaskOptions): Promise<R>;
  /** Execute tasks for multiple items in parallel */
  map(items: T[], options?: MapOptions<T>): Promise<R[]>;
  /** Get pool performance metrics */
  metrics(): PoolMetrics;
  /** Get the underlying pool for advanced operations */
  readonly pool: WorkerPool;
}

/**
 * Configuration for initializing a WorkersManager with pre-configured pools.
 *
 * @example
 * ```ts
 * const config: WorkersConfig = {
 *   pools: {
 *     "image-processor": {
 *       script: "./workers/image.ts",
 *       options: { minWorkers: 2, maxWorkers: 8 },
 *     },
 *     "data-parser": {
 *       script: "./workers/parser.ts",
 *     },
 *   },
 * };
 * ```
 */
export interface WorkersConfig {
  /** Pre-configured worker pools */
  pools?: Record<string, { script: string | URL; options?: PoolOptions }>;
}

/**
 * A manager for multiple worker pools.
 * Provides a centralized interface for creating, accessing, and managing worker pools.
 *
 * @example
 * ```ts
 * const manager = workers({
 *   pools: {
 *     compute: { script: "./compute-worker.ts" },
 *   },
 * });
 *
 * // Use pre-configured pool
 * const task = manager.get<number, number>("compute");
 * await task?.exec(42);
 *
 * // Create new pool on demand
 * const parser = manager.create<string, Data>("./parser.ts");
 * await parser.exec("raw data");
 *
 * // Cleanup
 * manager.terminateAll();
 * ```
 */
export interface WorkersManager {
  /** Create a new worker pool */
  create<T, R>(script: string | URL, options?: PoolOptions): WorkerTask<T, R>;
  /** Get an existing pool by name */
  get<T, R>(name: string): WorkerTask<T, R> | undefined;
  /** Get metrics for all pools */
  metrics(): Record<string, PoolMetrics>;
  /** Terminate all pools */
  terminateAll(): void;
}

/**
 * Creates a WorkersManager for managing multiple worker pools.
 *
 * @param config - Optional configuration with pre-defined pools
 * @returns A WorkersManager instance
 *
 * @example
 * ```ts
 * // Create with pre-configured pools
 * const manager = workers({
 *   pools: {
 *     compute: { script: "./compute.ts", options: { maxWorkers: 4 } },
 *   },
 * });
 *
 * // Or create empty and add pools dynamically
 * const manager = workers();
 * const task = manager.create("./worker.ts");
 * ```
 */
export function workers(config: WorkersConfig = {}): WorkersManager {
  const pools = new Map<string, WorkerPool>();

  for (const [name, poolConfig] of Object.entries(config.pools ?? {})) {
    pools.set(
      name,
      new WorkerPool(poolConfig.script, poolConfig.options),
    );
  }

  const createTask = <T, R>(pool: WorkerPool): WorkerTask<T, R> => ({
    exec: (data: T, options?: TaskOptions) => pool.exec<T, R>(data, options),
    map: (items: T[], options?: MapOptions<T>) =>
      pool.map<T, R>(items, options),
    metrics: () => pool.metrics(),
    pool,
  });

  return {
    create<T, R>(
      script: string | URL,
      options?: PoolOptions,
    ): WorkerTask<T, R> {
      const pool = new WorkerPool(script, options);
      const name = script.toString();
      pools.set(name, pool);
      return createTask<T, R>(pool);
    },

    get<T, R>(name: string): WorkerTask<T, R> | undefined {
      const pool = pools.get(name);
      if (!pool) return undefined;
      return createTask<T, R>(pool);
    },

    metrics(): Record<string, PoolMetrics> {
      const result: Record<string, PoolMetrics> = {};
      for (const [name, pool] of pools) {
        result[name] = pool.metrics();
      }
      return result;
    },

    terminateAll(): void {
      for (const pool of pools.values()) {
        pool.terminate();
      }
      pools.clear();
    },
  };
}

/**
 * Creates a simple worker handler with direct pool access.
 * Useful for integrating workers into existing systems.
 *
 * @template T - The input data type
 * @template R - The return type
 * @param workerUrl - URL or path to the worker script
 * @param options - Optional pool configuration
 * @returns Object containing the pool and a handler function
 *
 * @example
 * ```ts
 * const { pool, handler } = createWorkerHandler<Request, Response>(
 *   "./api-worker.ts",
 *   { maxWorkers: 4 }
 * );
 *
 * // Use the handler
 * const response = await handler(request);
 *
 * // Access pool directly for metrics/control
 * console.log(pool.metrics());
 * pool.terminate();
 * ```
 */
export function createWorkerHandler<T, R>(
  workerUrl: string | URL,
  options?: PoolOptions,
): { pool: WorkerPool; handler: (data: T) => Promise<R> } {
  const pool = new WorkerPool(workerUrl, options);

  return {
    pool,
    handler: (data: T) => pool.exec<T, R>(data),
  };
}
