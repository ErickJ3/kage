import { terminateAllInline, worker } from "../packages/workers/src/mod.ts";

// workers

const countPrimes = worker(
  (n: number) => {
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
  { minWorkers: 4, maxWorkers: 8, name: "primes" },
);

const matrixMultiply = worker(
  (size: number) => {
    const a: number[][] = [];
    const b: number[][] = [];
    const c: number[][] = [];

    for (let i = 0; i < size; i++) {
      a[i] = [];
      b[i] = [];
      c[i] = [];
      for (let j = 0; j < size; j++) {
        a[i][j] = Math.random();
        b[i][j] = Math.random();
        c[i][j] = 0;
      }
    }

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        for (let k = 0; k < size; k++) {
          c[i][j] += a[i][k] * b[k][j];
        }
      }
    }

    return c[0][0];
  },
  { minWorkers: 4, maxWorkers: 8, name: "matrix" },
);

const computeHash = worker(
  (iterations: number) => {
    let hash = 0;
    for (let i = 0; i < iterations; i++) {
      hash = ((hash << 5) - hash + i) | 0;
      hash = Math.abs(hash ^ (hash >>> 16));
    }
    return hash;
  },
  { minWorkers: 4, maxWorkers: 8, name: "hash" },
);

// sync implementations

function countPrimesSync(n: number): number {
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
}

function matrixMultiplySync(size: number): number {
  const a: number[][] = [];
  const b: number[][] = [];
  const c: number[][] = [];

  for (let i = 0; i < size; i++) {
    a[i] = [];
    b[i] = [];
    c[i] = [];
    for (let j = 0; j < size; j++) {
      a[i][j] = Math.random();
      b[i][j] = Math.random();
      c[i][j] = 0;
    }
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      for (let k = 0; k < size; k++) {
        c[i][j] += a[i][k] * b[k][j];
      }
    }
  }

  return c[0][0];
}

function computeHashSync(iterations: number): number {
  let hash = 0;
  for (let i = 0; i < iterations; i++) {
    hash = ((hash << 5) - hash + i) | 0;
    hash = Math.abs(hash ^ (hash >>> 16));
  }
  return hash;
}

// single task

Deno.bench({
  name: "worker - primes(100_000)",
  async fn() {
    await countPrimes(100_000);
  },
});

Deno.bench({
  name: "sync   - primes(100_000)",
  fn() {
    countPrimesSync(100_000);
  },
});

Deno.bench({
  name: "worker - matrix(100x100)",
  async fn() {
    await matrixMultiply(100);
  },
});

Deno.bench({
  name: "sync   - matrix(100x100)",
  fn() {
    matrixMultiplySync(100);
  },
});

Deno.bench({
  name: "worker - hash(1_000_000)",
  async fn() {
    await computeHash(1_000_000);
  },
});

Deno.bench({
  name: "sync   - hash(1_000_000)",
  fn() {
    computeHashSync(1_000_000);
  },
});

// parallel (4 tasks)

Deno.bench({
  name: "workers parallel - 4x primes(100_000)",
  async fn() {
    await countPrimes.map([100_000, 100_000, 100_000, 100_000]);
  },
});

Deno.bench({
  name: "sync sequential  - 4x primes(100_000)",
  fn() {
    countPrimesSync(100_000);
    countPrimesSync(100_000);
    countPrimesSync(100_000);
    countPrimesSync(100_000);
  },
});

Deno.bench({
  name: "workers parallel - 4x matrix(100x100)",
  async fn() {
    await matrixMultiply.map([100, 100, 100, 100]);
  },
});

Deno.bench({
  name: "sync sequential  - 4x matrix(100x100)",
  fn() {
    matrixMultiplySync(100);
    matrixMultiplySync(100);
    matrixMultiplySync(100);
    matrixMultiplySync(100);
  },
});

// heavy (8 tasks)

Deno.bench({
  name: "workers parallel - 8x hash(500_000)",
  async fn() {
    await computeHash.map([
      500_000,
      500_000,
      500_000,
      500_000,
      500_000,
      500_000,
      500_000,
      500_000,
    ]);
  },
});

Deno.bench({
  name: "sync sequential  - 8x hash(500_000)",
  fn() {
    for (let i = 0; i < 8; i++) {
      computeHashSync(500_000);
    }
  },
});

globalThis.addEventListener("unload", () => {
  terminateAllInline();
});
