/**
 * Tests for the structured error handling system.
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  BadRequestError,
  ConflictError,
  defaultErrorTransformer,
  errorToResponse,
  ForbiddenError,
  InternalError,
  isKageError,
  isOperationalError,
  KageError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "./errors.ts";

describe("KageError", () => {
  it("should create error with default values", () => {
    const error = new KageError("Test error");
    assertEquals(error.message, "Test error");
    assertEquals(error.status, 500);
    assertEquals(error.code, "INTERNAL_ERROR");
    assertEquals(error.isOperational, true);
  });

  it("should create error with custom values", () => {
    const error = new KageError("Custom error", 400, "CUSTOM_CODE", { foo: "bar" }, false);
    assertEquals(error.message, "Custom error");
    assertEquals(error.status, 400);
    assertEquals(error.code, "CUSTOM_CODE");
    assertEquals(error.details, { foo: "bar" });
    assertEquals(error.isOperational, false);
  });

  it("should convert to JSON in production mode", () => {
    const error = new KageError("Test error", 400, "TEST_CODE");
    const json = error.toJSON(false);
    assertEquals(json.error.message, "Test error");
    assertEquals(json.error.code, "TEST_CODE");
    assertEquals(json.error.status, 400);
    assertEquals(json.error.details, undefined);
    assertEquals(json.error.stack, undefined);
  });

  it("should convert to JSON in development mode", () => {
    const error = new KageError("Test error", 400, "TEST_CODE", { field: "email" });
    const json = error.toJSON(true);
    assertEquals(json.error.message, "Test error");
    assertEquals(json.error.code, "TEST_CODE");
    assertEquals(json.error.status, 400);
    assertEquals(json.error.details, { field: "email" });
    assertEquals(typeof json.error.stack, "object");
  });

  it("should create Response object", async () => {
    const error = new KageError("Test error", 400, "TEST_CODE");
    const response = error.toResponse(false);
    assertEquals(response.status, 400);
    assertEquals(response.headers.get("Content-Type"), "application/json");
    const body = await response.json();
    assertEquals(body.error.message, "Test error");
  });
});

describe("HTTP Error Classes", () => {
  it("should create BadRequestError with status 400", () => {
    const error = new BadRequestError("Invalid input");
    assertEquals(error.status, 400);
    assertEquals(error.code, "BAD_REQUEST");
    assertEquals(error.name, "BadRequestError");
  });

  it("should create UnauthorizedError with status 401", () => {
    const error = new UnauthorizedError("Invalid token");
    assertEquals(error.status, 401);
    assertEquals(error.code, "UNAUTHORIZED");
    assertEquals(error.name, "UnauthorizedError");
  });

  it("should create ForbiddenError with status 403", () => {
    const error = new ForbiddenError("Access denied");
    assertEquals(error.status, 403);
    assertEquals(error.code, "FORBIDDEN");
    assertEquals(error.name, "ForbiddenError");
  });

  it("should create NotFoundError with status 404", () => {
    const error = new NotFoundError("Resource not found");
    assertEquals(error.status, 404);
    assertEquals(error.code, "NOT_FOUND");
    assertEquals(error.name, "NotFoundError");
  });

  it("should create ConflictError with status 409", () => {
    const error = new ConflictError("Already exists");
    assertEquals(error.status, 409);
    assertEquals(error.code, "CONFLICT");
    assertEquals(error.name, "ConflictError");
  });

  it("should create InternalError with status 500", () => {
    const error = new InternalError("Server error");
    assertEquals(error.status, 500);
    assertEquals(error.code, "INTERNAL_ERROR");
    assertEquals(error.name, "InternalError");
    assertEquals(error.isOperational, false);
  });
});

describe("ValidationError", () => {
  it("should create ValidationError with errors array", () => {
    const error = new ValidationError("Validation failed", [
      { field: "email", message: "Invalid email", code: "invalid_format" },
      { field: "name", message: "Required" },
    ]);
    assertEquals(error.status, 422);
    assertEquals(error.code, "VALIDATION_ERROR");
    assertEquals(error.errors.length, 2);
    assertEquals(error.errors[0].field, "email");
    assertEquals(error.errors[1].field, "name");
  });
});

describe("RateLimitError", () => {
  it("should create RateLimitError with status 429", () => {
    const error = new RateLimitError("Too many requests");
    assertEquals(error.status, 429);
    assertEquals(error.code, "RATE_LIMIT_EXCEEDED");
  });

  it("should include Retry-After header", async () => {
    const error = new RateLimitError("Too many requests", 60);
    const response = error.toResponse();
    assertEquals(response.status, 429);
    assertEquals(response.headers.get("Retry-After"), "60");
    const body = await response.json();
    assertEquals(body.error.message, "Too many requests");
  });
});

describe("ServiceUnavailableError", () => {
  it("should create ServiceUnavailableError with status 503", () => {
    const error = new ServiceUnavailableError("Maintenance");
    assertEquals(error.status, 503);
    assertEquals(error.code, "SERVICE_UNAVAILABLE");
  });

  it("should include Retry-After header", async () => {
    const error = new ServiceUnavailableError("Maintenance", 300);
    const response = error.toResponse();
    assertEquals(response.status, 503);
    assertEquals(response.headers.get("Retry-After"), "300");
  });
});

describe("defaultErrorTransformer", () => {
  it("should pass through KageError unchanged", () => {
    const original = new BadRequestError("Test");
    const transformed = defaultErrorTransformer(original);
    assertEquals(transformed, original);
  });

  it("should transform JSON SyntaxError to BadRequestError", () => {
    const original = new SyntaxError("Unexpected token in JSON");
    const transformed = defaultErrorTransformer(original);
    assertInstanceOf(transformed, BadRequestError);
    assertEquals(transformed.status, 400);
  });

  it("should transform generic Error to InternalError", () => {
    const original = new Error("Something went wrong");
    const transformed = defaultErrorTransformer(original);
    assertInstanceOf(transformed, InternalError);
    assertEquals(transformed.status, 500);
    assertEquals(transformed.message, "Something went wrong");
  });

  it("should transform non-Error to InternalError", () => {
    const transformed = defaultErrorTransformer("string error");
    assertInstanceOf(transformed, InternalError);
    assertEquals(transformed.status, 500);
  });
});

describe("errorToResponse", () => {
  it("should create response from KageError", async () => {
    const error = new NotFoundError("Not found");
    const response = errorToResponse(error);
    assertEquals(response.status, 404);
    const body = await response.json();
    assertEquals(body.error.code, "NOT_FOUND");
  });

  it("should create response from generic Error", async () => {
    const error = new Error("Generic error");
    const response = errorToResponse(error);
    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body.error.code, "INTERNAL_ERROR");
  });

  it("should include details in development mode", async () => {
    const error = new BadRequestError("Invalid", { field: "email" });
    const response = errorToResponse(error, true);
    const body = await response.json();
    assertEquals(body.error.details, { field: "email" });
  });

  it("should use custom transformer", async () => {
    const customTransformer = (_error: unknown) => new BadRequestError("Custom");
    const response = errorToResponse(new Error("Any"), false, customTransformer);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error.message, "Custom");
  });
});

describe("isKageError", () => {
  it("should return true for KageError instances", () => {
    assertEquals(isKageError(new KageError("Test")), true);
    assertEquals(isKageError(new BadRequestError("Test")), true);
    assertEquals(isKageError(new InternalError("Test")), true);
  });

  it("should return false for non-KageError", () => {
    assertEquals(isKageError(new Error("Test")), false);
    assertEquals(isKageError("string"), false);
    assertEquals(isKageError(null), false);
  });
});

describe("isOperationalError", () => {
  it("should return true for operational errors", () => {
    assertEquals(isOperationalError(new BadRequestError("Test")), true);
    assertEquals(isOperationalError(new NotFoundError("Test")), true);
  });

  it("should return false for programming errors", () => {
    assertEquals(isOperationalError(new InternalError("Test")), false);
  });

  it("should return false for non-KageError", () => {
    assertEquals(isOperationalError(new Error("Test")), false);
  });
});
