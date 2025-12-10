/**
 * A function that processes task data and returns a result.
 * Can be synchronous or asynchronous.
 *
 * @template T - The input data type
 * @template R - The return type
 *
 * @example
 * ```ts
 * const add: TaskFunction<{ a: number; b: number }, number> = (data) => data.a + data.b;
 * ```
 */
export type TaskFunction<T, R> = (data: T) => R | Promise<R>;

/**
 * Internal message format for communication between main thread and workers.
 *
 * @template T - The payload type
 */
export interface WorkerMessage<T = unknown> {
  /** Message type indicating the purpose of the message */
  type: "task" | "result" | "error" | "init" | "ready";
  /** Unique identifier for the task */
  id: string;
  /** Optional data payload */
  payload?: T;
  /** Error message when type is "error" */
  error?: string;
}

/**
 * Backpressure strategy when queue is full.
 * - `"reject"`: Immediately reject with QueueFullError
 * - `"wait"`: Wait up to backpressureTimeout for queue space
 */
export type BackpressureStrategy = "reject" | "wait";

/**
 * Configuration options for a worker pool.
 *
 * @example
 * ```ts
 * const options: PoolOptions = {
 *   minWorkers: 2,
 *   maxWorkers: 8,
 *   idleTimeout: 30000,
 *   taskTimeout: 60000,
 *   trackMetrics: true,
 *   maxQueueSize: 1000,
 *   backpressureStrategy: "reject",
 * };
 * ```
 */
export interface PoolOptions {
  /** Minimum number of workers to keep alive (default: 1) */
  minWorkers?: number;
  /** Maximum number of workers to spawn (default: navigator.hardwareConcurrency or 4) */
  maxWorkers?: number;
  /** Time in ms before idle workers are terminated (default: 30000) */
  idleTimeout?: number;
  /** Time in ms before a task times out (default: 60000) */
  taskTimeout?: number;
  /** Whether to track performance metrics (default: true) */
  trackMetrics?: boolean;
  /** Maximum number of tasks in queue before backpressure kicks in (default: Infinity) */
  maxQueueSize?: number;
  /** Strategy when queue is full (default: "reject") */
  backpressureStrategy?: BackpressureStrategy;
  /** Timeout in ms when using "wait" backpressure strategy (default: 30000) */
  backpressureTimeout?: number;
  /** Callback when queue pressure exceeds 80% of maxQueueSize */
  onPressure?: (metrics: PoolMetrics) => void;
}

/**
 * Options for executing a single task.
 *
 * @example
 * ```ts
 * const buffer = new ArrayBuffer(1024);
 * await executor.exec(data, { timeout: 5000, transfer: [buffer], priority: 10 });
 * ```
 */
export interface TaskOptions {
  /** Task-specific timeout in ms (overrides pool default) */
  timeout?: number;
  /** Transferable objects to transfer ownership to the worker */
  transfer?: Transferable[];
  /** Task priority (higher = more urgent, default: 0) */
  priority?: number;
}

/**
 * Options for batch processing with map().
 *
 * @template T - The input item type
 *
 * @example
 * ```ts
 * const results = await pool.map(items, {
 *   timeout: 5000,
 *   transfer: (item) => [item.buffer],
 *   concurrency: 4,
 *   priority: 5,
 * });
 * ```
 */
export interface MapOptions<T> {
  /** Task-specific timeout in ms for each item */
  timeout?: number;
  /** Function to extract transferables from each item */
  transfer?: (item: T, index: number) => Transferable[];
  /** Maximum concurrent tasks (default: maxWorkers) */
  concurrency?: number;
  /** Priority for all tasks in the batch (default: 0) */
  priority?: number;
}

/**
 * Error thrown when the task queue is full and backpressure is triggered.
 */
export class QueueFullError extends Error {
  constructor(public readonly queueSize: number) {
    super(`Queue is full (${queueSize} tasks pending)`);
    this.name = "QueueFullError";
  }
}

/**
 * Performance metrics for a worker pool.
 *
 * @example
 * ```ts
 * const metrics = pool.metrics();
 * console.log(`Active: ${metrics.busyWorkers}, Pending: ${metrics.pendingTasks}`);
 * ```
 */
export interface PoolMetrics {
  /** Total number of workers currently in the pool */
  totalWorkers: number;
  /** Number of workers waiting for tasks */
  idleWorkers: number;
  /** Number of workers currently processing tasks */
  busyWorkers: number;
  /** Number of tasks waiting in the queue */
  pendingTasks: number;
  /** Total number of successfully completed tasks */
  completedTasks: number;
  /** Total number of failed tasks */
  failedTasks: number;
  /** Average task execution time in ms */
  averageTaskTime: number;
}

/**
 * Internal representation of a pending task awaiting completion.
 *
 * @template T - The expected result type
 */
export interface PendingTask<T> {
  /** Resolves the task promise with the result */
  resolve: (value: T) => void;
  /** Rejects the task promise with an error */
  reject: (error: Error) => void;
  /** Timestamp when the task started */
  startTime: number;
  /** Optional task-specific timeout */
  timeout?: number;
}

/**
 * Internal state tracking for an individual worker.
 */
export interface WorkerState {
  /** The underlying Web Worker instance */
  worker: Worker;
  /** Whether the worker is currently processing a task */
  busy: boolean;
  /** ID of the task being processed, or null if idle */
  taskId: string | null;
  /** Timestamp of the last activity */
  lastUsed: number;
}
