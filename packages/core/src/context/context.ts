/**
 * Request context for Kage framework.
 *
 * Provides unified interface for request/response handling with helpers
 * for common operations like JSON parsing, header manipulation, etc.
 */

const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

const TEXT_HEADERS = Object.freeze({ "Content-Type": TEXT_CONTENT_TYPE });
const HTML_HEADERS = Object.freeze({ "Content-Type": HTML_CONTENT_TYPE });

const TEXT_INIT_200: ResponseInit = { headers: TEXT_HEADERS };
const HTML_INIT_200: ResponseInit = { headers: HTML_HEADERS };

/**
 * Request context passed to handlers and middleware.
 *
 * Encapsulates request data and provides helper methods for common operations.
 *
 * @example
 * ```typescript
 * app.get("/users/:id", (ctx) => {
 *   const id = ctx.params.id;
 *   const auth = ctx.request.headers.get("Authorization");
 *   return ctx.json({ userId: id });
 * });
 * ```
 */
export class Context {
  /**
   * Original HTTP request.
   */
  public request!: Request;

  /**
   * Route path parameters extracted from URL.
   *
   * @example
   * For route "/users/:id", accessing "/users/123" gives { id: "123" }
   */
  public params!: Record<string, string>;

  /**
   * Custom state for sharing data between middleware.
   *
   * @example
   * ```typescript
   * // In auth middleware
   * ctx.state.user = { id: 123, name: "Alice" };
   *
   * // In route handler
   * const user = ctx.state.user;
   * ```
   */
  private _state: Record<string, unknown> | null = null;

  get state(): Record<string, unknown> {
    if (!this._state) {
      this._state = Object.create(null);
    }
    return this._state!;
  }

  set state(value: Record<string, unknown>) {
    this._state = value;
  }

  private _url: URL | null = null;
  private _pathname!: string;

  constructor(
    request?: Request,
    params: Record<string, string> = {},
    url?: URL | null,
    pathname?: string,
  ) {
    if (request) {
      this.reset(request, params, url, pathname);
    }
  }

  reset(
    request: Request,
    params: Record<string, string> = {},
    url?: URL | null,
    pathname?: string,
  ): void {
    this.request = request;
    this._url = url ?? null;
    if (pathname) {
      this._pathname = pathname;
    } else if (url) {
      this._pathname = url.pathname;
    } else {
      const urlStr = request.url;
      const protocolEnd = urlStr.indexOf("://");
      if (protocolEnd !== -1) {
        const pathStart = urlStr.indexOf("/", protocolEnd + 3);
        if (pathStart !== -1) {
          const queryStart = urlStr.indexOf("?", pathStart);
          const hashStart = urlStr.indexOf("#", pathStart);
          let pathEnd = urlStr.length;
          if (
            queryStart !== -1 && (hashStart === -1 || queryStart < hashStart)
          ) {
            pathEnd = queryStart;
          } else if (hashStart !== -1) {
            pathEnd = hashStart;
          }
          this._pathname = urlStr.slice(pathStart, pathEnd);
        } else {
          this._pathname = "/";
        }
      } else {
        this._url = new URL(urlStr);
        this._pathname = this._url.pathname;
      }
    }
    this.params = params;
    this._state = null;
  }

  get url(): URL {
    if (!this._url) {
      this._url = new URL(this.request.url);
    }
    return this._url;
  }

  get method(): string {
    return this.request.method;
  }

  get headers(): Headers {
    return this.request.headers;
  }

  /**
   * Get URL query parameters.
   *
   * @example
   * ```typescript
   * // For URL "/search?q=deno&limit=10"
   * const query = ctx.query.get("q"); // "deno"
   * const limit = ctx.query.get("limit"); // "10"
   * ```
   */
  get query(): URLSearchParams {
    return this.url.searchParams;
  }

  /**
   * Get request pathname.
   *
   * @example
   * For URL "http://localhost:8000/users/123?foo=bar"
   * returns "/users/123"
   */
  get path(): string {
    return this._pathname;
  }

