import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { t } from "../src/mod.ts";
import {
  validate,
  validateOrThrow,
  validationErrorResponse,
} from "../src/validator.ts";

describe("validate", () => {
  it("should validate valid data", () => {
    const schema = t.Object({
      name: t.String(),
      age: t.Number(),
    });

    const result = validate(schema, { name: "Alice", age: 30 });

    assertEquals(result.success, true);
    assertEquals(result.data, { name: "Alice", age: 30 });
    assertEquals(result.errors, undefined);
  });

  it("should reject invalid data", () => {
    const schema = t.Object({
      name: t.String(),
      age: t.Number(),
    });

    const result = validate(schema, { name: "Alice", age: "thirty" });

    assertEquals(result.success, false);
    assertEquals(result.data, undefined);
    assertExists(result.errors);
    assertEquals(result.errors!.length > 0, true);
  });

  it("should provide detailed error information", () => {
    const schema = t.Object({
      email: t.String({ format: "email" }),
      age: t.Number({ minimum: 0 }),
    });

    const result = validate(schema, { email: "invalid", age: -5 });

    assertEquals(result.success, false);
    assertExists(result.errors);
    assertEquals(result.errors!.length >= 1, true);
  });

  it("should handle nested objects", () => {
    const schema = t.Object({
      user: t.Object({
        name: t.String(),
        email: t.String({ format: "email" }),
      }),
    });

    const result = validate(schema, {
      user: { name: "Bob", email: "invalid-email" },
    });

    assertEquals(result.success, false);
    assertExists(result.errors);
    assertEquals(result.errors![0].field.includes("user"), true);
  });

  it("should handle arrays", () => {
    const schema = t.Object({
      tags: t.Array(t.String()),
    });

    const validResult = validate(schema, { tags: ["a", "b", "c"] });
    assertEquals(validResult.success, true);

    const invalidResult = validate(schema, { tags: ["a", 123, "c"] });
    assertEquals(invalidResult.success, false);
  });

  it("should handle optional fields", () => {
    const schema = t.Object({
      name: t.String(),
      age: t.Optional(t.Number()),
    });

    const result1 = validate(schema, { name: "Alice" });
    assertEquals(result1.success, true);

    const result2 = validate(schema, { name: "Alice", age: 30 });
    assertEquals(result2.success, true);
  });
});

describe("validateOrThrow", () => {
  it("should return data for valid input", () => {
    const schema = t.Object({
      name: t.String(),
    });

    const data = validateOrThrow(schema, { name: "Alice" });
    assertEquals(data, { name: "Alice" });
  });

  it("should throw for invalid input", () => {
    const schema = t.Object({
      name: t.String(),
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
      { field: "email", message: "Invalid email", code: "format" },
      { field: "age", message: "Must be positive", code: "minimum" },
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
