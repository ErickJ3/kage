import type { MapOptions, PoolOptions, TaskOptions } from "~/types.ts";
import { WorkerPool } from "~/pool.ts";
import { validateNoClosures } from "~/closure_detector.ts";
import { generateWorkerName, inlineRegistry } from "~/registry.ts";

type TaskFunction<T, R> = (data: T) => R | Promise<R>;

/**
 * A callable function that executes tasks in a worker.
 * Can be called directly to execute a single task, or use `.map()` for batch processing.
 *
 * @template T - The input data type
 * @template R - The return type
 *
 * @example
 * ```ts
 * const double = worker((n: number) => n * 2);
 *
 * // Single execution
 * const result = await double(5); // 10
 *
 * // Batch processing
 * const results = await double.map([1, 2, 3]); // [2, 4, 6]
 *
 * // Cleanup
 * double.terminate();
 * ```
 */
export interface WorkerFunction<T, R> {
  /** Execute a single task with the given data */
  (data: T, options?: TaskOptions): Promise<R>;
  /** Execute tasks for multiple items in parallel */
  map(items: T[], options?: MapOptions<T>): Promise<R[]>;
  /** Terminate the underlying worker pool */
  terminate(): void;
  /** Get the underlying pool for advanced operations */
  readonly pool: WorkerPool;
}

/**
 * Options for creating an inline worker.
 *
 * @example
 * ```ts
 * const compute = worker(fn, {
 *   name: "my-worker",
 *   minWorkers: 2,
 *   maxWorkers: 4,
 *   validateClosures: true, // default
 * });
 * ```
 */
export interface WorkerOptions extends PoolOptions {
  /** Unique name for the worker pool (auto-generated based on function hash if not provided) */
  name?: string;
  /** Whether to validate that the function has no closures (default: true) */
  validateClosures?: boolean;
}

function generateWorkerScript<T, R>(fn: TaskFunction<T, R>): string {
  const fnString = fn.toString();

  return `
const handler = ${fnString};

self.onmessage = async (event) => {
  const message = event.data;

  if (message.type === "init") {
    self.postMessage({ type: "ready", id: message.id });
    return;
  }

  if (message.type !== "task") {
    return;
  }

  try {
    const result = await handler(message.payload);
    self.postMessage({
      type: "result",
      id: message.id,
      payload: result,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

self.postMessage({ type: "ready", id: "" });
`;
}

function createWorkerUrl(script: string): string {
  const blob = new Blob([script], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

/**
 * Creates an inline worker from a function.
 * The function is serialized and executed in a Web Worker context.
 *
 * **Important:** The function must be self-contained and cannot reference
 * variables from outer scope (closures are not supported). The library will
 * throw a ClosureError if invalid closures are detected.
 *
 * @template T - The input data type
 * @template R - The return type
 * @param fn - The function to execute in the worker
 * @param options - Worker pool configuration options
 * @returns A callable WorkerFunction
 * @throws {ClosureError} If the function references external variables
 *
 * @example
 * ```ts
 * // Create an inline worker for CPU-intensive computation
 * const fibonacci = worker((n: number): number => {
 *   if (n <= 1) return n;
 *   let a = 0, b = 1;
 *   for (let i = 2; i <= n; i++) {
 *     [a, b] = [b, a + b];
 *   }
 *   return b;
 * });
 *
 * // Execute
 * const result = await fibonacci(40);
 *
 * // Batch process with options
 * const results = await fibonacci.map([10, 20, 30, 40], {
 *   timeout: 5000,
 *   priority: 10,
 * });
 *
 * // Cleanup when done
 * fibonacci.terminate();
 * ```
 *
 * @example
 * ```ts
 * // This will throw ClosureError - external variable reference
 * const multiplier = 2;
 * const double = worker((n: number) => n * multiplier); // Error!
 *
 * // Correct approach - pass data through parameter
 * const multiply = worker((data: { n: number; mult: number }) => data.n * data.mult);
 * await multiply({ n: 5, mult: 2 }); // 10
 * ```
 */
export function worker<T, R>(
  fn: TaskFunction<T, R>,
  options: WorkerOptions = {},
): WorkerFunction<T, R> {
  const { validateClosures = true, ...poolOptions } = options;

  // Validate no closures before creating worker
  if (validateClosures) {
    validateNoClosures(fn as (...args: unknown[]) => unknown);
  }

  // Generate stable name based on function content (hot reload safe)
  const name = generateWorkerName(
    fn as (...args: unknown[]) => unknown,
    options.name,
  );

  // Get or create pool using registry
  const pool = inlineRegistry.getOrCreate(name, () => {
    const script = generateWorkerScript(fn);
    const workerUrl = createWorkerUrl(script);
    return new WorkerPool(workerUrl, poolOptions);
  });

  const execute = ((data: T, taskOptions?: TaskOptions): Promise<R> => {
    return pool.exec<T, R>(data, taskOptions);
  }) as WorkerFunction<T, R>;

  execute.map = (items: T[], mapOptions?: MapOptions<T>): Promise<R[]> => {
    return pool.map<T, R>(items, mapOptions);
  };

  execute.terminate = (): void => {
    inlineRegistry.delete(name);
  };

  Object.defineProperty(execute, "pool", {
    value: pool,
    writable: false,
    enumerable: false,
  });

  return execute;
}

/**
 * Terminates all inline worker pools.
 * Call this to clean up all workers created with the `worker()` function.
 *
 * @example
 * ```ts
 * // Cleanup all inline workers
 * terminateAllInline();
 * ```
 */
export function terminateAllInline(): void {
  inlineRegistry.terminateAll();
}

// Re-export for convenience
export { ClosureError, detectClosures } from "~/closure_detector.ts";
