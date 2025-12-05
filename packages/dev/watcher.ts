/**
 * File watcher for hot reload.
 *
 * Uses Deno's native file system watcher with debouncing.
 */

import { createLogger, type Logger } from "./logger.ts";

/**
 * File change event types.
 */
export type FileChangeType = "create" | "modify" | "remove";

/**
 * File change event.
 */
export interface FileChangeEvent {
  type: FileChangeType;
  paths: string[];
}

/**
 * Watcher configuration options.
 */
export interface WatcherOptions {
  /** Directories to watch */
  paths: string[];

  /** File extensions to watch (e.g., [".ts", ".tsx"]) */
  extensions?: string[];

  /** Patterns to ignore (glob patterns) */
  ignore?: string[];

  /** Debounce delay in milliseconds (default: 100) */
  debounce?: number;

  /** Logger instance */
  logger?: Logger;
}

/**
 * File watcher with debouncing and filtering.
 *
 * @example
 * ```typescript
 * const watcher = new FileWatcher({
 *   paths: ["./src"],
 *   extensions: [".ts", ".tsx"],
 *   ignore: ["node_modules", ".git"],
 * });
 *
 * watcher.on("change", (event) => {
 *   console.log("Files changed:", event.paths);
 * });
 *
 * await watcher.start();
 * ```
 */
export class FileWatcher {
  private options: Required<WatcherOptions>;
  private watcher: Deno.FsWatcher | null = null;
  private handlers: Map<string, Set<(event: FileChangeEvent) => void>> = new Map();
  private debounceTimer: number | null = null;
  private pendingChanges: Map<string, FileChangeType> = new Map();
  private logger: Logger;
  private running = false;

  constructor(options: WatcherOptions) {
    this.options = {
      paths: options.paths,
      extensions: options.extensions ?? [".ts", ".tsx", ".js", ".jsx", ".json"],
      ignore: options.ignore ?? ["node_modules", ".git", "coverage", "dist"],
      debounce: options.debounce ?? 100,
      logger: options.logger ?? createLogger({ prefix: "kage:watcher" }),
    };
    this.logger = this.options.logger;
  }

  /**
   * Register an event handler.
   */
  on(event: "change", handler: (event: FileChangeEvent) => void): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove an event handler.
   */
  off(event: "change", handler: (event: FileChangeEvent) => void): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  /**
   * Start watching for file changes.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn("Watcher already running");
      return;
    }

    this.running = true;
    this.logger.info(`Watching ${this.options.paths.join(", ")}`);
    this.logger.debug(`Extensions: ${this.options.extensions.join(", ")}`);

    try {
      this.watcher = Deno.watchFs(this.options.paths, { recursive: true });

      for await (const event of this.watcher) {
        if (!this.running) break;
        this.handleFsEvent(event);
      }
    } catch (error) {
      if (this.running) {
        this.logger.error("Watcher error:", error);
        throw error;
      }
    }
  }

  /**
   * Stop watching for file changes.
   */
  stop(): void {
    this.running = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges.clear();
    this.logger.info("Watcher stopped");
  }

  /**
   * Check if watcher is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  private handleFsEvent(event: Deno.FsEvent): void {
    const filteredPaths = event.paths.filter((path) => this.shouldWatch(path));
    if (filteredPaths.length === 0) return;

    const changeType = this.mapEventKind(event.kind);
    for (const path of filteredPaths) {
      this.pendingChanges.set(path, changeType);
    }

    // Debounce
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, this.options.debounce);
  }

  private flushChanges(): void {
    if (this.pendingChanges.size === 0) return;

    // Group by change type
    const changes: Map<FileChangeType, string[]> = new Map();

    for (const [path, type] of this.pendingChanges) {
      if (!changes.has(type)) {
        changes.set(type, []);
      }
      changes.get(type)!.push(path);
    }

    this.pendingChanges.clear();

    // Emit events
    for (const [type, paths] of changes) {
      const event: FileChangeEvent = { type, paths };
      this.emit("change", event);
      this.logger.debug(`${type}: ${paths.join(", ")}`);
    }
  }

  private emit(eventName: string, event: FileChangeEvent): void {
    const handlers = this.handlers.get(eventName);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.error("Handler error:", error);
      }
    }
  }

  private shouldWatch(path: string): boolean {
    // Check extension
    const hasValidExtension = this.options.extensions.some((ext) =>
      path.endsWith(ext)
    );
    if (!hasValidExtension) return false;

    // Check ignore patterns
    const isIgnored = this.options.ignore.some((pattern) =>
      path.includes(pattern)
    );
    if (isIgnored) return false;

    return true;
  }

  private mapEventKind(kind: Deno.FsEvent["kind"]): FileChangeType {
    switch (kind) {
      case "create":
        return "create";
      case "remove":
        return "remove";
      case "modify":
      case "access":
      case "any":
      case "other":
      default:
        return "modify";
    }
  }
}
