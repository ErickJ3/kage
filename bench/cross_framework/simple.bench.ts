/**
 * Simple cross-framework benchmark using oha.
 *
 * Run with: deno run --allow-net --allow-run bench/cross_framework/simple_bench.ts
 */

interface BenchmarkResult {
  framework: string;
  scenario: string;
  requestsPerSec: number;
  avgLatency: number;
}

const FRAMEWORKS = [
  { name: "Kage", script: "kage_bench.ts" },
  { name: "Hono", script: "hono_bench.ts" },
  { name: "Oak", script: "oak_bench.ts" },
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

async function startServer(script: string): Promise<Deno.ChildProcess> {
  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-net", script],
    cwd: import.meta.dirname,
    stdout: "null",
    stderr: "null",
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
}): Promise<{ reqPerSec: number; avgLatency: number }> {
  const url = `http://localhost:3000${scenario.path}`;
  const args = [
    "-z",
    "10s", // duration
    "-c",
    "100", // connections
    "--no-tui",
    "-j", // JSON output
  ];

  if (scenario.method === "POST" && scenario.body) {
    args.push("-m", "POST");
    args.push("-d", scenario.body);
    args.push("-H", "Content-Type: application/json");
  }

  args.push(url);

  const cmd = new Deno.Command("oha", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  const stdout = new TextDecoder().decode(output.stdout);

  try {
    const json = JSON.parse(stdout);
    return {
      reqPerSec: json.summary?.requestsPerSec || 0,
      avgLatency: json.summary?.average || 0,
    };
  } catch {
    return { reqPerSec: 0, avgLatency: 0 };
  }
}

async function main() {
  console.log("Cross-Framework Benchmark Suite");
  console.log("================================\n");
  console.log("Using oha for load testing");
  console.log("Duration: 10s, Connections: 100\n");

  const results: BenchmarkResult[] = [];

  for (const framework of FRAMEWORKS) {
    console.log(`\nBenchmarking ${framework.name}...`);

    const process = await startServer(framework.script);

    for (const scenario of SCENARIOS) {
      try {
        console.log(`  ${scenario.name}...`);
        const result = await runBenchmark(scenario);
        results.push({
          framework: framework.name,
          scenario: scenario.name,
          requestsPerSec: result.reqPerSec,
          avgLatency: result.avgLatency,
        });
      } catch (error) {
        console.error(`  Error: ${(error as Error).message}`);
      }
    }

    // Stop server
    process.kill("SIGTERM");
    await process.status;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Print results
  console.log("\n\n");
  console.log("=".repeat(80));
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(80));

  for (const scenario of SCENARIOS) {
    console.log(`\n${scenario.name}:`);
    console.log("-".repeat(80));
    console.log(
      "Framework".padEnd(15) + "Req/sec".padEnd(20) + "Avg Latency (ms)",
    );
    console.log("-".repeat(80));

    const scenarioResults = results.filter((r) => r.scenario === scenario.name);
    scenarioResults.sort((a, b) => b.requestsPerSec - a.requestsPerSec);

    for (const result of scenarioResults) {
      const reqSec = result.requestsPerSec.toLocaleString("en-US", {
        maximumFractionDigits: 0,
      });
      const latency = (result.avgLatency * 1000).toFixed(2);

      console.log(
        result.framework.padEnd(15) +
          reqSec.padEnd(20) +
          latency,
      );
    }
  }

  // Summary comparison
  console.log("\n\n");
  console.log("=".repeat(80));
  console.log("SUMMARY - Average across all scenarios");
  console.log("=".repeat(80));

  const frameworkAvgs = FRAMEWORKS.map((fw) => {
    const fwResults = results.filter((r) => r.framework === fw.name);
    const avgReqSec = fwResults.reduce((sum, r) => sum + r.requestsPerSec, 0) /
      fwResults.length;
    const avgLatency = fwResults.reduce((sum, r) => sum + r.avgLatency, 0) /
      fwResults.length;

    return { framework: fw.name, avgReqSec, avgLatency };
  });

  frameworkAvgs.sort((a, b) => b.avgReqSec - a.avgReqSec);

  console.log(
    "Framework".padEnd(15) + "Avg Req/sec".padEnd(20) + "Avg Latency (ms)",
  );
  console.log("-".repeat(80));

  for (const avg of frameworkAvgs) {
    const reqSec = avg.avgReqSec.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
    const latency = (avg.avgLatency * 1000).toFixed(2);

    console.log(avg.framework.padEnd(15) + reqSec.padEnd(20) + latency);
  }

  console.log("\n");
}

if (import.meta.main) {
  main();
}
