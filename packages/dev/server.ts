/**
 * Development server with hot reload.
 *
 * Watches for file changes and automatically restarts the server.
 */

import { FileWatcher, type WatcherOptions } from "./watcher.ts";
import { createLogger, type Logger, type LogLevel } from "./logger.ts";

/**
 * Development server options.
 */
export interface DevServerOptions {
  /** Entry point file (e.g., "src/main.ts") */
  entry: string;

  /** Directories to watch (defaults to entry directory) */
  watch?: string[];

  /** File extensions to watch */
  extensions?: string[];

  /** Patterns to ignore */
  ignore?: string[];

  /** Debounce delay in ms */
  debounce?: number;

  /** Log level */
  logLevel?: LogLevel;

  /** Callback when server restarts */
  onRestart?: () => void;

  /** Callback when server crashes */
  onError?: (error: Error) => void;

  /** Deno run permissions */
  permissions?: string[];

  /** Environment variables to pass to subprocess */
  env?: Record<string, string>;
}

/**
 * Development server with automatic restart on file changes.
 *
 * @example
 * ```typescript
 * const dev = new DevServer({
 *   entry: "./src/main.ts",
 *   watch: ["./src"],
 *   permissions: ["--allow-net", "--allow-read", "--allow-env"],
 * });
 *
 * await dev.start();
 * ```
 */
export class DevServer {
  private options: Required<Omit<DevServerOptions, "onRestart" | "onError">> &
    Pick<DevServerOptions, "onRestart" | "onError">;
  private watcher: FileWatcher | null = null;
  private process: Deno.ChildProcess | null = null;
  private logger: Logger;
  private restartCount = 0;
  private running = false;
  private restarting = false;

  constructor(options: DevServerOptions) {
    // Resolve entry to absolute path
    const entryDir = options.entry.substring(0, options.entry.lastIndexOf("/")) || ".";

    this.options = {
      entry: options.entry,
      watch: options.watch ?? [entryDir],
      extensions: options.extensions ?? [".ts", ".tsx", ".js", ".jsx", ".json"],
      ignore: options.ignore ?? ["node_modules", ".git", "coverage", "dist"],
      debounce: options.debounce ?? 300,
      logLevel: options.logLevel ?? "info",
      onRestart: options.onRestart,
      onError: options.onError,
      permissions: options.permissions ?? ["--allow-all"],
      env: options.env ?? {},
    };

    this.logger = createLogger({
      prefix: "kage:dev",
      level: this.options.logLevel,
    });
  }

  /**
   * Start the development server.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn("Server already running");
      return;
    }

    this.running = true;
    this.printBanner();

    // Start the subprocess
    await this.startProcess();

    // Start watching files
    this.startWatcher();

    // Handle graceful shutdown
    this.setupSignalHandlers();
  }

  /**
   * Stop the development server.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.watcher?.stop();
    await this.killProcess();
    this.logger.info("Development server stopped");
  }

  /**
   * Get restart count.
   */
  getRestartCount(): number {
    return this.restartCount;
  }

  private printBanner(): void {
    console.log();
    console.log("\x1b[36m\x1b[1m  ⚡ Kage Dev Server\x1b[0m");
    console.log();
    console.log(`  \x1b[90mEntry:\x1b[0m     ${this.options.entry}`);
    console.log(`  \x1b[90mWatching:\x1b[0m  ${this.options.watch.join(", ")}`);
    console.log();
  }

  private async startProcess(): Promise<void> {
    const args = [
      "run",
      ...this.options.permissions,
      this.options.entry,
    ];

    this.logger.debug(`Starting: deno ${args.join(" ")}`);

    const command = new Deno.Command("deno", {
      args,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...Deno.env.toObject(),
        ...this.options.env,
        KAGE_DEV: "true",
      },
    });

    this.process = command.spawn();

    // Monitor process exit
    this.process.status.then((status) => {
      if (!this.running) return;

      if (!status.success && !this.restarting) {
        this.logger.error(`Process exited with code ${status.code}`);
        if (this.options.onError) {
          this.options.onError(new Error(`Process exited with code ${status.code}`));
        }
      }
    }).catch((error) => {
      if (this.running && !this.restarting) {
        this.logger.error("Process error:", error);
        if (this.options.onError) {
          this.options.onError(error);
        }
      }
    });
  }

  private async killProcess(): Promise<void> {
    if (!this.process) return;

    try {
      this.process.kill("SIGTERM");
      // Wait a bit for graceful shutdown
      await Promise.race([
        this.process.status,
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    } catch {
      // Process might already be dead
    }

    try {
      this.process.kill("SIGKILL");
    } catch {
      // Ignore
    }

    this.process = null;
  }

  private async restart(): Promise<void> {
    if (this.restarting) return;
    this.restarting = true;

    this.restartCount++;
    console.log(); // Empty line before restart message
    this.logger.info(`\x1b[33mRestarting...\x1b[0m (${this.restartCount})`);

    await this.killProcess();
    await this.startProcess();

    if (this.options.onRestart) {
      this.options.onRestart();
    }

    this.restarting = false;
  }

  private startWatcher(): void {
    const watcherOptions: WatcherOptions = {
      paths: this.options.watch,
      extensions: this.options.extensions,
      ignore: this.options.ignore,
      debounce: this.options.debounce,
      logger: this.logger.child("watcher"),
    };

    this.watcher = new FileWatcher(watcherOptions);

    this.watcher.on("change", (event) => {
      this.logger.debug(`Change detected: ${event.type} - ${event.paths.length} file(s)`);
      this.restart();
    });

    // Start watcher in background
    this.watcher.start().catch((error) => {
      this.logger.error("Watcher failed:", error);
    });
  }

  private setupSignalHandlers(): void {
    const signals: Deno.Signal[] = ["SIGINT", "SIGTERM"];

    for (const signal of signals) {
      try {
        Deno.addSignalListener(signal, async () => {
          this.logger.info(`Received ${signal}, shutting down...`);
          await this.stop();
          Deno.exit(0);
        });
      } catch {
        // Signal handling might not be available on all platforms
      }
    }
  }
}

/**
 * Quick helper to start a dev server.
 *
 * @example
 * ```typescript
 * import { dev } from "@kage/dev";
 *
 * await dev("./src/main.ts");
 * ```
 */
export async function dev(
  entry: string,
  options: Omit<DevServerOptions, "entry"> = {},
): Promise<DevServer> {
  const server = new DevServer({ entry, ...options });
  await server.start();
  return server;
}
