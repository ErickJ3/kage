import type {
  MapOptions,
  PoolMetrics,
  PoolOptions,
  TaskOptions,
} from "~/types.ts";
import { WorkerPool } from "~/pool.ts";
import { parallelRegistry } from "~/registry.ts";

/**
 * Options for creating a parallel executor.
 *
 * @example
 * ```ts
 * const options: ParallelOptions = {
 *   name: "image-processor",
 *   minWorkers: 4,
 *   maxWorkers: 8,
 *   maxQueueSize: 1000,
 * };
 * ```
 */
export interface ParallelOptions extends PoolOptions {
  /** Unique name for the pool (defaults to the worker URL) */
  name?: string;
}

/**
 * Creates a parallel executor for a worker script.
 * Use this when you have an external worker file instead of an inline function.
 *
 * @template T - The input data type
 * @template R - The return type
 * @param workerUrl - URL or path to the worker script
 * @param options - Pool configuration options
 * @returns A ParallelExecutor instance
 *
 * @example
 * ```ts
 * // Create executor with external worker
 * const executor = parallel<ImageData, ProcessedImage>(
 *   "./workers/image-processor.ts",
 *   { minWorkers: 2, maxWorkers: 8 }
 * );
 *
 * // Process single item with priority
 * const result = await executor.exec(imageData, { priority: 10 });
 *
 * // Process batch with transferables
 * const results = await executor.map(images, {
 *   transfer: (img) => [img.buffer],
 *   concurrency: 4,
 * });
 *
 * // Cleanup
 * executor.terminate();
 * ```
 */
export function parallel<T, R>(
  workerUrl: string | URL,
  options: ParallelOptions = {},
): ParallelExecutor<T, R> {
  const name = options.name ?? workerUrl.toString();

  const pool = parallelRegistry.getOrCreate(name, () => {
    return new WorkerPool(workerUrl, options);
  });

  return new ParallelExecutor<T, R>(pool, name);
}

/**
 * Executor for parallel task processing with an external worker script.
 *
 * @template T - The input data type
 * @template R - The return type
 *
 * @example
 * ```ts
 * const executor = parallel<number, number>("./worker.ts");
 *
 * // Execute single task with priority
 * const result = await executor.exec(42, { priority: 5 });
 *
 * // Execute batch with options
 * const results = await executor.map([1, 2, 3, 4, 5], {
 *   timeout: 5000,
 *   concurrency: 2,
 * });
 *
 * // Check performance
 * console.log(executor.metrics());
 *
 * // Check backpressure
 * if (executor.isPressured()) {
 *   console.log("Slow down!");
 * }
 *
 * // Cleanup
 * executor.terminate();
 * ```
 */
export class ParallelExecutor<T, R> {
  constructor(
    private readonly _pool: WorkerPool,
    private readonly name: string,
  ) {}

  /**
   * Gets the underlying pool for advanced operations.
   */
  get pool(): WorkerPool {
    return this._pool;
  }

  /**
   * Executes a single task.
   *
   * @param data - The input data to process
   * @param options - Optional task options (timeout, transfer, priority)
   * @returns A promise that resolves with the result
   */
  exec(data: T, options?: TaskOptions): Promise<R> {
    return this._pool.exec<T, R>(data, options);
  }

  /**
   * Executes tasks for multiple items in parallel.
   *
   * @param items - Array of items to process
   * @param options - Optional map options (timeout, transfer, concurrency, priority)
   * @returns A promise that resolves with an array of results
   */
  map(items: T[], options?: MapOptions<T>): Promise<R[]> {
    return this._pool.map<T, R>(items, options);
  }

  /**
   * Returns current pool performance metrics.
   */
  metrics(): PoolMetrics {
    return this._pool.metrics();
  }

  /**
   * Checks if the pool is under backpressure.
   */
  isPressured(): boolean {
    return this._pool.isPressured();
  }

  /**
   * Returns the current queue size.
   */
  queueSize(): number {
    return this._pool.queueSize();
  }

  /**
   * Terminates the executor and its underlying worker pool.
   */
  terminate(): void {
    parallelRegistry.delete(this.name);
  }

  /**
   * Dynamically resizes the pool bounds.
   *
   * @param minWorkers - New minimum worker count
   * @param maxWorkers - New maximum worker count
   */
  resize(minWorkers: number, maxWorkers: number): void {
    this._pool.resize(minWorkers, maxWorkers);
  }
}

/**
 * Retrieves an existing pool by name.
 *
 * @param name - The pool name
 * @returns The ParallelExecutor if found, undefined otherwise
 *
 * @example
 * ```ts
 * const executor = getPool("image-processor");
 * if (executor) {
 *   await executor.exec(data);
 * }
 * ```
 */
export function getPool(
  name: string,
): ParallelExecutor<unknown, unknown> | undefined {
  const pool = parallelRegistry.get(name);
  if (pool) {
    return new ParallelExecutor(pool, name);
  }
  return undefined;
}

/**
 * Terminates all parallel executor pools.
 *
 * @example
 * ```ts
 * // Cleanup all pools on shutdown
 * terminateAll();
 * ```
 */
export function terminateAll(): void {
  parallelRegistry.terminateAll();
}

/**
 * Lists all active pool names.
 *
 * @returns Array of pool names
 *
 * @example
 * ```ts
 * console.log(listPools()); // ["image-processor", "data-parser"]
 * ```
 */
export function listPools(): string[] {
  return parallelRegistry.list();
}

/**
 * Returns metrics for all active pools.
 *
 * @returns Object mapping pool names to their metrics
 *
 * @example
 * ```ts
 * const metrics = allMetrics();
 * for (const [name, m] of Object.entries(metrics)) {
 *   console.log(`${name}: ${m.completedTasks} completed`);
 * }
 * ```
 */
export function allMetrics(): Record<string, PoolMetrics> {
  const result: Record<string, PoolMetrics> = {};
  for (const name of parallelRegistry.list()) {
    const pool = parallelRegistry.get(name);
    if (pool) {
      result[name] = pool.metrics();
    }
  }
  return result;
}
