/**
 * Tests for error classes and utilities.
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
  KageError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../src/errors/mod.ts";

describe("KageError", () => {
  it("should create error with defaults", () => {
    const error = new KageError("Something went wrong");

    assertEquals(error.message, "Something went wrong");
    assertEquals(error.status, 500);
    assertEquals(error.code, "INTERNAL_ERROR");
    assertEquals(error.isOperational, true);
    assertEquals(error.details, undefined);
  });

  it("should create error with custom values", () => {
    const error = new KageError(
      "Not found",
      404,
      "NOT_FOUND",
      { id: 123 },
      false,
    );

    assertEquals(error.message, "Not found");
    assertEquals(error.status, 404);
    assertEquals(error.code, "NOT_FOUND");
    assertEquals(error.details, { id: 123 });
    assertEquals(error.isOperational, false);
  });

  it("should extend Error", () => {
    const error = new KageError("Test");

    assertInstanceOf(error, Error);
    assertInstanceOf(error, KageError);
  });

  describe("toJSON", () => {
    it("should serialize to JSON without details in production", () => {
      const error = new KageError("Error", 400, "BAD_REQUEST", {
        field: "email",
      });
      const json = error.toJSON(false);

      assertEquals(json.error.message, "Error");
      assertEquals(json.error.status, 400);
      assertEquals(json.error.code, "BAD_REQUEST");
      assertEquals(json.error.details, undefined);
      assertEquals(json.error.stack, undefined);
    });

    it("should include details in development mode", () => {
      const error = new KageError("Error", 400, "BAD_REQUEST", {
        field: "email",
      });
      const json = error.toJSON(true);

      assertEquals(json.error.details, { field: "email" });
      assertEquals(Array.isArray(json.error.stack), true);
    });
  });

  describe("toResponse", () => {
    it("should create Response with correct status", async () => {
      const error = new KageError("Not found", 404, "NOT_FOUND");
      const response = error.toResponse();

      assertEquals(response.status, 404);
      assertEquals(response.headers.get("Content-Type"), "application/json");

      const body = await response.json();
      assertEquals(body.error.message, "Not found");
      assertEquals(body.error.code, "NOT_FOUND");
    });
  });
});

describe("HTTP Errors", () => {
  describe("BadRequestError", () => {
    it("should have correct defaults", () => {
      const error = new BadRequestError();

      assertEquals(error.message, "Bad Request");
      assertEquals(error.status, 400);
      assertEquals(error.code, "BAD_REQUEST");
    });

    it("should accept custom message and details", () => {
      const error = new BadRequestError("Invalid input", { field: "email" });

      assertEquals(error.message, "Invalid input");
      assertEquals(error.details, { field: "email" });
    });
  });

  describe("UnauthorizedError", () => {
    it("should have correct defaults", () => {
      const error = new UnauthorizedError();

      assertEquals(error.message, "Unauthorized");
      assertEquals(error.status, 401);
      assertEquals(error.code, "UNAUTHORIZED");
    });
  });

  describe("ForbiddenError", () => {
    it("should have correct defaults", () => {
      const error = new ForbiddenError();

      assertEquals(error.message, "Forbidden");
      assertEquals(error.status, 403);
      assertEquals(error.code, "FORBIDDEN");
    });
  });

  describe("NotFoundError", () => {
    it("should have correct defaults", () => {
      const error = new NotFoundError();

      assertEquals(error.message, "Not Found");
      assertEquals(error.status, 404);
      assertEquals(error.code, "NOT_FOUND");
    });
  });

  describe("ConflictError", () => {
    it("should have correct defaults", () => {
      const error = new ConflictError();

      assertEquals(error.message, "Conflict");
      assertEquals(error.status, 409);
      assertEquals(error.code, "CONFLICT");
    });
  });

  describe("ValidationError", () => {
    it("should have correct defaults", () => {
      const error = new ValidationError();

      assertEquals(error.message, "Validation Error");
      assertEquals(error.status, 422);
      assertEquals(error.code, "VALIDATION_ERROR");
      assertEquals(error.errors, []);
    });

    it("should accept validation issues", () => {
      const issues = [
        { field: "email", message: "Invalid email", code: "invalid_string" },
        { field: "age", message: "Must be positive", code: "too_small" },
      ];
      const error = new ValidationError("Validation failed", issues);

      assertEquals(error.errors, issues);
      assertEquals(error.details, issues);
    });
  });

  describe("RateLimitError", () => {
    it("should have correct defaults", () => {
      const error = new RateLimitError();

      assertEquals(error.message, "Too Many Requests");
      assertEquals(error.status, 429);
      assertEquals(error.code, "RATE_LIMIT_EXCEEDED");
      assertEquals(error.retryAfter, undefined);
    });

    it("should include retryAfter", () => {
      const error = new RateLimitError("Slow down", 60);

      assertEquals(error.retryAfter, 60);
      assertEquals(error.details, { retryAfter: 60 });
    });

    it("should add Retry-After header to response", () => {
      const error = new RateLimitError("Slow down", 120);
      const response = error.toResponse();

      assertEquals(response.headers.get("Retry-After"), "120");
    });

    it("should not add Retry-After header when not set", () => {
      const error = new RateLimitError();
      const response = error.toResponse();

      assertEquals(response.headers.get("Retry-After"), null);
    });
  });

  describe("InternalError", () => {
    it("should have correct defaults", () => {
      const error = new InternalError();

      assertEquals(error.message, "Internal Server Error");
      assertEquals(error.status, 500);
      assertEquals(error.code, "INTERNAL_ERROR");
      assertEquals(error.isOperational, false);
    });
  });

  describe("ServiceUnavailableError", () => {
    it("should have correct defaults", () => {
      const error = new ServiceUnavailableError();

      assertEquals(error.message, "Service Unavailable");
      assertEquals(error.status, 503);
      assertEquals(error.code, "SERVICE_UNAVAILABLE");
    });

    it("should include retryAfter", () => {
      const error = new ServiceUnavailableError("Maintenance", 300);

      assertEquals(error.retryAfter, 300);
    });

    it("should add Retry-After header to response", () => {
      const error = new ServiceUnavailableError("Down", 600);
      const response = error.toResponse();

      assertEquals(response.headers.get("Retry-After"), "600");
    });
  });
});

describe("Error utilities", () => {
  describe("isKageError", () => {
    it("should return true for KageError instances", () => {
      assertEquals(isKageError(new KageError("Test")), true);
      assertEquals(isKageError(new BadRequestError()), true);
      assertEquals(isKageError(new NotFoundError()), true);
    });

    it("should return false for other errors", () => {
      assertEquals(isKageError(new Error("Test")), false);
      assertEquals(isKageError(new TypeError("Test")), false);
      assertEquals(isKageError("string error"), false);
      assertEquals(isKageError(null), false);
      assertEquals(isKageError(undefined), false);
    });
  });

  describe("defaultErrorTransformer", () => {
    it("should return KageError unchanged", () => {
      const error = new NotFoundError("Custom message");
      const result = defaultErrorTransformer(error);

      assertEquals(result, error);
    });

    it("should transform SyntaxError for JSON to BadRequestError", () => {
      const error = new SyntaxError("Unexpected token in JSON");
      const result = defaultErrorTransformer(error);

      assertInstanceOf(result, BadRequestError);
      assertEquals(result.message, "Invalid JSON in request body");
    });

    it("should transform generic Error to InternalError", () => {
      const error = new Error("Something broke");
      const result = defaultErrorTransformer(error);

      assertInstanceOf(result, InternalError);
      assertEquals(result.message, "Something broke");
    });

    it("should transform non-Error to InternalError", () => {
      const result = defaultErrorTransformer("string error");

      assertInstanceOf(result, InternalError);
      assertEquals(result.message, "An unexpected error occurred");
    });
  });

  describe("errorToResponse", () => {
    it("should convert KageError to Response", async () => {
      const error = new BadRequestError("Invalid");
      const response = errorToResponse(error);

      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error.message, "Invalid");
    });

    it("should convert generic Error to Response", async () => {
      const error = new Error("Oops");
      const response = errorToResponse(error);

      assertEquals(response.status, 500);
      const body = await response.json();
      assertEquals(body.error.message, "Oops");
    });

    it("should use custom transformer", async () => {
      const customTransformer = () => new NotFoundError("Custom not found");
      const response = errorToResponse(
        new Error("Any"),
        false,
        customTransformer,
      );

      assertEquals(response.status, 404);
      const body = await response.json();
      assertEquals(body.error.message, "Custom not found");
    });

    it("should include details in development mode", async () => {
      const error = new BadRequestError("Invalid", { field: "email" });
      const response = errorToResponse(error, true);

      const body = await response.json();
      assertEquals(body.error.details, { field: "email" });
    });
  });
});
