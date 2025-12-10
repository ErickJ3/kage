import { assertEquals, assertRejects } from "@std/assert";
import { afterAll, describe, it } from "@std/testing/bdd";
import { terminateAllInline, worker } from "../src/mod.ts";

describe("worker()", () => {
  afterAll(() => {
    terminateAllInline();
  });

  describe("basic execution", () => {
    it("should execute a simple computation", async () => {
      const double = worker((n: number) => n * 2);

      const result = await double(5);
      assertEquals(result, 10);

      double.terminate();
    });

    it("should execute async functions", async () => {
      const asyncDouble = worker(async (n: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return n * 2;
      });

      const result = await asyncDouble(7);
      assertEquals(result, 14);

      asyncDouble.terminate();
    });

    it("should handle objects", async () => {
      interface Input {
        a: number;
        b: number;
      }

      const add = worker((input: Input) => input.a + input.b);

      const result = await add({ a: 3, b: 4 });
      assertEquals(result, 7);

      add.terminate();
    });

    it("should handle arrays", async () => {
      const sum = worker((nums: number[]) => nums.reduce((a, b) => a + b, 0));

      const result = await sum([1, 2, 3, 4, 5]);
      assertEquals(result, 15);

      sum.terminate();
    });
  });

  describe("map operation", () => {
    it("should process multiple items in parallel", async () => {
      const square = worker((n: number) => n * n);

      const results = await square.map([1, 2, 3, 4]);
      assertEquals(results, [1, 4, 9, 16]);

      square.terminate();
    });

    it("should handle heavy parallel workload", async () => {
      const heavyWork = worker((n: number) => {
        let sum = 0;
        for (let i = 0; i < n; i++) {
          sum += i;
        }
        return sum;
      }, { minWorkers: 4, maxWorkers: 4 });

      const results = await heavyWork.map([10000, 10000, 10000, 10000]);
      assertEquals(results, [49995000, 49995000, 49995000, 49995000]);

      heavyWork.terminate();
    });
  });

  describe("error handling", () => {
    it("should propagate errors from worker", async () => {
      const failing = worker((_n: number) => {
        throw new Error("Intentional error");
      });

      await assertRejects(
        () => failing(1),
        Error,
        "Intentional error",
      );

      failing.terminate();
    });
  });

  describe("pool reuse", () => {
    it("should reuse pool with same name", async () => {
      const fn1 = worker((n: number) => n * 2, { name: "shared-pool" });
      const fn2 = worker((n: number) => n * 3, { name: "shared-pool" });

      // Both should use the same pool, so fn2 will actually use fn1's handler
      const result1 = await fn1(5);
      const result2 = await fn2(5);

      // Both use the first registered handler
      assertEquals(result1, 10);
      assertEquals(result2, 10);

      fn1.terminate();
    });
  });
});
