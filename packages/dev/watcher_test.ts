/**
 * Tests for the file watcher module.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { FileWatcher } from "./watcher.ts";
import { createLogger } from "./logger.ts";

describe("FileWatcher", () => {
  it("should create a watcher with options", () => {
    const watcher = new FileWatcher({
      paths: ["./src"],
      extensions: [".ts"],
      ignore: ["node_modules"],
      logger: createLogger({ level: "silent" }),
    });

    assertEquals(watcher.isRunning(), false);
  });

  it("should register and unregister handlers", () => {
    const watcher = new FileWatcher({
      paths: ["./src"],
      logger: createLogger({ level: "silent" }),
    });

    const handler = () => {};

    watcher.on("change", handler);
    watcher.off("change", handler);
  });

  it("should report running state correctly", () => {
    const watcher = new FileWatcher({
      paths: ["./src"],
      logger: createLogger({ level: "silent" }),
    });

    assertEquals(watcher.isRunning(), false);
    // Note: We can't easily test start() without creating real files
    // but we verify the interface works
  });

  it("should stop gracefully when not started", () => {
    const watcher = new FileWatcher({
      paths: ["./src"],
      logger: createLogger({ level: "silent" }),
    });

    // Should not throw
    watcher.stop();
    assertEquals(watcher.isRunning(), false);
  });
});
