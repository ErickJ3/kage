/**
 * Runtime permission checker using Deno.permissions API.
 *
 * Validates that route has necessary permissions before executing handlers.
 */

import type {
  ParsedPermission,
  Permission,
  PermissionCheckResult,
} from "./types.ts";
import { parsePermission } from "./parser.ts";

/**
 * Check if a specific permission is granted at runtime.
 *
 * Uses Deno.permissions.query() to verify permission status.
 *
 * @param permission - Parsed permission to check
 * @returns Permission status
 *
 * @example
 * ```typescript
 * const result = await checkPermission({ type: "net", specifier: "example.com" });
 * if (!result.granted) {
 *   console.log("Network access to example.com denied");
 * }
 * ```
 */
export async function checkPermission(
  permission: ParsedPermission,
): Promise<PermissionCheckResult> {
  try {
    const { type, specifier } = permission;

    // Build permission descriptor based on type
    let descriptor: Deno.PermissionDescriptor;

    switch (type) {
      case "net": {
        if (specifier) {
          // Parse host:port format
          const parts = specifier.split(":");
          const host = parts[0];
          const port = parts[1] ? parseInt(parts[1], 10) : undefined;

          descriptor = {
            name: "net",
            host: port !== undefined ? `${host}:${port}` : host,
          };
        } else {
          descriptor = { name: "net" };
        }
        break;
      }

      case "read": {
        descriptor = specifier
          ? { name: "read", path: specifier }
          : { name: "read" };
        break;
      }

      case "write": {
        descriptor = specifier
          ? { name: "write", path: specifier }
          : { name: "write" };
        break;
      }

      case "env": {
        descriptor = specifier
          ? { name: "env", variable: specifier }
          : { name: "env" };
        break;
      }

      case "run": {
        descriptor = specifier
          ? { name: "run", command: specifier }
          : { name: "run" };
        break;
      }

      case "ffi": {
        descriptor = specifier
          ? { name: "ffi", path: specifier }
          : { name: "ffi" };
        break;
      }

      case "sys": {
        descriptor = { name: "sys" };
        break;
      }

      case "hrtime": {
        // hrtime not in official types but supported by Deno runtime
        descriptor = { name: "hrtime" } as unknown as Deno.PermissionDescriptor;
        break;
      }

      default: {
        return {
          granted: false,
          message: `Unknown permission type: ${type}`,
        };
      }
    }

    // Query permission status
    const status = await Deno.permissions.query(descriptor);

    return {
      granted: status.state === "granted",
      message: status.state === "granted"
        ? undefined
        : `Permission "${formatPermission(permission)}" is ${status.state}`,
    };
  } catch (error) {
    // Permission query failed
    return {
      granted: false,
      message: `Permission check failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Check multiple permissions and return aggregated result.
 *
 * All required permissions must be granted for overall success.
 *
 * @param permissions - Array of permissions to check
 * @returns Check result with list of missing permissions
 *
 * @example
 * ```typescript
 * const result = await checkPermissions([
 *   "net:api.example.com",
 *   "env:API_KEY"
 * ]);
 *
 * if (!result.granted) {
 *   console.log("Missing permissions:", result.missing);
 * }
 * ```
 */
export async function checkPermissions(
  permissions: Permission[],
): Promise<PermissionCheckResult> {
  if (permissions.length === 0) {
    return { granted: true };
  }

  const parsed = permissions.map((p) => parsePermission(p));
  const results = await Promise.all(parsed.map((p) => checkPermission(p)));

  const missing: ParsedPermission[] = [];
  const messages: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result.granted) {
      missing.push(parsed[i]);
      if (result.message) {
        messages.push(result.message);
      }
    }
  }

  if (missing.length === 0) {
    return { granted: true };
  }

  return {
    granted: false,
    message: messages.join("; "),
    missing,
  };
}

/**
 * Format permission for human-readable error messages.
 */
function formatPermission(permission: ParsedPermission): string {
  return permission.specifier
    ? `${permission.type}:${permission.specifier}`
    : permission.type;
}

/**
 * Request permission at runtime (prompts user if needed).
 *
 * Only works in interactive environments. Will fail in production.
 *
 * @param permission - Permission to request
 * @returns Whether permission was granted
 */
export async function requestPermission(
  permission: ParsedPermission,
): Promise<boolean> {
  const checkResult = await checkPermission(permission);

  if (checkResult.granted) {
    return true;
  }

  // Permission not granted, try to request it
  try {
    const { type, specifier } = permission;
    let descriptor: Deno.PermissionDescriptor;

    // Build descriptor (same logic as checkPermission)
    switch (type) {
      case "net":
        descriptor = specifier ? { name: "net", host: specifier } : {
          name: "net",
        };
        break;
      case "read":
        descriptor = specifier ? { name: "read", path: specifier } : {
          name: "read",
        };
        break;
      case "write":
        descriptor = specifier ? { name: "write", path: specifier } : {
          name: "write",
        };
        break;
      case "env":
        descriptor = specifier ? { name: "env", variable: specifier } : {
          name: "env",
        };
        break;
      case "run":
        descriptor = specifier ? { name: "run", command: specifier } : {
          name: "run",
        };
        break;
      case "ffi":
        descriptor = specifier ? { name: "ffi", path: specifier } : {
          name: "ffi",
        };
        break;
      case "sys":
        descriptor = { name: "sys" };
        break;
      case "hrtime":
        // hrtime not in official types but supported by Deno runtime
        descriptor = { name: "hrtime" } as unknown as Deno.PermissionDescriptor;
        break;
      default:
        return false;
    }

    const status = await Deno.permissions.request(descriptor);
    return status.state === "granted";
  } catch {
    return false;
  }
}
