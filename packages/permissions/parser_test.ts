/**
 * Tests for permission parser and validator.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  normalizePermission,
  parsePermission,
  parsePermissions,
  permissionsConflict,
  validatePermissionFormat,
} from "./parser.ts";

describe("parsePermission", () => {
  it("should parse simple permission without specifier", () => {
    const result = parsePermission("sys");
    assertEquals(result, { type: "sys" });
  });

  it("should parse permission with specifier", () => {
    const result = parsePermission("net:api.example.com");
    assertEquals(result, {
      type: "net",
      specifier: "api.example.com",
    });
  });

  it("should parse network permission with port", () => {
    const result = parsePermission("net:api.example.com:443");
    assertEquals(result, {
      type: "net",
      specifier: "api.example.com:443",
    });
  });

  it("should parse read permission with path", () => {
    const result = parsePermission("read:/tmp");
    assertEquals(result, {
      type: "read",
      specifier: "/tmp",
    });
  });

  it("should parse write permission with relative path", () => {
    const result = parsePermission("write:./data");
    assertEquals(result, {
      type: "write",
      specifier: "./data",
    });
  });

  it("should parse env permission with variable name", () => {
    const result = parsePermission("env:API_KEY");
    assertEquals(result, {
      type: "env",
      specifier: "API_KEY",
    });
  });

  it("should parse run permission with command", () => {
    const result = parsePermission("run:deno");
    assertEquals(result, {
      type: "run",
      specifier: "deno",
    });
  });

  it("should parse ffi permission with library path", () => {
    const result = parsePermission("ffi:/usr/lib/libfoo.so");
    assertEquals(result, {
      type: "ffi",
      specifier: "/usr/lib/libfoo.so",
    });
  });

  it("should throw on invalid permission type", () => {
    assertThrows(
      () => parsePermission("invalid" as any),
      Error,
      "Invalid permission type",
    );
  });

  it("should throw on empty specifier", () => {
    assertThrows(
      () => parsePermission("net:" as any),
      Error,
      "Empty specifier",
    );
  });

  it("should handle hrtime permission", () => {
    const result = parsePermission("hrtime");
    assertEquals(result, { type: "hrtime" });
  });
});

describe("parsePermissions", () => {
  it("should parse multiple permissions", () => {
    const result = parsePermissions([
      "net:api.example.com",
      "read:/tmp",
      "env:API_KEY",
    ]);

    assertEquals(result, [
      { type: "net", specifier: "api.example.com" },
      { type: "read", specifier: "/tmp" },
      { type: "env", specifier: "API_KEY" },
    ]);
  });

  it("should handle empty array", () => {
    const result = parsePermissions([]);
    assertEquals(result, []);
  });

  it("should parse mixed permissions with and without specifiers", () => {
    const result = parsePermissions(["sys", "net:example.com", "hrtime"]);

    assertEquals(result, [
      { type: "sys" },
      { type: "net", specifier: "example.com" },
      { type: "hrtime" },
    ]);
  });
});

describe("validatePermissionFormat", () => {
  it("should validate correct network permission", () => {
    const result = validatePermissionFormat({
      type: "net",
      specifier: "api.example.com",
    });
    assertEquals(result, { valid: true });
  });

  it("should validate network permission with port", () => {
    const result = validatePermissionFormat({
      type: "net",
      specifier: "api.example.com:443",
    });
    assertEquals(result, { valid: true });
  });

  it("should reject network permission with path", () => {
    const result = validatePermissionFormat({
      type: "net",
      specifier: "example.com/path",
    });
    assertEquals(result.valid, false);
    assertEquals(
      result.error?.includes("Invalid network specifier"),
      true,
    );
  });

  it("should reject network permission with spaces", () => {
    const result = validatePermissionFormat({
      type: "net",
      specifier: "example.com port",
    });
    assertEquals(result.valid, false);
  });

  it("should validate read permission with path", () => {
    const result = validatePermissionFormat({
      type: "read",
      specifier: "/tmp/data",
    });
    assertEquals(result, { valid: true });
  });

  it("should reject path with null byte", () => {
    const result = validatePermissionFormat({
      type: "read",
      specifier: "/tmp/\0data",
    });
    assertEquals(result.valid, false);
    assertEquals(result.error?.includes("null byte"), true);
  });

  it("should validate environment variable name", () => {
    const result = validatePermissionFormat({
      type: "env",
      specifier: "API_KEY",
    });
    assertEquals(result, { valid: true });
  });

  it("should validate env var with lowercase", () => {
    const result = validatePermissionFormat({
      type: "env",
      specifier: "api_key",
    });
    assertEquals(result, { valid: true });
  });

  it("should reject invalid env var name", () => {
    const result = validatePermissionFormat({
      type: "env",
      specifier: "API-KEY",
    });
    assertEquals(result.valid, false);
  });

  it("should reject env var starting with number", () => {
    const result = validatePermissionFormat({
      type: "env",
      specifier: "1API_KEY",
    });
    assertEquals(result.valid, false);
  });

  it("should validate run permission", () => {
    const result = validatePermissionFormat({
      type: "run",
      specifier: "deno",
    });
    assertEquals(result, { valid: true });
  });

  it("should reject sys permission with specifier", () => {
    const result = validatePermissionFormat({
      type: "sys",
      specifier: "something",
    });
    assertEquals(result.valid, false);
    assertEquals(result.error?.includes("does not support specifiers"), true);
  });

  it("should reject hrtime permission with specifier", () => {
    const result = validatePermissionFormat({
      type: "hrtime",
      specifier: "something",
    });
    assertEquals(result.valid, false);
  });

  it("should validate permissions without specifiers", () => {
    assertEquals(validatePermissionFormat({ type: "sys" }), { valid: true });
    assertEquals(validatePermissionFormat({ type: "hrtime" }), {
      valid: true,
    });
    assertEquals(validatePermissionFormat({ type: "net" }), { valid: true });
  });
});

describe("permissionsConflict", () => {
  it("should not conflict if types differ", () => {
    const result = permissionsConflict(
      { type: "net", specifier: "example.com" },
      { type: "read", specifier: "/tmp" },
    );
    assertEquals(result, false);
  });

  it("should not conflict if specifiers are identical", () => {
    const result = permissionsConflict(
      { type: "net", specifier: "example.com" },
      { type: "net", specifier: "example.com" },
    );
    assertEquals(result, false);
  });

  it("should conflict if one has no specifier", () => {
    const result = permissionsConflict(
      { type: "net" },
      { type: "net", specifier: "example.com" },
    );
    assertEquals(result, true);
  });

  it("should conflict for overlapping file paths", () => {
    const result = permissionsConflict(
      { type: "read", specifier: "/tmp" },
      { type: "read", specifier: "/tmp/data" },
    );
    assertEquals(result, true);
  });

  it("should not conflict for non-overlapping paths", () => {
    const result = permissionsConflict(
      { type: "read", specifier: "/tmp" },
      { type: "read", specifier: "/var" },
    );
    assertEquals(result, false);
  });

  it("should conflict for same hostname different ports", () => {
    const result = permissionsConflict(
      { type: "net", specifier: "example.com:443" },
      { type: "net", specifier: "example.com:80" },
    );
    assertEquals(result, true);
  });

  it("should not conflict for different hostnames", () => {
    const result = permissionsConflict(
      { type: "net", specifier: "example.com" },
      { type: "net", specifier: "other.com" },
    );
    assertEquals(result, false);
  });

  it("should not conflict for different env vars", () => {
    const result = permissionsConflict(
      { type: "env", specifier: "API_KEY" },
      { type: "env", specifier: "SECRET" },
    );
    assertEquals(result, false);
  });
});

describe("normalizePermission", () => {
  it("should normalize permission without specifier", () => {
    const result = normalizePermission("sys");
    assertEquals(result, "sys");
  });

  it("should normalize permission with specifier", () => {
    const result = normalizePermission("net:api.example.com");
    assertEquals(result, "net:api.example.com");
  });

  it("should handle various permission types", () => {
    assertEquals(normalizePermission("read:/tmp"), "read:/tmp");
    assertEquals(normalizePermission("write:./data"), "write:./data");
    assertEquals(normalizePermission("env:API_KEY"), "env:API_KEY");
    assertEquals(normalizePermission("hrtime"), "hrtime");
  });
});
