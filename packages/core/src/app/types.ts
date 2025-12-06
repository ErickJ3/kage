/**
 * Core application type definitions.
 */

export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

/**
 * Logger interface for Kage application.
 */
export interface Logger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  level?: LogLevel;
  name?: string;
  timestamp?: boolean;
  json?: boolean;
}

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

  /**
   * Enable built-in logger.
   * - `true`: enable with defaults
   * - `LoggerConfig`: enable with custom options
   * - `Logger`: use custom logger instance
   * @default undefined (disabled)
   */
  logger?: boolean | LoggerConfig | Logger;
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
