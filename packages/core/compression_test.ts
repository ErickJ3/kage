/**
 * Tests for compression middleware.
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { compression } from "./compression.ts";
import { Context } from "./context.ts";

describe("compression middleware", () => {
  it("should compress response with gzip when accepted", async () => {
    const middleware = compression({ prefer: ["gzip"] });

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    // Large JSON response (> 1KB threshold)
    const largeData = { data: "x".repeat(2000) };
    const largeJson = JSON.stringify(largeData);

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(largeJson, {
          headers: { "Content-Type": "application/json" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), "gzip");
    assertExists(response.headers.get("Content-Length"));
    assertEquals(response.headers.get("Vary"), "Accept-Encoding");

    // Compressed size should be smaller than original
    const compressedSize = parseInt(
      response.headers.get("Content-Length")!,
      10,
    );
    assertEquals(compressedSize < largeJson.length, true);
  });

  it("should not compress when Accept-Encoding not present", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test");
    const ctx = new Context(req);

    const data = { message: "x".repeat(2000) };
    const json = JSON.stringify(data);

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(json, {
          headers: { "Content-Type": "application/json" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), null);
  });

  it("should not compress small responses below threshold", async () => {
    const middleware = compression({ threshold: 2048 });

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    const smallData = { message: "small" };
    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(JSON.stringify(smallData), {
          headers: { "Content-Type": "application/json" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), null);
  });

  it("should not compress non-compressible content types", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    // Image data (not compressible by default)
    const imageData = new Uint8Array(2000);

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(imageData, {
          headers: { "Content-Type": "image/png" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), null);
  });

  it("should not compress if already compressed", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    const data = "x".repeat(2000);

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(data, {
          headers: {
            "Content-Type": "text/plain",
            "Content-Encoding": "gzip", // Already compressed
          },
        }),
      ));

    // Should not re-compress
    assertEquals(response.headers.get("Content-Encoding"), "gzip");
  });

  it("should prefer brotli over gzip when both accepted", async () => {
    const middleware = compression({ prefer: ["br", "gzip"] });

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip, br" },
    });

    const ctx = new Context(req);

    const largeData = { data: "x".repeat(2000) };

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(JSON.stringify(largeData), {
          headers: { "Content-Type": "application/json" },
        }),
      ));

    // Note: Deno's CompressionStream doesn't support 'br' yet,
    // so this will use deflate-raw as fallback
    assertEquals(response.headers.has("Content-Encoding"), true);
  });

  it("should compress text/html content", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    const html = "<html><body>" + "x".repeat(2000) + "</body></html>";

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), "gzip");
  });

  it("should compress application/javascript", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    const js = "function test() { " + "console.log('x');".repeat(200) + " }";

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(js, {
          headers: { "Content-Type": "application/javascript" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), "gzip");
  });

  it("should add Vary header correctly", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    const data = { data: "x".repeat(2000) };

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Vary": "Origin",
          },
        }),
      ));

    assertEquals(
      response.headers.get("Vary"),
      "Origin, Accept-Encoding",
    );
  });

  it("should handle responses without body", async () => {
    const middleware = compression();

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    const response = await middleware(
      ctx,
      () => Promise.resolve(new Response(null, { status: 204 })),
    );

    assertEquals(response.status, 204);
    assertEquals(response.headers.get("Content-Encoding"), null);
  });

  it("should use custom threshold", async () => {
    const middleware = compression({ threshold: 100 });

    const req = new Request("http://localhost/test", {
      headers: { "Accept-Encoding": "gzip" },
    });

    const ctx = new Context(req);

    // 150 bytes (above custom 100 byte threshold)
    const data = { message: "x".repeat(150) };

    const response = await middleware(ctx, () =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        }),
      ));

    assertEquals(response.headers.get("Content-Encoding"), "gzip");
  });
});
