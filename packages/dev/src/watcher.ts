/**
 * File watcher for hot reload.
 */

import { createLogger, type Logger } from "~/logger.ts";

export type FileChangeType = "create" | "modify" | "remove";

export interface FileChangeEvent {
  type: FileChangeType;
  paths: string[];
}

export interface WatcherOptions {
  paths: string[];
  extensions?: string[];
  ignore?: string[];
  debounce?: number;
  logger?: Logger;
}

export class FileWatcher {
  private options: Required<WatcherOptions>;
  private watcher: Deno.FsWatcher | null = null;
  private handlers: Map<string, Set<(event: FileChangeEvent) => void>> =
    new Map();
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

  on(event: "change", handler: (event: FileChangeEvent) => void): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: "change", handler: (event: FileChangeEvent) => void): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

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

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, this.options.debounce);
  }

  private flushChanges(): void {
    if (this.pendingChanges.size === 0) return;

    const changes: Map<FileChangeType, string[]> = new Map();

    for (const [path, type] of this.pendingChanges) {
      if (!changes.has(type)) {
        changes.set(type, []);
      }
      changes.get(type)!.push(path);
    }

    this.pendingChanges.clear();

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
    const hasValidExtension = this.options.extensions.some((ext) =>
      path.endsWith(ext)
    );
    if (!hasValidExtension) return false;

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
