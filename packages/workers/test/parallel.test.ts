import { assertEquals, assertRejects } from "@std/assert";
import { afterAll, describe, it } from "@std/testing/bdd";
import { parallel, terminateAll } from "../src/parallel.ts";
import { WorkerPool } from "../src/pool.ts";

const COMPUTE_WORKER = new URL("./fixtures/compute_worker.ts", import.meta.url);
const ECHO_WORKER = new URL("./fixtures/echo_worker.ts", import.meta.url);
const ERROR_WORKER = new URL("./fixtures/error_worker.ts", import.meta.url);
const SLOW_WORKER = new URL("./fixtures/slow_worker.ts", import.meta.url);

interface ComputeInput {
  operation: "sum" | "multiply" | "factorial" | "fibonacci";
  value: number;
}

interface ComputeOutput {
  result: number;
  operation: string;
}

afterAll(() => {
  terminateAll();
});

describe("parallel", () => {
  describe("basic execution", () => {
    it("should execute a simple computation in worker", async () => {
      const executor = parallel<ComputeInput, ComputeOutput>(COMPUTE_WORKER);

      const result = await executor.exec({ operation: "multiply", value: 21 });
      assertEquals(result.result, 42);
      assertEquals(result.operation, "multiply");

      executor.terminate();
    });

    it("should execute factorial computation", async () => {
      const executor = parallel<ComputeInput, ComputeOutput>(COMPUTE_WORKER, {
        name: "factorial-pool",
      });

      const result = await executor.exec({ operation: "factorial", value: 5 });
      assertEquals(result.result, 120);

      executor.terminate();
    });

    it("should execute sum computation", async () => {
      const executor = parallel<ComputeInput, ComputeOutput>(COMPUTE_WORKER, {
        name: "sum-pool",
      });

      const result = await executor.exec({ operation: "sum", value: 10 });
      assertEquals(result.result, 55);

      executor.terminate();
    });

    it("should echo data back", async () => {
      const executor = parallel<unknown, unknown>(ECHO_WORKER, {
        name: "echo-pool",
      });

      const testData = { message: "hello", numbers: [1, 2, 3] };
      const result = await executor.exec(testData);
      assertEquals(result, testData);

      executor.terminate();
    });
  });

  describe("map operation", () => {
    it("should process multiple items in parallel", async () => {
      const executor = parallel<ComputeInput, ComputeOutput>(COMPUTE_WORKER, {
        name: "map-pool",
        minWorkers: 2,
        maxWorkers: 4,
      });

      const inputs: ComputeInput[] = [
        { operation: "fibonacci", value: 10 },
        { operation: "fibonacci", value: 15 },
        { operation: "fibonacci", value: 20 },
        { operation: "fibonacci", value: 25 },
      ];

      const results = await executor.map(inputs);
      assertEquals(results.length, 4);
      assertEquals(results[0].result, 55);
      assertEquals(results[1].result, 610);
      assertEquals(results[2].result, 6765);
      assertEquals(results[3].result, 75025);

      executor.terminate();
    });
  });

  describe("error handling", () => {
    it("should propagate worker errors", async () => {
      const executor = parallel<{ shouldThrow: boolean }, string>(
        ERROR_WORKER,
        {
          name: "error-pool",
        },
      );

      await assertRejects(
        () => executor.exec({ shouldThrow: true }),
        Error,
        "Intentional worker error",
      );

      const success = await executor.exec({ shouldThrow: false });
      assertEquals(success, "success");

      executor.terminate();
    });

    it("should handle task timeout", async () => {
      const executor = parallel<{ delay: number }, string>(SLOW_WORKER, {
        name: "timeout-pool",
        taskTimeout: 100,
      });

      await assertRejects(
        () => executor.exec({ delay: 500 }),
        Error,
        "Task timeout",
      );

      executor.terminate();
    });
  });

  describe("metrics", () => {
    it("should track execution metrics", async () => {
      const executor = parallel<ComputeInput, ComputeOutput>(COMPUTE_WORKER, {
        name: "metrics-pool",
        minWorkers: 1,
        maxWorkers: 2,
      });

      const initialMetrics = executor.metrics();
      assertEquals(initialMetrics.completedTasks, 0);
      assertEquals(initialMetrics.totalWorkers, 1);

      await executor.exec({ operation: "multiply", value: 5 });
      await executor.exec({ operation: "multiply", value: 10 });

      const afterMetrics = executor.metrics();
      assertEquals(afterMetrics.completedTasks, 2);
      assertEquals(afterMetrics.totalWorkers >= 1, true);

      executor.terminate();
    });
  });
});

describe("WorkerPool", () => {
  describe("pool management", () => {
    it("should respect minWorkers setting", () => {
      const pool = new WorkerPool(ECHO_WORKER, {
        minWorkers: 3,
        maxWorkers: 5,
      });
      const metrics = pool.metrics();
      assertEquals(metrics.totalWorkers, 3);
      pool.terminate();
    });

    it("should resize pool", () => {
      const pool = new WorkerPool(ECHO_WORKER, {
        minWorkers: 1,
        maxWorkers: 4,
      });
      assertEquals(pool.metrics().totalWorkers, 1);

      pool.resize(2, 6);
      assertEquals(pool.metrics().totalWorkers, 2);

      pool.terminate();
    });

    it("should reject tasks after termination", async () => {
      const pool = new WorkerPool(ECHO_WORKER, { minWorkers: 1 });
      pool.terminate();

      await assertRejects(
        () => pool.exec("test"),
        Error,
        "Pool has been terminated",
      );
    });
  });
});
