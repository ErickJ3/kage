/**
 * Type definitions for Deno permission system.
 *
 * Based on Deno's security model documented at:
 * https://docs.deno.com/runtime/fundamentals/security/
 */

/**
 * Network permission specification.
 *
 * Controls access to network operations (fetch, WebSocket, etc.)
 *
 * @example
 * "net" - Allow all network access
 * "net:deno.land" - Allow only deno.land
 * "net:api.example.com:443" - Allow only api.example.com on port 443
 */
export type NetPermission = `net${string}`;

/**
 * Read permission specification.
 *
 * Controls filesystem read access.
 *
 * @example
 * "read" - Allow all reads
 * "read:/tmp" - Allow only /tmp directory
 * "read:./data" - Allow only ./data directory
 */
export type ReadPermission = `read${string}`;

/**
 * Write permission specification.
 *
 * Controls filesystem write access.
 *
 * @example
 * "write" - Allow all writes
 * "write:/tmp" - Allow only /tmp directory
 */
export type WritePermission = `write${string}`;

/**
 * Environment variable permission.
 *
 * Controls access to environment variables.
 *
 * @example
 * "env" - Allow all env vars
 * "env:API_KEY" - Allow only API_KEY
 */
export type EnvPermission = `env${string}`;

/**
 * Run permission specification.
 *
 * Controls subprocess execution.
 *
 * @example
 * "run" - Allow all subprocesses
 * "run:deno" - Allow only deno command
 */
export type RunPermission = `run${string}`;

/**
 * FFI (Foreign Function Interface) permission.
 *
 * Controls loading of dynamic libraries.
 *
 * @example
 * "ffi" - Allow all FFI
 * "ffi:/usr/lib/libfoo.so" - Allow specific library
 */
export type FfiPermission = `ffi${string}`;

/**
 * System information permission.
 *
 * Controls access to system information APIs.
 */
export type SysPermission = "sys";

/**
 * High resolution time permission.
 *
 * Controls access to high-resolution timing APIs.
 * Required to prevent timing attacks.
 */
export type HrtimePermission = "hrtime";

/**
 * All possible permission types.
 */
export type Permission =
  | NetPermission
  | ReadPermission
  | WritePermission
  | EnvPermission
  | RunPermission
  | FfiPermission
  | SysPermission
  | HrtimePermission;

/**
 * Parsed permission with type and optional specifier.
 *
 * @example
 * { type: "net", specifier: "api.example.com" }
 * { type: "read", specifier: "/tmp" }
 * { type: "env" } // No specifier means all access
 */
export interface ParsedPermission {
  /**
   * Permission type (net, read, write, etc.)
   */
  type: string;

  /**
   * Optional resource specifier.
   * If undefined, permission applies to all resources of that type.
   */
  specifier?: string;
}

/**
 * Permission validation result.
 */
export interface PermissionCheckResult {
  /**
   * Whether the permission check passed.
   */
  granted: boolean;

  /**
   * Human-readable message explaining the result.
   */
  message?: string;

  /**
   * Missing permissions if check failed.
   */
  missing?: ParsedPermission[];
}

/**
 * Route permission configuration.
 */
export interface RoutePermissions {
  /**
   * List of required permissions for this route.
   * Route handler will only execute if all permissions are granted.
   */
  required: Permission[];

  /**
   * Optional permissions that enhance functionality but aren't required.
   * Route will execute even if these are denied.
   */
  optional?: Permission[];

  /**
   * Whether to enforce strict permission checking.
   * If true, route will fail if any required permission is denied.
   * @default true
   */
  strict?: boolean;
}
