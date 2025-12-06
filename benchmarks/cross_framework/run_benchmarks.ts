/**
 * Cross-framework benchmark runner.
 *
 * Runs all framework benchmarks and compares results.
 * Uses oha for load testing.
 */
interface BenchmarkResult {
  framework: string;
  scenario: string;
  requestsPerSec: number;
  latency50: number;
  latency99: number;
}

const FRAMEWORKS = [
  { name: "Kage", script: "kage.bench.ts", runtime: "deno" },
  { name: "Hono", script: "hono.bench.ts", runtime: "deno" },
  { name: "Oak", script: "oak.bench.ts", runtime: "deno" },
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

async function checkRuntime(runtime: string): Promise<boolean> {
  try {
    const cmd = new Deno.Command(runtime, {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    return output.code === 0;
  } catch {
    return false;
  }
}

async function startServer(framework: {
  name: string;
  script: string;
  runtime: string;
}): Promise<Deno.ChildProcess> {
  console.log(`Starting ${framework.name} server (${framework.runtime})...`);

  let args: string[];
  if (framework.runtime === "deno") {
    args = ["run", "--allow-net", "--allow-env", framework.script];
  } else if (framework.runtime === "bun") {
    args = ["run", framework.script];
  } else {
    throw new Error(`Unknown runtime: ${framework.runtime}`);
  }

  const cmd = new Deno.Command(framework.runtime, {
    args,
    cwd: import.meta.dirname,
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();

  const stderrReader = process.stderr.getReader();
  const readStderr = async () => {
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch {
      // ignore
    }

    return new TextDecoder().decode(
      new Uint8Array(
        chunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]),
      ),
    );
  };

  const stderrPromise = readStderr();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const status = await Promise.race([
    process.status.then((s) => ({ exited: true, ...s })),
    new Promise<{ exited: false }>((resolve) =>
      setTimeout(() => resolve({ exited: false }), 100)
    ),
  ]);

  if (status.exited) {
    const stderr = await stderrPromise;
    throw new Error(
      `${framework.name} server failed to start. Exit code: ${
        (status as { code: number }).code
      }\nStderr: ${stderr}`,
    );
  }

  return process;
}

async function stopServer(process: Deno.ChildProcess): Promise<void> {
  try {
    process.kill("SIGTERM");
  } catch {
    // ignore
  }

  try {
    await process.status;
  } catch {
    // ignore
  }
}

function parseOhaOutput(output: string): {
  reqPerSec: number;
  latency50: number;
  latency99: number;
} {
  const reqPerSecMatch = output.match(/Requests\/sec:\s+([\d.]+)/);
  const reqPerSec = reqPerSecMatch ? parseFloat(reqPerSecMatch[1]) : 0;

  const latency50Match = output.match(/50\.00%\s+in\s+([\d.]+)\s+(\w+)/);
  let latency50 = 0;
  if (latency50Match) {
    latency50 = parseFloat(latency50Match[1]);
    if (latency50Match[2] === "s") latency50 *= 1000;
  }

  const latency99Match = output.match(/99\.00%\s+in\s+([\d.]+)\s+(\w+)/);
  let latency99 = 0;
  if (latency99Match) {
    latency99 = parseFloat(latency99Match[1]);
    if (latency99Match[2] === "s") latency99 *= 1000;
  }

  return { reqPerSec, latency50, latency99 };
}

async function runBenchmark(scenario: {
  name: string;
  path: string;
  method: string;
  body: string | null;
}): Promise<{ reqPerSec: number; latency50: number; latency99: number }> {
  const url = `http://localhost:3000${scenario.path}`;
  const args = [
    "-z",
    DURATION,
    "-c",
    CONNECTIONS,
    "--no-tui",
    "-m",
    scenario.method,
  ];

  if (scenario.method === "POST" && scenario.body) {
    args.push("-H", "Content-Type: application/json", "-d", scenario.body);
  }

  args.push(url);

  console.log(`  Running: ${scenario.name}...`);

  const cmd = new Deno.Command("oha", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  const stdout = new TextDecoder().decode(output.stdout);

  return parseOhaOutput(stdout);
}

async function main() {
  console.log("Cross-Framework Benchmark Suite");
  console.log("================================\n");

  const availableRuntimes = new Set<string>();
  for (const runtime of ["deno", "bun"]) {
    if (await checkRuntime(runtime)) {
      availableRuntimes.add(runtime);
      console.log(`✓ ${runtime} available`);
    } else {
      console.log(`✗ ${runtime} not found`);
    }
  }
  console.log("");

  const results: BenchmarkResult[] = [];

  for (const framework of FRAMEWORKS) {
    if (!availableRuntimes.has(framework.runtime)) {
      console.log(
        `\nSkipping ${framework.name} (${framework.runtime} not available)`,
      );
      continue;
    }

    console.log(`\nBenchmarking ${framework.name}:`);
    console.log("=".repeat(40));

    let process: Deno.ChildProcess;
    try {
      process = await startServer(framework);
    } catch (error) {
      console.error(`  Failed to start server: ${(error as Error).message}`);
      continue;
    }

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

    await stopServer(process);
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
          `${result.latency50.toFixed(2)} ms`.padEnd(15) +
          `${result.latency99.toFixed(2)} ms`,
      );
    }
  }

  console.log("\n");
}

if (import.meta.main) {
  main();
}
