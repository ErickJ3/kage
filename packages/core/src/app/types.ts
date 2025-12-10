/**
 * Core application type definitions.
 */

/**
 * Configuration options for Kage application.
 */
export interface KageConfig {
  /**
   * Prefix for all routes in this app.
   * @default "/"
   *
   * @example
   * ```typescript
   * const authRoutes = new Kage({ prefix: "/auth" })
   *   .get("/login", handler)  // Accessible at /auth/login
   *   .post("/logout", handler); // Accessible at /auth/logout
   * ```
   */
  prefix?: string;
}

/**
 * HTTP server listen options.
 */
export interface ListenOptions {
  /**
   * Port to listen on.
   * @default 8000
   */
  port?: number;

  /**
   * Hostname to bind to.
   * @default "0.0.0.0"
   */
  hostname?: string;

  /**
   * Callback invoked when server starts listening.
   */
  onListen?: (params: { hostname: string; port: number }) => void;
}
