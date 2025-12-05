/**
 * Tests for the dev server module.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { DevServer } from "./server.ts";

describe("DevServer", () => {
  it("should create a dev server with options", () => {
    const server = new DevServer({
      entry: "./src/main.ts",
      watch: ["./src"],
      logLevel: "silent",
    });

    assertEquals(server.getRestartCount(), 0);
  });

  it("should accept custom permissions", () => {
    const server = new DevServer({
      entry: "./src/main.ts",
      permissions: ["--allow-net", "--allow-read"],
      logLevel: "silent",
    });

    assertEquals(server.getRestartCount(), 0);
  });

  it("should accept environment variables", () => {
    const server = new DevServer({
      entry: "./src/main.ts",
      env: { PORT: "3000", NODE_ENV: "development" },
      logLevel: "silent",
    });

    assertEquals(server.getRestartCount(), 0);
  });

  it("should accept callbacks", () => {
    let restartCalled = false;
    let errorCalled = false;

    const server = new DevServer({
      entry: "./src/main.ts",
      logLevel: "silent",
      onRestart: () => {
        restartCalled = true;
      },
      onError: () => {
        errorCalled = true;
      },
    });

    assertEquals(server.getRestartCount(), 0);
    // Callbacks are set but not called until events happen
    assertEquals(restartCalled, false);
    assertEquals(errorCalled, false);
  });
});
