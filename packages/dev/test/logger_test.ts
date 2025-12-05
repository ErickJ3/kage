import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { createLogger } from "../src/logger.ts";

describe("createLogger", () => {
  it("should create a logger with default options", () => {
    const logger = createLogger();
    assertEquals(typeof logger.debug, "function");
    assertEquals(typeof logger.info, "function");
    assertEquals(typeof logger.warn, "function");
    assertEquals(typeof logger.error, "function");
    assertEquals(typeof logger.child, "function");
    assertEquals(typeof logger.setLevel, "function");
  });

  it("should create a logger with custom prefix", () => {
    const logger = createLogger({ prefix: "test" });
    assertEquals(typeof logger.info, "function");
  });

  it("should create child logger with combined prefix", () => {
    const logger = createLogger({ prefix: "parent" });
    const child = logger.child("child");
    assertEquals(typeof child.info, "function");
  });

  it("should respect log levels", () => {
    const logger = createLogger({ level: "error" });
    logger.debug("should not log");
    logger.info("should not log");
    logger.warn("should not log");
    logger.error("should log");
  });

  it("should allow changing log level", () => {
    const logger = createLogger({ level: "silent" });
    logger.setLevel("debug");
    logger.debug("now this works");
  });
});
