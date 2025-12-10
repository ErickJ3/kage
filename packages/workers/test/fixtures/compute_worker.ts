import { defineTask } from "../../src/worker_template.ts";

interface ComputeInput {
  operation:
    | "sum"
    | "multiply"
    | "factorial"
    | "fibonacci"
    | "primes"
    | "matrix"
    | "hash";
  value: number;
}

interface ComputeOutput {
  result: number;
  operation: string;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function fibonacci(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

// CPU-intensive: count primes up to n using sieve
function countPrimes(n: number): number {
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

// CPU-intensive: matrix multiplication NxN
function matrixMultiply(size: number): number {
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

// CPU-intensive: simulated hash computation (many iterations)
function computeHash(iterations: number): number {
  let hash = 0;
  for (let i = 0; i < iterations; i++) {
    hash = ((hash << 5) - hash + i) | 0;
    hash = Math.abs(hash ^ (hash >>> 16));
  }
  return hash;
}

defineTask<ComputeInput, ComputeOutput>((input) => {
  let result: number;

  switch (input.operation) {
    case "sum":
      result = Array.from({ length: input.value }, (_, i) => i + 1).reduce(
        (a, b) => a + b,
        0,
      );
      break;
    case "multiply":
      result = input.value * 2;
      break;
    case "factorial":
      result = factorial(input.value);
      break;
    case "fibonacci":
      result = fibonacci(input.value);
      break;
    case "primes":
      result = countPrimes(input.value);
      break;
    case "matrix":
      result = matrixMultiply(input.value);
      break;
    case "hash":
      result = computeHash(input.value);
      break;
  }

  return { result, operation: input.operation };
});
