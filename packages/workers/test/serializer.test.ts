import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  deserialize,
  extractTransferables,
  serialize,
} from "../src/serializer.ts";

describe("serializer", () => {
  describe("serialize/deserialize", () => {
    it("should handle primitive values", () => {
      assertEquals(deserialize(serialize(42)), 42);
      assertEquals(deserialize(serialize("hello")), "hello");
      assertEquals(deserialize(serialize(true)), true);
      assertEquals(deserialize(serialize(null)), null);
    });

    it("should handle arrays", () => {
      const arr = [1, 2, 3, "test", null];
      assertEquals(deserialize(serialize(arr)), arr);
    });

    it("should handle nested objects", () => {
      const obj = { a: 1, b: { c: 2, d: [3, 4] } };
      assertEquals(deserialize(serialize(obj)), obj);
    });

    it("should handle Date objects", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const result = deserialize(serialize(date));
      assertEquals(result instanceof Date, true);
      assertEquals((result as Date).toISOString(), date.toISOString());
    });

    it("should handle Map objects", () => {
      const map = new Map<string, unknown>([
        ["key1", "value1"],
        ["key2", 42],
      ]);
      const result = deserialize(serialize(map));
      assertEquals(result instanceof Map, true);
      assertEquals((result as Map<string, unknown>).get("key1"), "value1");
      assertEquals((result as Map<string, unknown>).get("key2"), 42);
    });

    it("should handle Set objects", () => {
      const set = new Set([1, 2, 3, "test"]);
      const result = deserialize(serialize(set));
      assertEquals(result instanceof Set, true);
      assertEquals((result as Set<unknown>).has(1), true);
      assertEquals((result as Set<unknown>).has("test"), true);
    });

    it("should handle RegExp objects", () => {
      const regex = /test\d+/gi;
      const result = deserialize(serialize(regex));
      assertEquals(result instanceof RegExp, true);
      assertEquals((result as RegExp).source, regex.source);
      assertEquals((result as RegExp).flags, regex.flags);
    });

    it("should handle Error objects", () => {
      const error = new Error("Test error");
      error.name = "CustomError";
      const result = deserialize(serialize(error));
      assertEquals(result instanceof Error, true);
      assertEquals((result as Error).message, "Test error");
      assertEquals((result as Error).name, "CustomError");
    });

    it("should handle Uint8Array", () => {
      const arr = new Uint8Array([1, 2, 3, 4, 5]);
      const result = deserialize(serialize(arr));
      assertEquals(result instanceof Uint8Array, true);
      assertEquals(Array.from(result as Uint8Array), [1, 2, 3, 4, 5]);
    });

    it("should handle Float64Array", () => {
      const arr = new Float64Array([1.5, 2.5, 3.5]);
      const result = deserialize(serialize(arr));
      assertEquals(result instanceof Float64Array, true);
      assertEquals(Array.from(result as Float64Array), [1.5, 2.5, 3.5]);
    });

    it("should handle BigInt64Array", () => {
      const arr = new BigInt64Array([1n, 2n, 3n]);
      const result = deserialize(serialize(arr));
      assertEquals(result instanceof BigInt64Array, true);
      assertEquals(
        Array.from(result as BigInt64Array),
        Array.from([1n, 2n, 3n]),
      );
    });

    it("should handle complex nested structures", () => {
      const complex = {
        date: new Date("2024-01-15"),
        map: new Map([["key", new Set([1, 2, 3])]]),
        regex: /pattern/i,
        data: new Uint8Array([10, 20, 30]),
      };
      const result = deserialize(serialize(complex)) as typeof complex;
      assertEquals(result.date instanceof Date, true);
      assertEquals(result.map instanceof Map, true);
      assertEquals(result.map.get("key") instanceof Set, true);
      assertEquals(result.regex instanceof RegExp, true);
      assertEquals(result.data instanceof Uint8Array, true);
    });
  });

  describe("extractTransferables", () => {
    it("should extract ArrayBuffer", () => {
      const buffer = new ArrayBuffer(8);
      const transferables = extractTransferables(buffer);
      assertEquals(transferables.length, 1);
      assertEquals(transferables[0], buffer);
    });

    it("should extract buffer from TypedArray", () => {
      const arr = new Uint8Array([1, 2, 3]);
      const transferables = extractTransferables(arr);
      assertEquals(transferables.length, 1);
      assertEquals(transferables[0], arr.buffer);
    });

    it("should extract from nested objects", () => {
      const buffer1 = new ArrayBuffer(8);
      const buffer2 = new ArrayBuffer(16);
      const obj = {
        a: { buffer: buffer1 },
        b: [buffer2],
      };
      const transferables = extractTransferables(obj);
      assertEquals(transferables.length, 2);
    });

    it("should handle circular references", () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      const transferables = extractTransferables(obj);
      assertEquals(transferables.length, 0);
    });

    it("should return empty array for primitives", () => {
      assertEquals(extractTransferables(42), []);
      assertEquals(extractTransferables("test"), []);
      assertEquals(extractTransferables(null), []);
    });
  });
});
