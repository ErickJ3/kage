/**
 * CORS middleware.
 */

import type { Middleware } from "~/middleware/types.ts";

/**
 * CORS configuration options.
 */
export interface CorsOptions {
  origin?: string;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * Create CORS middleware.
 *
 * Adds CORS headers to responses.
 *
 * @param options - CORS configuration options
 *
 * @example
 * ```typescript
 * app.use(cors({
 *   origin: "*",
 *   methods: ["GET", "POST", "PUT", "DELETE"],
 *   headers: ["Content-Type", "Authorization"]
 * }));
 * ```
 */
export function cors(options: CorsOptions = {}): Middleware {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    headers = ["Content-Type", "Authorization"],
    credentials = false,
    maxAge = 86400,
  } = options;

  return async (ctx, next) => {
    if (ctx.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": methods.join(", "),
          "Access-Control-Allow-Headers": headers.join(", "),
          "Access-Control-Max-Age": maxAge.toString(),
          ...(credentials && { "Access-Control-Allow-Credentials": "true" }),
        },
      });
    }

    const response = await next();

    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", origin);

    if (credentials) {
      newHeaders.set("Access-Control-Allow-Credentials", "true");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