  /**
   * Parse request body as JSON.
   *
   * @returns Parsed JSON object
   * @throws {Error} If body is not valid JSON
   */
  async bodyJson<T = unknown>(): Promise<T> {
    return await this.request.json();
  }

  /**
   * Parse request body as text.
   */
  async bodyText(): Promise<string> {
    return await this.request.text();
  }

  /**
   * Parse request body as FormData.
   */
  async bodyFormData(): Promise<FormData> {
    return await this.request.formData();
  }

  /**
   * Get request body as ArrayBuffer.
   */
  async bodyArrayBuffer(): Promise<ArrayBuffer> {
    return await this.request.arrayBuffer();
  }

  /**
   * Get request body as Blob.
   */
  async bodyBlob(): Promise<Blob> {
    return await this.request.blob();
  }

  /**
   * Create a Response object (helper for middleware/handlers).
   *
   * @param body - Response body
   * @param init - Response initialization options
   */
  response(body?: BodyInit | null, init?: ResponseInit): Response {
    return new Response(body, init);
  }

  /**
   * Helper to create JSON response.
   *
   * @param data - Object to serialize as JSON
   * @param status - HTTP status code
   */
  json(data: unknown, status = 200): Response {
    if (status === 200) {
      return Response.json(data);
    }
    return Response.json(data, { status });
  }

  /**
   * Helper to create text response.
   *
   * @param text - Text content
   * @param status - HTTP status code
   */
  text(text: string, status = 200): Response {
    if (status === 200) {
      return new Response(text, TEXT_INIT_200);
    }
    return new Response(text, { status, headers: TEXT_HEADERS });
  }

  /**
   * Helper to create HTML response.
   *
   * @param html - HTML content
   * @param status - HTTP status code
   */
  html(html: string, status = 200): Response {
    if (status === 200) {
      return new Response(html, HTML_INIT_200);
    }
    return new Response(html, { status, headers: HTML_HEADERS });
  }

  /**
   * Helper to create redirect response.
   *
   * @param url - URL to redirect to
   * @param status - HTTP status code (301 or 302)
   */
  redirect(url: string, status = 302): Response {
    return new Response(null, {
      status,
      headers: {
        Location: url,
      },
    });
  }

  /**
   * Helper to create no content response (204).
   */
  noContent(): Response {
    return new Response(null, { status: 204 });
  }

  /**
   * Helper to create not found response (404).
   */
  notFound(message = "Not Found"): Response {
    return this.json({ error: message }, 404);
  }

  /**
   * Helper to create bad request response (400).
   */
  badRequest(message = "Bad Request"): Response {
    return this.json({ error: message }, 400);
  }

  /**
   * Helper to create unauthorized response (401).
   */
  unauthorized(message = "Unauthorized"): Response {
    return this.json({ error: message }, 401);
  }

  /**
   * Helper to create forbidden response (403).
   */
  forbidden(message = "Forbidden"): Response {
    return this.json({ error: message }, 403);
  }

  /**
   * Helper to create internal server error response (500).
   */
  internalError(message = "Internal Server Error"): Response {
    return this.json({ error: message }, 500);
  }

  /**
   * Helper to create binary response (zero-copy).
   *
   * @param data - Binary data (Uint8Array or ArrayBuffer)
   * @param contentType - Content-Type header (default: application/octet-stream)
   * @param status - HTTP status code
   */
  binary(
    data: Uint8Array | ArrayBuffer,
    contentType = "application/octet-stream",
    status = 200,
  ): Response {
    return new Response(data as BodyInit, {
      status,
      headers: { "Content-Type": contentType },
    });
  }

  /**
   * Helper to create streaming response (zero-copy).
   *
   * @param stream - ReadableStream for streaming data
   * @param contentType - Content-Type header (default: application/octet-stream)
   * @param status - HTTP status code
   */
  stream(
    stream: ReadableStream,
    contentType = "application/octet-stream",
    status = 200,
  ): Response {
    return new Response(stream, {
      status,
      headers: { "Content-Type": contentType },
    });
  }
}
