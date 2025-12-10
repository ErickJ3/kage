import type { WorkerMessage } from "~/types.ts";
import { deserialize, serialize } from "~/serializer.ts";

type TaskHandler<T = unknown, R = unknown> = (data: T) => R | Promise<R>;

let handler: TaskHandler | null = null;

declare const self: {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  postMessage: (message: WorkerMessage) => void;
};

const isWorkerContext = typeof self !== "undefined" &&
  typeof self.postMessage === "function";

/**
 * Defines the task handler for a worker script.
 * Call this in your worker file to register the function that processes tasks.
 *
 * @template T - The input data type
 * @template R - The return type
 * @param fn - The function that processes incoming tasks
 *
 * @example
 * ```ts
 * // my-worker.ts
 * import { defineTask } from "@kage/workers";
 *
 * interface Input {
 *   numbers: number[];
 * }
 *
 * interface Output {
 *   sum: number;
 *   avg: number;
 * }
 *
 * defineTask<Input, Output>((data) => {
 *   const sum = data.numbers.reduce((a, b) => a + b, 0);
 *   return {
 *     sum,
 *     avg: sum / data.numbers.length,
 *   };
 * });
 * ```
 */
export function defineTask<T, R>(fn: TaskHandler<T, R>): void {
  handler = fn as TaskHandler;
}

if (isWorkerContext) {
  self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    if (message.type === "init") {
      self.postMessage({ type: "ready", id: message.id });
      return;
    }

    if (message.type !== "task") {
      return;
    }

    if (!handler) {
      self.postMessage({
        type: "error",
        id: message.id,
        error: "No task handler defined",
      });
      return;
    }

    try {
      const input = deserialize(message.payload);
      const result = await handler(input);
      self.postMessage({
        type: "result",
        id: message.id,
        payload: serialize(result),
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
}
