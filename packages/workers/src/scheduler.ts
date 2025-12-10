/**
 * Task schedulers for worker pools.
 * Provides priority queue and FIFO scheduling strategies.
 */

/**
 * Represents a task in the scheduler queue.
 */
export interface QueuedTask<T = unknown> {
  /** Unique task identifier */
  id: string;
  /** Task priority (higher = more urgent, default: 0) */
  priority: number;
  /** Timestamp when task was queued */
  queuedAt: number;
  /** The task payload */
  payload: T;
  /** Promise resolve callback */
  resolve: (value: unknown) => void;
  /** Promise reject callback */
  reject: (error: Error) => void;
  /** Task-specific timeout */
  timeout?: number;
  /** Transferable objects */
  transfer?: Transferable[];
}

/**
 * Interface for task schedulers.
 * Implementations control how tasks are queued and dequeued.
 */
export interface Scheduler<T = unknown> {
  /**
   * Adds a task to the queue.
   * @param task - The task to enqueue
   */
  enqueue(task: QueuedTask<T>): void;

  /**
   * Removes and returns the next task to process.
   * @returns The next task, or undefined if queue is empty
   */
  dequeue(): QueuedTask<T> | undefined;

  /**
   * Returns the next task without removing it.
   * @returns The next task, or undefined if queue is empty
   */
  peek(): QueuedTask<T> | undefined;

  /**
   * Returns the number of tasks in the queue.
   */
  size(): number;

  /**
   * Returns true if the queue is empty.
   */
  isEmpty(): boolean;

  /**
   * Clears all tasks from the queue.
   * @returns Array of cleared tasks (for cleanup/rejection)
   */
  clear(): QueuedTask<T>[];
}

/**
 * Priority scheduler with FIFO ordering within same priority level.
 * Higher priority values are processed first.
 *
 * @example
 * ```ts
 * const scheduler = new PriorityScheduler();
 *
 * scheduler.enqueue({ id: "1", priority: 0, ... }); // normal
 * scheduler.enqueue({ id: "2", priority: 10, ... }); // high priority
 * scheduler.enqueue({ id: "3", priority: 0, ... }); // normal
 *
 * scheduler.dequeue(); // returns task "2" (priority 10)
 * scheduler.dequeue(); // returns task "1" (first priority 0 task)
 * scheduler.dequeue(); // returns task "3" (second priority 0 task)
 * ```
 */
export class PriorityScheduler<T = unknown> implements Scheduler<T> {
  private queues = new Map<number, QueuedTask<T>[]>();
  private sortedPriorities: number[] = [];
  private count = 0;

  enqueue(task: QueuedTask<T>): void {
    const priority = task.priority;
    let queue = this.queues.get(priority);

    if (!queue) {
      queue = [];
      this.queues.set(priority, queue);
      this.insertPriority(priority);
    }

    queue.push(task);
    this.count++;
  }

  dequeue(): QueuedTask<T> | undefined {
    for (const priority of this.sortedPriorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        this.count--;
        const task = queue.shift()!;

        // Clean up empty priority level
        if (queue.length === 0) {
          this.queues.delete(priority);
          this.removePriority(priority);
        }

        return task;
      }
    }
    return undefined;
  }

  peek(): QueuedTask<T> | undefined {
    for (const priority of this.sortedPriorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return undefined;
  }

  size(): number {
    return this.count;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }

  clear(): QueuedTask<T>[] {
    const tasks: QueuedTask<T>[] = [];

    for (const queue of this.queues.values()) {
      tasks.push(...queue);
    }

    this.queues.clear();
    this.sortedPriorities = [];
    this.count = 0;

    return tasks;
  }

  /**
   * Inserts a priority level maintaining descending order.
   */
  private insertPriority(priority: number): void {
    // Binary search for insertion point (descending order)
    let left = 0;
    let right = this.sortedPriorities.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.sortedPriorities[mid] > priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    this.sortedPriorities.splice(left, 0, priority);
  }

  /**
   * Removes a priority level from the sorted list.
   */
  private removePriority(priority: number): void {
    const index = this.sortedPriorities.indexOf(priority);
    if (index !== -1) {
      this.sortedPriorities.splice(index, 1);
    }
  }
}

/**
 * Simple FIFO (First-In-First-Out) scheduler.
 * Ignores priority values and processes tasks in order of arrival.
 *
 * @example
 * ```ts
 * const scheduler = new FIFOScheduler();
 *
 * scheduler.enqueue({ id: "1", priority: 0, ... });
 * scheduler.enqueue({ id: "2", priority: 10, ... }); // priority ignored
 * scheduler.enqueue({ id: "3", priority: 0, ... });
 *
 * scheduler.dequeue(); // returns task "1"
 * scheduler.dequeue(); // returns task "2"
 * scheduler.dequeue(); // returns task "3"
 * ```
 */
export class FIFOScheduler<T = unknown> implements Scheduler<T> {
  private queue: QueuedTask<T>[] = [];

  enqueue(task: QueuedTask<T>): void {
    this.queue.push(task);
  }

  dequeue(): QueuedTask<T> | undefined {
    return this.queue.shift();
  }

  peek(): QueuedTask<T> | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): QueuedTask<T>[] {
    const tasks = this.queue;
    this.queue = [];
    return tasks;
  }
}

/**
 * Creates a default scheduler (PriorityScheduler).
 */
export function createDefaultScheduler<T = unknown>(): Scheduler<T> {
  return new PriorityScheduler<T>();
}
