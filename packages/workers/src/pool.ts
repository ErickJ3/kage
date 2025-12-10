import type {
  BackpressureStrategy,
  MapOptions,
  PendingTask,
  PoolMetrics,
  PoolOptions,
  TaskOptions,
  WorkerMessage,
  WorkerState,
} from "~/types.ts";
import { QueueFullError } from "~/types.ts";
import { deserialize, serialize } from "~/serializer.ts";
import {
  createDefaultScheduler,
  type QueuedTask,
  type Scheduler,
} from "~/scheduler.ts";

const DEFAULT_MIN_WORKERS = 1;
const DEFAULT_MAX_WORKERS = navigator.hardwareConcurrency || 4;
const DEFAULT_IDLE_TIMEOUT = 30000;
const DEFAULT_TASK_TIMEOUT = 60000;
const DEFAULT_BACKPRESSURE_TIMEOUT = 30000;
const PRESSURE_THRESHOLD = 0.8;

interface PendingTaskWithTimer<T> extends PendingTask<T> {
  timerId?: number;
}

interface BackpressureWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timerId: number;
}

/**
 * A dynamic worker pool that manages Web Workers for parallel task execution.
 *
 * The pool automatically scales between minWorkers and maxWorkers based on demand,
 * and terminates idle workers after idleTimeout. Supports priority scheduling,
 * backpressure, and efficient batch processing.
 *
 * @example
 * ```ts
 * // Create a pool with a worker script
 * const pool = new WorkerPool("./my-worker.ts", {
 *   minWorkers: 2,
 *   maxWorkers: 8,
 *   taskTimeout: 10000,
 *   maxQueueSize: 1000,
 * });
 *
 * // Execute a task with priority
 * const result = await pool.exec<{ x: number }, number>(
 *   { x: 42 },
 *   { priority: 10 }
 * );
 *
 * // Process multiple items with transferables
 * const results = await pool.map(buffers, {
 *   transfer: (buf) => [buf],
 *   concurrency: 4,
 * });
 *
 * // Check metrics
 * console.log(pool.metrics());
 *
 * // Cleanup when done
 * pool.terminate();
 * ```
 */
export class WorkerPool {
  private workers: WorkerState[] = [];
  private pendingTasks: Map<string, PendingTaskWithTimer<unknown>> = new Map();
  private scheduler: Scheduler<unknown>;
  private workerScript: string;
  private minWorkers: number;
  private maxWorkers: number;
  private idleTimeout: number;
  private taskTimeout: number;
  private idleTimer: number | null = null;
  private terminated = false;
  private pendingTimers: Set<number> = new Set();

  // Backpressure
  private maxQueueSize: number;
  private backpressureStrategy: BackpressureStrategy;
  private backpressureTimeout: number;
  private onPressure?: (metrics: PoolMetrics) => void;
  private backpressureWaiters: BackpressureWaiter[] = [];
  private pressureNotified = false;

  // Metrics
  private completedTasksCount = 0;
  private failedTasksCount = 0;
  private totalTaskTime = 0;
  private taskCounter = 0;
  private trackMetrics: boolean;

  constructor(script: string | URL, options: PoolOptions = {}) {
    this.workerScript = script instanceof URL
      ? script.href
      : new URL(script, import.meta.url).href;
    this.minWorkers = options.minWorkers ?? DEFAULT_MIN_WORKERS;
    this.maxWorkers = options.maxWorkers ?? DEFAULT_MAX_WORKERS;
    this.idleTimeout = options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
    this.taskTimeout = options.taskTimeout ?? DEFAULT_TASK_TIMEOUT;
    this.trackMetrics = options.trackMetrics ?? true;

    // Backpressure options
    this.maxQueueSize = options.maxQueueSize ?? Infinity;
    this.backpressureStrategy = options.backpressureStrategy ?? "reject";
    this.backpressureTimeout = options.backpressureTimeout ??
      DEFAULT_BACKPRESSURE_TIMEOUT;
    this.onPressure = options.onPressure;

    // Use priority scheduler by default
    this.scheduler = createDefaultScheduler<unknown>();

    this.initialize();
  }

  private initialize(): void {
    for (let i = 0; i < this.minWorkers; i++) {
      this.spawnWorker();
    }
  }

  private spawnWorker(): WorkerState {
    const worker = new Worker(this.workerScript, { type: "module" });
    const state: WorkerState = {
      worker,
      busy: false,
      taskId: null,
      lastUsed: Date.now(),
    };

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.handleMessage(state, event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      this.handleError(state, event);
    };

    this.workers.push(state);
    return state;
  }

