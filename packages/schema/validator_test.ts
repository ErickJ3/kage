/**
 * Tests for schema validation utilities.
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { z } from "zod";
import {
  validate,
  validateOrThrow,
  validationErrorResponse,
} from "./validator.ts";

describe("validate", () => {
  it("should validate valid data", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = validate(schema, { name: "Alice", age: 30 });

    assertEquals(result.success, true);
    assertEquals(result.data, { name: "Alice", age: 30 });
    assertEquals(result.errors, undefined);
  });

  it("should reject invalid data", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = validate(schema, { name: "Alice", age: "thirty" });

    assertEquals(result.success, false);
    assertEquals(result.data, undefined);
    assertExists(result.errors);
    assertEquals(result.errors!.length > 0, true);
  });

  it("should provide detailed error information", () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().positive(),
    });

    const result = validate(schema, { email: "invalid", age: -5 });

    assertEquals(result.success, false);
    assertExists(result.errors);
    assertEquals(result.errors!.length, 2);

    const emailError = result.errors!.find((e) => e.field === "email");
    assertExists(emailError);
    assertEquals(emailError!.message.length > 0, true);

    const ageError = result.errors!.find((e) => e.field === "age");
    assertExists(ageError);
    assertEquals(ageError!.message.length > 0, true);
  });

  it("should handle nested objects", () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    });

    const result = validate(schema, {
      user: { name: "Bob", email: "invalid-email" },
    });

    assertEquals(result.success, false);
    assertExists(result.errors);
    assertEquals(result.errors![0].field, "user.email");
  });

  it("should handle arrays", () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });

    const validResult = validate(schema, { tags: ["a", "b", "c"] });
    assertEquals(validResult.success, true);

    const invalidResult = validate(schema, { tags: ["a", 123, "c"] });
    assertEquals(invalidResult.success, false);
  });

  it("should handle optional fields", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });

    const result1 = validate(schema, { name: "Alice" });
    assertEquals(result1.success, true);

    const result2 = validate(schema, { name: "Alice", age: 30 });
    assertEquals(result2.success, true);
  });
});

describe("validateOrThrow", () => {
  it("should return data for valid input", () => {
    const schema = z.object({
      name: z.string(),
    });

    const data = validateOrThrow(schema, { name: "Alice" });
    assertEquals(data, { name: "Alice" });
  });

  it("should throw for invalid input", () => {
    const schema = z.object({
      name: z.string(),
    });

    let error: Error | null = null;
    try {
      validateOrThrow(schema, { name: 123 });
    } catch (e) {
      error = e as Error;
    }

    assertExists(error);
    assertEquals(error!.message.includes("Validation failed"), true);
  });
});

describe("validationErrorResponse", () => {
  it("should create 400 response with error details", async () => {
    const errors = [
      { field: "email", message: "Invalid email", code: "invalid_string" },
      { field: "age", message: "Must be positive", code: "too_small" },
    ];

    const response = validationErrorResponse(errors);

    assertEquals(response.status, 400);
    assertEquals(
      response.headers.get("Content-Type"),
      "application/json; charset=utf-8",
    );

    const body = await response.json();
    assertEquals(body.error, "Validation failed");
    assertEquals(body.details, errors);
  });
});
