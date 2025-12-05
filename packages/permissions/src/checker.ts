/**
 * Runtime permission checker using Deno.permissions API.
 */

import type {
  ParsedPermission,
  Permission,
  PermissionCheckResult,
} from "~/types.ts";
import { parsePermission } from "~/parser.ts";

export async function checkPermission(
  permission: ParsedPermission,
): Promise<PermissionCheckResult> {
  try {
    const { type, specifier } = permission;

    let descriptor: Deno.PermissionDescriptor;

    switch (type) {
      case "net": {
        if (specifier) {
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

    const status = await Deno.permissions.query(descriptor);

    return {
      granted: status.state === "granted",
      message: status.state === "granted"
        ? undefined
        : `Permission "${formatPermission(permission)}" is ${status.state}`,
    };
  } catch (error) {
    return {
      granted: false,
      message: `Permission check failed: ${(error as Error).message}`,
    };
  }
}

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

function formatPermission(permission: ParsedPermission): string {
  return permission.specifier
    ? `${permission.type}:${permission.specifier}`
    : permission.type;
}

export async function requestPermission(
  permission: ParsedPermission,
): Promise<boolean> {
  const checkResult = await checkPermission(permission);

  if (checkResult.granted) {
    return true;
  }

  try {
    const { type, specifier } = permission;
    let descriptor: Deno.PermissionDescriptor;

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
