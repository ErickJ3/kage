/**
 * Cross-framework benchmark runner.
 *
 * Runs all framework benchmarks and compares results.
 * Uses wrk for load testing.
 */

interface BenchmarkResult {
  framework: string;
  scenario: string;
  requestsPerSec: number;
  latency50: number;
  latency99: number;
}

const FRAMEWORKS = [
  { name: "Kage", script: "kage_bench.ts", runtime: "deno" },
  { name: "Hono", script: "hono_bench.ts", runtime: "deno" },
  { name: "Oak", script: "oak_bench.ts", runtime: "deno" },
];

const SCENARIOS = [
  { name: "Simple Route", path: "/", method: "GET", body: null },
  {
    name: "Parameterized Route",
    path: "/users/123",
    method: "GET",
    body: null,
  },
  {
    name: "JSON Body Parsing",
    path: "/users",
    method: "POST",
    body: '{"name":"Alice","email":"alice@example.com"}',
  },
  { name: "Middleware Chain", path: "/middleware", method: "GET", body: null },
];

const DURATION = "10s";
const CONNECTIONS = "100";
const THREADS = "4";

async function startServer(
  framework: { name: string; script: string; runtime: string },
): Promise<Deno.ChildProcess> {
  console.log(`Starting ${framework.name} server...`);

  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-net", framework.script],
    cwd: import.meta.dirname,
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return process;
}

async function runBenchmark(scenario: {
  name: string;
  path: string;
  method: string;
  body: string | null;
}): Promise<{ reqPerSec: number; latency50: number; latency99: number }> {
  const url = `http://localhost:3000${scenario.path}`;
  const args = [
    "-t",
    THREADS,
    "-c",
    CONNECTIONS,
    "-d",
    DURATION,
    "--latency",
  ];

  if (scenario.method === "POST" && scenario.body) {
    args.push(
      "-s",
      "-",
      "--",
      "-H",
      "Content-Type: application/json",
      "-m",
      "POST",
      "-d",
      scenario.body,
    );
  }

  args.push(url);

  console.log(`  Running: ${scenario.name}...`);

  const cmd = new Deno.Command("wrk", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  const stdout = new TextDecoder().decode(output.stdout);

  // Parse wrk output
  const reqPerSecMatch = stdout.match(/Requests\/sec:\s+([\d.]+)/);
  const latency50Match = stdout.match(/50%\s+([\d.]+)(\w+)/);
  const latency99Match = stdout.match(/99%\s+([\d.]+)(\w+)/);

  return {
    reqPerSec: reqPerSecMatch ? parseFloat(reqPerSecMatch[1]) : 0,
    latency50: latency50Match ? parseFloat(latency50Match[1]) : 0,
    latency99: latency99Match ? parseFloat(latency99Match[1]) : 0,
  };
}

async function main() {
  console.log("Cross-Framework Benchmark Suite\n");
  console.log("================================\n");

  const results: BenchmarkResult[] = [];

  for (const framework of FRAMEWORKS) {
    console.log(`\nBenchmarking ${framework.name}:`);
    console.log("=".repeat(40));

    const process = await startServer(framework);

    for (const scenario of SCENARIOS) {
      try {
        const result = await runBenchmark(scenario);
        results.push({
          framework: framework.name,
          scenario: scenario.name,
          requestsPerSec: result.reqPerSec,
          latency50: result.latency50,
          latency99: result.latency99,
        });
      } catch (error) {
        console.error(`  Error: ${(error as Error).message}`);
      }
    }

    // Stop server
    process.kill("SIGTERM");
    await process.status;

    // Cleanup time
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Print results
  console.log("\n\n");
  console.log("Benchmark Results");
  console.log("=".repeat(80));

  for (const scenario of SCENARIOS) {
    console.log(`\n${scenario.name}:`);
    console.log("-".repeat(80));
    console.log(
      "Framework".padEnd(15) +
        "Req/sec".padEnd(15) +
        "Latency(p50)".padEnd(15) +
        "Latency(p99)",
    );
    console.log("-".repeat(80));

    const scenarioResults = results.filter((r) => r.scenario === scenario.name);
    scenarioResults.sort((a, b) => b.requestsPerSec - a.requestsPerSec);

    for (const result of scenarioResults) {
      console.log(
        result.framework.padEnd(15) +
          result.requestsPerSec.toFixed(2).padEnd(15) +
          result.latency50.toFixed(2).padEnd(15) +
          result.latency99.toFixed(2),
      );
    }
  }

  console.log("\n");
}

if (import.meta.main) {
  main();
}
