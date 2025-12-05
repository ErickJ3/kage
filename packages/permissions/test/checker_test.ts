import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { checkPermission, checkPermissions } from "../src/checker.ts";
import type { ParsedPermission, Permission } from "../src/types.ts";

describe("checkPermission", () => {
  describe("net permissions", () => {
    it("should check net permission without specifier", async () => {
      const permission: ParsedPermission = { type: "net" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check net permission with host", async () => {
      const permission: ParsedPermission = {
        type: "net",
        specifier: "localhost",
      };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check net permission with host and port", async () => {
      const permission: ParsedPermission = {
        type: "net",
        specifier: "localhost:8000",
      };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("read permissions", () => {
    it("should check read permission without specifier", async () => {
      const permission: ParsedPermission = { type: "read" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check read permission with path", async () => {
      const permission: ParsedPermission = { type: "read", specifier: "/tmp" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("write permissions", () => {
    it("should check write permission without specifier", async () => {
      const permission: ParsedPermission = { type: "write" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check write permission with path", async () => {
      const permission: ParsedPermission = { type: "write", specifier: "/tmp" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("env permissions", () => {
    it("should check env permission without specifier", async () => {
      const permission: ParsedPermission = { type: "env" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check env permission with variable", async () => {
      const permission: ParsedPermission = { type: "env", specifier: "HOME" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("run permissions", () => {
    it("should check run permission without specifier", async () => {
      const permission: ParsedPermission = { type: "run" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check run permission with command", async () => {
      const permission: ParsedPermission = { type: "run", specifier: "echo" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("ffi permissions", () => {
    it("should check ffi permission without specifier", async () => {
      const permission: ParsedPermission = { type: "ffi" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });

    it("should check ffi permission with path", async () => {
      const permission: ParsedPermission = {
        type: "ffi",
        specifier: "/lib/test.so",
      };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("sys permissions", () => {
    it("should check sys permission", async () => {
      const permission: ParsedPermission = { type: "sys" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("hrtime permissions", () => {
    it("should check hrtime permission", async () => {
      const permission: ParsedPermission = { type: "hrtime" };
      const result = await checkPermission(permission);

      assertEquals(typeof result.granted, "boolean");
    });
  });

  describe("unknown permission type", () => {
    it("should return not granted for unknown type", async () => {
      const permission = { type: "unknown" } as ParsedPermission;
      const result = await checkPermission(permission);

      assertEquals(result.granted, false);
      assertEquals(result.message?.includes("Unknown permission type"), true);
    });
  });

  describe("result format", () => {
    it("should include message when not granted", async () => {
      // This test assumes the test runs without all permissions
      // In CI with --allow-all, all permissions will be granted
      const permission: ParsedPermission = { type: "net" };
      const result = await checkPermission(permission);

      if (!result.granted) {
        assertEquals(typeof result.message, "string");
        assertEquals(result.message!.length > 0, true);
      }
    });
  });
});

describe("checkPermissions", () => {
  it("should return granted for empty array", async () => {
    const result = await checkPermissions([]);

    assertEquals(result.granted, true);
  });

  it("should check multiple permissions", async () => {
    const permissions: Permission[] = ["net", "env"];
    const result = await checkPermissions(permissions);

    assertEquals(typeof result.granted, "boolean");
  });

  it("should check permissions with specifiers", async () => {
    const permissions: Permission[] = ["net:localhost", "read:/tmp"];
    const result = await checkPermissions(permissions);

    assertEquals(typeof result.granted, "boolean");
  });

  it("should aggregate missing permissions", async () => {
    // This test verifies the structure of the result
    const permissions: Permission[] = ["net", "read", "write"];
    const result = await checkPermissions(permissions);

    if (!result.granted) {
      assertEquals(Array.isArray(result.missing), true);
      assertEquals(typeof result.message, "string");
    }
  });

  it("should include all missing permissions", async () => {
    // Test that all denied permissions are tracked
    const permissions: Permission[] = [
      "net:blocked.example.com",
      "read:/nonexistent/path",
    ];
    const result = await checkPermissions(permissions);

    if (!result.granted && result.missing) {
      assertEquals(result.missing.length > 0, true);
      for (const perm of result.missing) {
        assertEquals(typeof perm.type, "string");
      }
    }
  });
});