  private handleMessage(state: WorkerState, message: WorkerMessage): void {
    if (message.type === "ready") {
      return;
    }

    const taskId = message.id;
    const pending = this.pendingTasks.get(taskId);

    if (!pending) {
      return;
    }

    this.pendingTasks.delete(taskId);
    state.busy = false;
    state.taskId = null;
    state.lastUsed = Date.now();

    if (pending.timerId !== undefined) {
      clearTimeout(pending.timerId);
      this.pendingTimers.delete(pending.timerId);
    }

    if (this.trackMetrics) {
      const elapsed = Date.now() - pending.startTime;
      this.totalTaskTime += elapsed;
    }

    if (message.type === "result") {
      if (this.trackMetrics) this.completedTasksCount++;
      pending.resolve(deserialize(message.payload));
    } else if (message.type === "error") {
      if (this.trackMetrics) this.failedTasksCount++;
      pending.reject(new Error(message.error ?? "Unknown worker error"));
    }

    // Notify backpressure waiters that space is available
    this.notifyBackpressureWaiters();

    this.processQueue();
    this.scheduleIdleCheck();
  }

  private handleError(state: WorkerState, event: ErrorEvent): void {
    const taskId = state.taskId;
    if (taskId) {
      const pending = this.pendingTasks.get(taskId);
      if (pending) {
        this.pendingTasks.delete(taskId);
        if (this.trackMetrics) this.failedTasksCount++;
        pending.reject(new Error(event.message || "Worker error"));
      }
    }

    const index = this.workers.indexOf(state);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
    state.worker.terminate();

    if (this.workers.length < this.minWorkers) {
      this.spawnWorker();
    }

    // Notify backpressure waiters
    this.notifyBackpressureWaiters();
  }

  /**
   * Selects the best idle worker using LRU strategy.
   */
  private selectIdleWorker(): WorkerState | null {
    let oldest: WorkerState | null = null;
    let oldestTime = Infinity;

    for (const worker of this.workers) {
      if (!worker.busy && worker.lastUsed < oldestTime) {
        oldest = worker;
        oldestTime = worker.lastUsed;
      }
    }

    return oldest;
  }

  private processQueue(): void {
    while (!this.scheduler.isEmpty()) {
      const worker = this.selectIdleWorker();

      if (worker) {
        const task = this.scheduler.dequeue()!;
        this.scheduleTask(worker, task);
        continue;
      }

      if (this.workers.length < this.maxWorkers) {
        const newWorker = this.spawnWorker();
        const task = this.scheduler.dequeue()!;
        this.scheduleTask(newWorker, task);
        continue;
      }

      // No workers available, stop processing
      break;
    }
  }

  /**
   * Schedules a task on a specific worker.
   */
  private scheduleTask(
    worker: WorkerState,
    task: QueuedTask<unknown>,
  ): void {
    worker.busy = true;
    worker.taskId = task.id;

    const message: WorkerMessage = {
      type: "task",
      id: task.id,
      payload: serialize(task.payload),
    };

    if (task.transfer && task.transfer.length > 0) {
      worker.worker.postMessage(message, task.transfer);
    } else {
      worker.worker.postMessage(message);
    }

    this.pendingTasks.set(task.id, {
      resolve: task.resolve,
      reject: task.reject,
      startTime: Date.now(),
      timeout: task.timeout,
    });

    // Set up timeout
    const taskTimeoutMs = task.timeout ?? this.taskTimeout;
    if (taskTimeoutMs > 0) {
      const timerId = setTimeout(() => {
        this.handleTaskTimeout(task.id, worker, taskTimeoutMs);
      }, taskTimeoutMs);
      this.pendingTimers.add(timerId);

      const pending = this.pendingTasks.get(task.id);
      if (pending) {
        pending.timerId = timerId;
      }
    }
  }

  private handleTaskTimeout(
    taskId: string,
    worker: WorkerState,
    timeoutMs: number,
  ): void {
    const pending = this.pendingTasks.get(taskId);
    if (pending) {
      if (pending.timerId !== undefined) {
        this.pendingTimers.delete(pending.timerId);
      }
      this.pendingTasks.delete(taskId);
      worker.busy = false;
      worker.taskId = null;
      if (this.trackMetrics) this.failedTasksCount++;
      pending.reject(new Error(`Task timeout after ${timeoutMs}ms`));
      this.notifyBackpressureWaiters();
      this.processQueue();
    }
  }

