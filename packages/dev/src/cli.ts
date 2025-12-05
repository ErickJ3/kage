#!/usr/bin/env -S deno run --allow-all
/**
 * Kage CLI for development.
 */

import { DevServer } from "./server.ts";
import { createLogger } from "./logger.ts";

const VERSION = "0.1.0";

const HELP = `
\x1b[36m\x1b[1mKage CLI\x1b[0m v${VERSION}

\x1b[1mUSAGE:\x1b[0m
  kage <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  dev <entry>     Start development server with hot reload

\x1b[1mOPTIONS:\x1b[0m
  --watch, -w     Directories to watch (comma-separated)
  --ignore, -i    Patterns to ignore (comma-separated)
  --port, -p      Port for the server (passed as env PORT)
  --help, -h      Show this help message
  --version, -v   Show version

\x1b[1mEXAMPLES:\x1b[0m
  kage dev src/main.ts
  kage dev src/main.ts --watch src,lib
  kage dev src/main.ts --port 3000
`;

interface ParsedArgs {
  command: string;
  entry?: string;
  watch?: string[];
  ignore?: string[];
  port?: number;
  help: boolean;
  version: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: "",
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--watch" || arg === "-w") {
      i++;
      result.watch = args[i]?.split(",").map((s) => s.trim());
    } else if (arg === "--ignore" || arg === "-i") {
      i++;
      result.ignore = args[i]?.split(",").map((s) => s.trim());
    } else if (arg === "--port" || arg === "-p") {
      i++;
      result.port = parseInt(args[i], 10);
    } else if (!arg.startsWith("-")) {
      if (!result.command) {
        result.command = arg;
      } else if (!result.entry) {
        result.entry = arg;
      }
    }

    i++;
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args);
  const logger = createLogger({ prefix: "kage" });

  if (args.help) {
    console.log(HELP);
    Deno.exit(0);
  }

  if (args.version) {
    console.log(`kage v${VERSION}`);
    Deno.exit(0);
  }

  if (!args.command) {
    console.log(HELP);
    Deno.exit(1);
  }

  switch (args.command) {
    case "dev": {
      if (!args.entry) {
        logger.error("Missing entry file. Usage: kage dev <entry>");
        Deno.exit(1);
      }

      const dev = new DevServer({
        entry: args.entry,
        watch: args.watch,
        ignore: args.ignore,
        env: args.port ? { PORT: String(args.port) } : undefined,
        onError: (error) => {
          logger.error("Server error:", error.message);
        },
      });

      await dev.start();
      break;
    }

    default:
      logger.error(`Unknown command: ${args.command}`);
      console.log(HELP);
      Deno.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
