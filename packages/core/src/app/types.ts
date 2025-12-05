/**
 * Core application type definitions.
 */

/**
 * Configuration options for Kage application.
 */
export interface KageConfig {
  /**
   * Enable development mode with additional logging and hot reload.
   * @default false
   */
  development?: boolean;

  /**
   * Base path for all routes.
   * @default "/"
   */
  basePath?: string;
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