  private scheduleIdleCheck(): void {
    if (this.idleTimer !== null) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.cleanupIdleWorkers();
    }, this.idleTimeout);
  }

  private cleanupIdleWorkers(): void {
    const now = Date.now();
    const toRemove: WorkerState[] = [];

    for (const worker of this.workers) {
      if (
        !worker.busy &&
        now - worker.lastUsed > this.idleTimeout &&
        this.workers.length - toRemove.length > this.minWorkers
      ) {
        toRemove.push(worker);
      }
    }

    for (const worker of toRemove) {
      const index = this.workers.indexOf(worker);
      if (index !== -1) {
        this.workers.splice(index, 1);
        worker.worker.terminate();
      }
    }
  }

  /**
   * Checks if adding a task would exceed queue limits.
   */
  private checkBackpressure(): boolean {
    const currentSize = this.scheduler.size();

    // Check pressure threshold for notification
    if (
      this.onPressure &&
      !this.pressureNotified &&
      this.maxQueueSize !== Infinity &&
      currentSize >= this.maxQueueSize * PRESSURE_THRESHOLD
    ) {
      this.pressureNotified = true;
      this.onPressure(this.metrics());
    }

    // Reset notification when pressure drops
    if (
      this.pressureNotified &&
      currentSize < this.maxQueueSize * PRESSURE_THRESHOLD
    ) {
      this.pressureNotified = false;
    }

    return currentSize >= this.maxQueueSize;
  }

  /**
   * Waits for queue space to become available.
   */
  private waitForQueueSpace(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        const index = this.backpressureWaiters.findIndex(
          (w) => w.timerId === timerId,
        );
        if (index !== -1) {
          this.backpressureWaiters.splice(index, 1);
        }
        reject(
          new Error(
            `Backpressure timeout: queue still full after ${this.backpressureTimeout}ms`,
          ),
        );
      }, this.backpressureTimeout);

      this.backpressureWaiters.push({ resolve, reject, timerId });
    });
  }

  /**
   * Notifies waiters that queue space is available.
   */
  private notifyBackpressureWaiters(): void {
    while (
      this.backpressureWaiters.length > 0 &&
      this.scheduler.size() < this.maxQueueSize
    ) {
      const waiter = this.backpressureWaiters.shift()!;
      clearTimeout(waiter.timerId);
      waiter.resolve();
    }
  }

  /**
   * Executes a task in the worker pool.
   *
   * @template T - The input data type
   * @template R - The expected result type
   * @param payload - The data to send to the worker
   * @param options - Task options (timeout, transfer, priority)
   * @returns A promise that resolves with the task result
   * @throws {QueueFullError} When queue is full and strategy is "reject"
   *
   * @example
   * ```ts
   * // Simple execution
   * const result = await pool.exec<{ text: string }, number>({ text: "hello" });
   *
   * // With priority and timeout
   * const urgent = await pool.exec(data, { priority: 10, timeout: 5000 });
   *
   * // With transferables
   * const buffer = new ArrayBuffer(1024);
   * await pool.exec({ buffer }, { transfer: [buffer] });
   * ```
   */
  async exec<T, R>(payload: T, options: TaskOptions = {}): Promise<R> {
    if (this.terminated) {
      throw new Error("Pool has been terminated");
    }

    const { timeout, transfer, priority = 0 } = options;

    // Check backpressure
    if (this.checkBackpressure()) {
      if (this.backpressureStrategy === "reject") {
        throw new QueueFullError(this.scheduler.size());
      } else {
        await this.waitForQueueSpace();
      }
    }

    return new Promise((resolve, reject) => {
      const taskId = `t${this.taskCounter++}`;
      const task: QueuedTask<unknown> = {
        id: taskId,
        priority,
        queuedAt: Date.now(),
        payload,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        transfer,
      };

      // Try to execute immediately if worker is available
      const worker = this.selectIdleWorker();
      if (worker) {
        this.scheduleTask(worker, task);
        return;
      }

      // Spawn new worker if possible
      if (this.workers.length < this.maxWorkers) {
        const newWorker = this.spawnWorker();
        this.scheduleTask(newWorker, task);
        return;
      }

      // Queue the task
      this.scheduler.enqueue(task);
    });
  }

  /**
   * Executes tasks for multiple items in parallel with advanced options.
   *
   * @template T - The input data type
   * @template R - The expected result type
   * @param items - Array of items to process
   * @param options - Map options (timeout, transfer, concurrency, priority)
   * @returns A promise that resolves with an array of results
   *
   * @example
   * ```ts
   * // Simple batch processing
   * const results = await pool.map([1, 2, 3, 4, 5]);
   *
   * // With transferables per item
   * const processed = await pool.map(buffers, {
   *   transfer: (buf, i) => [buf.buffer],
   *   timeout: 5000,
   * });
   *
   * // With concurrency limit
   * const results = await pool.map(items, {
   *   concurrency: 4,
   *   priority: 5,
   * });
   * ```
   */
  map<T, R>(items: T[], options: MapOptions<T> = {}): Promise<R[]> {
    if (this.terminated) {
      return Promise.reject(new Error("Pool has been terminated"));
    }

    if (items.length === 0) {
      return Promise.resolve([]);
    }

    const {
      timeout,
      transfer,
      concurrency = this.maxWorkers,
      priority = 0,
    } = options;

    return new Promise((resolve, reject) => {
      const results: R[] = new Array(items.length);
      let completed = 0;
      let failed = false;
      let running = 0;
      let nextIndex = 0;

      const processNext = () => {
        while (
          running < concurrency &&
          nextIndex < items.length &&
          !failed
        ) {
          const index = nextIndex++;
          const item = items[index];
          running++;

          const taskOptions: TaskOptions = {
            timeout,
            priority,
            transfer: transfer ? transfer(item, index) : undefined,
          };

          this.exec<T, R>(item, taskOptions)
            .then((result) => {
              if (failed) return;
              results[index] = result;
              completed++;
              running--;

              if (completed === items.length) {
                resolve(results);
              } else {
                processNext();
              }
            })
            .catch((error) => {
              if (failed) return;
              failed = true;
              reject(error);
            });
        }
      };

      processNext();
    });
  }

  /**
   * Returns current pool performance metrics.
   *
   * @returns Pool metrics including worker counts and task statistics
   *
   * @example
   * ```ts
   * const metrics = pool.metrics();
   * console.log(`Completed: ${metrics.completedTasks}, Avg time: ${metrics.averageTaskTime}ms`);
   * ```
   */
  metrics(): PoolMetrics {
    const idleWorkers = this.workers.filter((w) => !w.busy).length;
    const busyWorkers = this.workers.length - idleWorkers;
    const completed = this.completedTasksCount;

    return {
      totalWorkers: this.workers.length,
      idleWorkers,
      busyWorkers,
      pendingTasks: this.pendingTasks.size + this.scheduler.size(),
      completedTasks: completed,
      failedTasks: this.failedTasksCount,
      averageTaskTime: completed > 0 ? this.totalTaskTime / completed : 0,
    };
  }

  /**
   * Checks if the pool is under backpressure.
   *
   * @returns True if queue is at or above 80% capacity
   */
  isPressured(): boolean {
    return (
      this.maxQueueSize !== Infinity &&
      this.scheduler.size() >= this.maxQueueSize * PRESSURE_THRESHOLD
    );
  }

  /**
   * Returns the current queue size.
   */
  queueSize(): number {
    return this.scheduler.size();
  }

  /**
   * Terminates the pool and all its workers.
   * Rejects all pending and queued tasks with an error.
   *
   * @example
   * ```ts
   * pool.terminate();
   * ```
   */
  terminate(): void {
    this.terminated = true;

    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    for (const timerId of this.pendingTimers) {
      clearTimeout(timerId);
    }
    this.pendingTimers.clear();

    for (const pending of this.pendingTasks.values()) {
      pending.reject(new Error("Pool terminated"));
    }
    this.pendingTasks.clear();

    // Clear scheduler and reject all queued tasks
    const queuedTasks = this.scheduler.clear();
    for (const task of queuedTasks) {
      task.reject(new Error("Pool terminated"));
    }

    // Reject all backpressure waiters
    for (const waiter of this.backpressureWaiters) {
      clearTimeout(waiter.timerId);
      waiter.reject(new Error("Pool terminated"));
    }
    this.backpressureWaiters = [];

    for (const state of this.workers) {
      state.worker.terminate();
    }
    this.workers.length = 0;
  }

  /**
   * Dynamically resizes the pool bounds.
   * Spawns additional workers if below new minimum, or terminates idle workers if above new maximum.
   *
   * @param minWorkers - New minimum worker count
   * @param maxWorkers - New maximum worker count
   *
   * @example
   * ```ts
   * pool.resize(4, 16); // Scale up for heavy load
   * pool.resize(1, 4);  // Scale down for lighter load
   * ```
   */
  resize(minWorkers: number, maxWorkers: number): void {
    this.minWorkers = minWorkers;
    this.maxWorkers = maxWorkers;

    while (this.workers.length < this.minWorkers) {
      this.spawnWorker();
    }

    this.cleanupIdleWorkers();
  }
}
