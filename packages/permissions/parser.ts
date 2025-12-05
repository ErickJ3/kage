/**
 * Permission string parser and validator.
 *
 * Parses Deno permission strings into structured format for validation.
 */

import type { ParsedPermission, Permission } from "./types.ts";

/**
 * Valid permission type names.
 */
const PERMISSION_TYPES = [
  "net",
  "read",
  "write",
  "env",
  "run",
  "ffi",
  "sys",
  "hrtime",
] as const;

/**
 * Parse a permission string into structured format.
 *
 * Format: "type" or "type:specifier"
 *
 * @param permission - Permission string to parse
 * @returns Parsed permission object
 * @throws {Error} If permission string is malformed
 *
 * @example
 * ```typescript
 * parsePermission("net:api.example.com")
 * // => { type: "net", specifier: "api.example.com" }
 *
 * parsePermission("read:/tmp")
 * // => { type: "read", specifier: "/tmp" }
 *
 * parsePermission("sys")
 * // => { type: "sys" }
 * ```
 */
export function parsePermission(permission: Permission): ParsedPermission {
  const colonIndex = permission.indexOf(":");

  // No specifier - simple permission like "sys" or "hrtime"
  if (colonIndex === -1) {
    const type = permission;

    if (!isValidPermissionType(type)) {
      throw new Error(`Invalid permission type: ${type}`);
    }

    return { type };
  }

  // Has specifier - format "type:specifier"
  const type = permission.substring(0, colonIndex);
  const specifier = permission.substring(colonIndex + 1);

  if (!isValidPermissionType(type)) {
    throw new Error(`Invalid permission type: ${type}`);
  }

  if (specifier.length === 0) {
    throw new Error(`Empty specifier for permission: ${permission}`);
  }

  return { type, specifier };
}

/**
 * Parse multiple permission strings.
 *
 * @param permissions - Array of permission strings
 * @returns Array of parsed permissions
 *
 * @example
 * ```typescript
 * parsePermissions(["net:api.example.com", "read:/tmp"])
 * // => [
 * //   { type: "net", specifier: "api.example.com" },
 * //   { type: "read", specifier: "/tmp" }
 * // ]
 * ```
 */
export function parsePermissions(
  permissions: Permission[],
): ParsedPermission[] {
  return permissions.map((p) => parsePermission(p));
}

/**
 * Check if a string is a valid permission type.
 */
function isValidPermissionType(type: string): boolean {
  return PERMISSION_TYPES.includes(type as typeof PERMISSION_TYPES[number]);
}

/**
 * Validate that a permission specifier is well-formed.
 *
 * Performs basic validation without runtime permission checking.
 *
 * @param permission - Parsed permission to validate
 * @returns Validation result with error message if invalid
 */
export function validatePermissionFormat(
  permission: ParsedPermission,
): { valid: boolean; error?: string } {
  const { type, specifier } = permission;

  // Validate based on permission type
  switch (type) {
    case "net": {
      if (specifier) {
        // Network specifier should be hostname or hostname:port
        // Basic validation: no spaces, no path separators
        if (
          specifier.includes(" ") ||
          specifier.includes("/") ||
          specifier.includes("\\")
        ) {
          return {
            valid: false,
            error: `Invalid network specifier: ${specifier}`,
          };
        }
      }
      break;
    }

    case "read":
    case "write": {
      if (specifier) {
        // File path should not contain null bytes (security)
        if (specifier.includes("\0")) {
          return {
            valid: false,
            error: `Invalid path specifier: contains null byte`,
          };
        }
      }
      break;
    }

    case "env": {
      if (specifier) {
        // Environment variable name should be alphanumeric + underscore
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(specifier)) {
          return {
            valid: false,
            error: `Invalid environment variable name: ${specifier}`,
          };
        }
      }
      break;
    }

    case "run": {
      if (specifier) {
        // Command should not contain null bytes
        if (specifier.includes("\0")) {
          return {
            valid: false,
            error: `Invalid command specifier: contains null byte`,
          };
        }
      }
      break;
    }

    case "ffi": {
      if (specifier) {
        // Library path validation
        if (specifier.includes("\0")) {
          return {
            valid: false,
            error: `Invalid library path: contains null byte`,
          };
        }
      }
      break;
    }

    case "sys":
    case "hrtime": {
      // These don't support specifiers
      if (specifier) {
        return {
          valid: false,
          error: `Permission type "${type}" does not support specifiers`,
        };
      }
      break;
    }
  }

  return { valid: true };
}

/**
 * Check if two permissions conflict (one grants more than the other).
 *
 * Used to detect overly permissive route configurations.
 *
 * @param p1 - First permission
 * @param p2 - Second permission
 * @returns True if permissions conflict in scope
 *
 * @example
 * ```typescript
 * permissionsConflict(
 *   { type: "net" },
 *   { type: "net", specifier: "api.example.com" }
 * )
 * // => true (first is broader than second)
 * ```
 */
export function permissionsConflict(
  p1: ParsedPermission,
  p2: ParsedPermission,
): boolean {
  // Different types never conflict
  if (p1.type !== p2.type) {
    return false;
  }

  // Both have same specifier - no conflict
  if (p1.specifier === p2.specifier) {
    return false;
  }

  // One has no specifier (grants all) - potential conflict
  if (!p1.specifier || !p2.specifier) {
    return true;
  }

  // Both have different specifiers
  // For file paths, check if one is parent of the other
  if (p1.type === "read" || p1.type === "write") {
    return (
      p1.specifier.startsWith(p2.specifier) ||
      p2.specifier.startsWith(p1.specifier)
    );
  }

  // For network, check hostname overlap
  if (p1.type === "net") {
    // Strip port for comparison
    const host1 = p1.specifier.split(":")[0];
    const host2 = p2.specifier.split(":")[0];

    return host1 === host2;
  }

  return false;
}

/**
 * Normalize a permission to canonical form.
 *
 * @param permission - Permission to normalize
 * @returns Normalized permission string
 */
export function normalizePermission(permission: Permission): Permission {
  const parsed = parsePermission(permission);

  if (!parsed.specifier) {
    return parsed.type as Permission;
  }

  return `${parsed.type}:${parsed.specifier}` as Permission;
}
