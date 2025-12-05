/**
 * Permission string parser and validator.
 */

import type { ParsedPermission, Permission } from "~/types.ts";

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

export function parsePermission(permission: Permission): ParsedPermission {
  const colonIndex = permission.indexOf(":");

  if (colonIndex === -1) {
    const type = permission;

    if (!isValidPermissionType(type)) {
      throw new Error(`Invalid permission type: ${type}`);
    }

    return { type };
  }

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

export function parsePermissions(
  permissions: Permission[],
): ParsedPermission[] {
  return permissions.map((p) => parsePermission(p));
}

function isValidPermissionType(type: string): boolean {
  return PERMISSION_TYPES.includes(type as typeof PERMISSION_TYPES[number]);
}

export function validatePermissionFormat(
  permission: ParsedPermission,
): { valid: boolean; error?: string } {
  const { type, specifier } = permission;

  switch (type) {
    case "net": {
      if (specifier) {
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

export function permissionsConflict(
  p1: ParsedPermission,
  p2: ParsedPermission,
): boolean {
  if (p1.type !== p2.type) {
    return false;
  }

  if (p1.specifier === p2.specifier) {
    return false;
  }

  if (!p1.specifier || !p2.specifier) {
    return true;
  }

  if (p1.type === "read" || p1.type === "write") {
    return (
      p1.specifier.startsWith(p2.specifier) ||
      p2.specifier.startsWith(p1.specifier)
    );
  }

  if (p1.type === "net") {
    const host1 = p1.specifier.split(":")[0];
    const host2 = p2.specifier.split(":")[0];

    return host1 === host2;
  }

  return false;
}

export function normalizePermission(permission: Permission): Permission {
  const parsed = parsePermission(permission);

  if (!parsed.specifier) {
    return parsed.type as Permission;
  }

  return `${parsed.type}:${parsed.specifier}` as Permission;
}
