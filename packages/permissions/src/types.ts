/**
 * Type definitions for Deno permission system.
 */

export type NetPermission = `net${string}`;
export type ReadPermission = `read${string}`;
export type WritePermission = `write${string}`;
export type EnvPermission = `env${string}`;
export type RunPermission = `run${string}`;
export type FfiPermission = `ffi${string}`;
export type SysPermission = "sys";
export type HrtimePermission = "hrtime";

export type Permission =
  | NetPermission
  | ReadPermission
  | WritePermission
  | EnvPermission
  | RunPermission
  | FfiPermission
  | SysPermission
  | HrtimePermission;

export interface ParsedPermission {
  type: string;
  specifier?: string;
}

export interface PermissionCheckResult {
  granted: boolean;
  message?: string;
  missing?: ParsedPermission[];
}

export interface RoutePermissions {
  required: Permission[];
  optional?: Permission[];
  strict?: boolean;
}
