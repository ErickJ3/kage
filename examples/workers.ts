import { Kage } from "../packages/core/src/mod.ts";
import { worker } from "../packages/workers/src/mod.ts";

// worker inline - no separate file needed!
const fibonacci = worker(
  (n: number): number => {
    if (n <= 1) return n;
    let a = 0; 
    let b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    return b;
  },
  { minWorkers: 2, maxWorkers: 4, name: "fibonacci", trackMetrics: true },
);

const countPrimes = worker(
  (n: number): number => {
    if (n < 2) return 0;
    const sieve = new Uint8Array(n + 1);
    let count = 0;
    for (let i = 2; i <= n; i++) {
      if (sieve[i] === 0) {
        count++;
        for (let j = i * 2; j <= n; j += i) {
          sieve[j] = 1;
        }
      }
    }
    return count;
  },
  { minWorkers: 2, maxWorkers: 4, name: "primes" },
);

const app = new Kage()
  .get("/fibonacci/:n", async (ctx) => {
    const n = parseInt(ctx.params.n, 10);

    // Use worker like a normal async function :)
    const result = await fibonacci(n);

    return ctx.json({ n, fibonacci: result });
  })
  .get("/primes/:n", async (ctx) => {
    const n = parseInt(ctx.params.n, 10);

    const count = await countPrimes(n);

    return ctx.json({ n, primeCount: count });
  })
  .get("/batch", async (ctx) => {
    // Multiple calculations in parallel using .map()
    const inputs = [10, 20, 30, 40];
    const results = await fibonacci.map(inputs);

    return ctx.json({
      inputs,
      results,
    });
  })
  .get("/parallel-heavy", async (ctx) => {
    const start = performance.now();

    // 4 prime calculations in parallel
    const results = await countPrimes.map([100_000, 100_000, 100_000, 100_000]);

    const elapsed = performance.now() - start;

    return ctx.json({
      results,
      elapsedMs: elapsed.toFixed(2),
      note: "Compare with sequential: would take ~4x longer",
    });
  });

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Server running on http://${hostname}:${port}`);
    console.log("\nEndpoints:");
    console.log("  GET /fibonacci/:n    - Calculate fibonacci in worker");
    console.log("  GET /primes/:n       - Count primes up to n in worker");
    console.log(
      "  GET /batch           - Process multiple fibonacci in parallel",
    );
    console.log(
      "  GET /parallel-heavy  - Demo parallel speedup with CPU-intensive task",
    );
  },
});
