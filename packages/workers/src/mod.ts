/**
 * @module @kage/workers
 *
 * A high-performance worker pool library for Deno.
 * Provides easy-to-use APIs for parallel task execution using Web Workers.
 *
 * ## Features
 * - **Inline workers** - Create workers from functions with closure detection
 * - **External workers** - Use separate worker files for complex tasks
 * - **Priority scheduling** - High-priority tasks are processed first
 * - **Backpressure** - Control queue size and handle overload gracefully
 * - **Metrics** - Track performance with built-in metrics
 * - **Hot reload safe** - Stable worker names across HMR
 *
 * @example Inline workers (simplest approach)
 * ```ts
 * import { worker } from "@kage/workers";
 *
 * const double = worker((n: number) => n * 2);
 * const result = await double(21); // 42
 * const results = await double.map([1, 2, 3]); // [2, 4, 6]
 * double.terminate();
 * ```
 *
 * @example External workers (for complex tasks)
 * ```ts
 * // main.ts
 * import { parallel } from "@kage/workers";
 *
 * const executor = parallel<number, number>("./worker.ts");
 * const result = await executor.exec(42, { priority: 10 });
 * executor.terminate();
 *
 * // worker.ts
 * import { defineTask } from "@kage/workers";
 *
 * defineTask<number, number>((n) => n * 2);
 * ```
 *
 * @example Worker pool with backpressure
 * ```ts
 * import { WorkerPool } from "@kage/workers";
 *
 * const pool = new WorkerPool("./worker.ts", {
 *   minWorkers: 2,
 *   maxWorkers: 8,
 *   maxQueueSize: 1000,
 *   backpressureStrategy: "wait",
 *   onPressure: (metrics) => console.log("Under pressure!", metrics),
 * });
 *
 * const results = await pool.map(items, {
 *   transfer: (item) => [item.buffer],
 *   concurrency: 4,
 * });
 * pool.terminate();
 * ```
 */

// Parallel executor (external worker files)
export {
  allMetrics,
  getPool,
  listPools,
  parallel,
  ParallelExecutor,
  terminateAll,
} from "~/parallel.ts";
export type { ParallelOptions } from "~/parallel.ts";

// Inline workers (function-based)
export {
  ClosureError,
  detectClosures,
  terminateAllInline,
  worker,
} from "~/inline.ts";
export type { WorkerFunction, WorkerOptions } from "~/inline.ts";

// Core pool
export { WorkerPool } from "~/pool.ts";

// Plugin/manager pattern
export { createWorkerHandler, workers } from "~/plugin.ts";
export type { WorkersConfig, WorkersManager, WorkerTask } from "~/plugin.ts";

// Worker template for external workers
export { defineTask } from "~/worker_template.ts";

// Serialization utilities
export { deserialize, extractTransferables, serialize } from "~/serializer.ts";

// Scheduler (for advanced use cases)
export {
  createDefaultScheduler,
  FIFOScheduler,
  PriorityScheduler,
} from "~/scheduler.ts";
export type { QueuedTask, Scheduler } from "~/scheduler.ts";

// Registry (for advanced pool management)
export {
  djb2Hash,
  generateWorkerName,
  inlineRegistry,
  parallelRegistry,
  PoolRegistry,
} from "~/registry.ts";

// Types
export { QueueFullError } from "~/types.ts";
export type {
  BackpressureStrategy,
  MapOptions,
  PendingTask,
  PoolMetrics,
  PoolOptions,
  TaskFunction,
  TaskOptions,
  WorkerMessage,
  WorkerState,
} from "~/types.ts";
