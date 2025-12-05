/**
 * Compression middleware for Kage.
 *
 * Provides automatic gzip and brotli compression for responses.
 */

import type { Middleware } from "~/middleware/types.ts";
import type { Context } from "~/context/mod.ts";

/**
 * Compression options.
 */
export interface CompressionOptions {
  /**
   * Compression encoding preference order.
   * Default: ["br", "gzip"]
   */
  prefer?: ("br" | "gzip")[];

  /**
   * Minimum response size in bytes to compress.
   * Responses smaller than this won't be compressed.
   * Default: 1024 (1KB)
   */
  threshold?: number;

  /**
   * Content types to compress.
   * If not specified, compresses text-based types.
   */
  contentTypes?: RegExp[];
}

const DEFAULT_COMPRESSIBLE = [
  /^text\//i,
  /^application\/json/i,
  /^application\/javascript/i,
  /^application\/xml/i,
  /\+json$/i,
  /\+xml$/i,
];

function isCompressible(
  contentType: string | null,
  patterns: RegExp[],
): boolean {
  if (!contentType) return false;

  const mediaType = contentType.split(";")[0].trim();

  return patterns.some((pattern) => pattern.test(mediaType));
}

function selectEncoding(
  acceptEncoding: string | null,
  prefer: ("br" | "gzip")[],
): "br" | "gzip" | null {
  if (!acceptEncoding) return null;

  const accepted = acceptEncoding.toLowerCase();

  for (const encoding of prefer) {
    if (accepted.includes(encoding)) {
      return encoding;
    }
  }

  return null;
}

async function compressData(
  data: Uint8Array,
  encoding: "br" | "gzip",
): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const compressionStream = encoding === "br"
    ? new CompressionStream("deflate-raw")
    : new CompressionStream("gzip");

  const compressed = stream.pipeThrough(compressionStream);
  const chunks: Uint8Array[] = [];

  for await (const chunk of compressed) {
    chunks.push(chunk);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Create compression middleware.
 *
 * Automatically compresses responses based on Accept-Encoding header.
 * Supports gzip and brotli compression.
 *
 * @param options - Compression options
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * import { compression } from "@kage/core";
 *
 * const app = new Kage();
 *
 * // Use default settings
 * app.use(compression());
 *
 * // Custom settings
 * app.use(compression({
 *   prefer: ["gzip", "br"],
 *   threshold: 2048, // Only compress responses > 2KB
 * }));
 * ```
 */
export function compression(options: CompressionOptions = {}): Middleware {
  const prefer = options.prefer ?? ["br", "gzip"];
  const threshold = options.threshold ?? 1024;
  const contentTypes = options.contentTypes ?? DEFAULT_COMPRESSIBLE;

  return async (ctx: Context, next) => {
    const response = await next();

    if (response.headers.get("Content-Encoding")) {
      return response;
    }

    if (!response.body) {
      return response;
    }

    const acceptEncoding = ctx.headers.get("Accept-Encoding");
    const encoding = selectEncoding(acceptEncoding, prefer);

    if (!encoding) {
      return response;
    }

    const contentType = response.headers.get("Content-Type");
    if (!isCompressible(contentType, contentTypes)) {
      return response;
    }

    const bodyBytes = new Uint8Array(await response.arrayBuffer());

    if (bodyBytes.length < threshold) {
      return new Response(bodyBytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const compressed = await compressData(bodyBytes, encoding);

    const headers = new Headers(response.headers);
    headers.set("Content-Encoding", encoding);
    headers.set("Content-Length", compressed.length.toString());
    headers.delete("Content-Range");

    const vary = headers.get("Vary");
    if (vary) {
      if (!vary.toLowerCase().includes("accept-encoding")) {
        headers.set("Vary", `${vary}, Accept-Encoding`);
      }
    } else {
      headers.set("Vary", "Accept-Encoding");
    }

    return new Response(compressed as BodyInit, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
