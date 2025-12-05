/**
 * Permission system for Kage framework.
 *
 * @module
 */

export {
  normalizePermission,
  parsePermission,
  parsePermissions,
  permissionsConflict,
  validatePermissionFormat,
} from "~/parser.ts";

export {
  checkPermission,
  checkPermissions,
  requestPermission,
} from "~/checker.ts";

export type {
  EnvPermission,
  FfiPermission,
  HrtimePermission,
  NetPermission,
  ParsedPermission,
  Permission,
  PermissionCheckResult,
  ReadPermission,
  RoutePermissions,
  RunPermission,
  SysPermission,
  WritePermission,
} from "~/types.ts";
