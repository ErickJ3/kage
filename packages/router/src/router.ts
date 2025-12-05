/**
 * High-performance router using RegExp-based matching.
 *
 * Design:
 * - Map for O(1) method lookup
 * - Routes stored in registration order for predictable priority
 * - RegExp patterns compiled once at registration
 * - Parameter extraction with pre-computed param names
 * - Object pooling for params to reduce GC pressure
 */

import type { Handler, HttpMethod, Match, Route } from "~/types.ts";

// Frozen empty params object for static routes - single allocation
const EMPTY_PARAMS: Record<string, string> = Object.freeze(
  Object.create(null),
);

// Simple params creation - pooling adds overhead for small objects
function createParams(): Record<string, string> {
  return Object.create(null);
}

// No-op release - GC handles small short-lived objects efficiently
function releaseParams(_params: Record<string, string>): void {
  // Intentionally empty - V8's GC is optimized for short-lived objects
}

interface StaticCacheEntry {
  route: Route;
  match: Match;
}

/**
 * Router class for registering and matching HTTP routes.
 *
 * @example
 * ```typescript
 * const router = new Router();
 *
 * router.add("GET", "/users", () => ({ users: [] }));
 * router.add("GET", "/users/:id", (params) => ({ id: params.id }));
 *
 * const match = router.find("GET", "/users/123");
 * if (match) {
 *   const result = match.handler(match.params);
 * }
 * ```
 */
export class Router {
  private routes: Map<HttpMethod, Route[]>;
  private staticCache: Map<HttpMethod, Map<string, StaticCacheEntry>>;

  constructor() {
    this.routes = new Map();
    this.staticCache = new Map();
  }

  /**
   * Register a new route.
   *
   * @throws {Error} If route is already registered or path doesn't start with /
   */
  add(method: HttpMethod, path: string, handler: Handler): void {
    if (!path.startsWith("/")) {
      throw new Error(`Route path must start with /: ${path}`);
    }

    const methodRoutes = this.routes.get(method) ?? [];
    const duplicate = methodRoutes.find((r) => r.path === path);
    if (duplicate) {
      throw new Error(`Route already registered: ${method} ${path}`);
    }

    const { pattern, paramNames } = this.pathToRegExp(path);

    const route: Route = {
      method,
      pattern,
      handler,
      paramNames,
      path,
    };

    const isStatic = paramNames.length === 0 && !path.includes("*");

    if (!this.routes.has(method)) {
      this.routes.set(method, []);
    }
    this.routes.get(method)!.push(route);

    if (isStatic) {
      if (!this.staticCache.has(method)) {
        this.staticCache.set(method, new Map());
      }
      this.staticCache.get(method)!.set(path, {
        route,
        match: {
          handler: route.handler,
          params: EMPTY_PARAMS,
        },
      });
    }
  }

  /**
   * Find a matching route for the given method and path.
   */
  find(method: HttpMethod, path: string): Match | null {
    // Fast path: static route cache lookup
    const methodCache = this.staticCache.get(method);
    if (methodCache) {
      const cached = methodCache.get(path);
      if (cached) {
        return cached.match;
      }
    }

    // Dynamic route matching
    const methodRoutes = this.routes.get(method);
    if (!methodRoutes) {
      return null;
    }

    const len = methodRoutes.length;
    for (let i = 0; i < len; i++) {
      const route = methodRoutes[i];
      const regexMatch = route.pattern.exec(path);
      if (regexMatch) {
        const paramNames = route.paramNames;
        const paramLen = paramNames.length;

        // Create params object
        const params = createParams();
        for (let j = 0; j < paramLen; j++) {
          params[paramNames[j]] = regexMatch[j + 1];
        }

        return {
          handler: route.handler,
          params,
        };
      }
    }

    return null;
  }

  /**
   * Release params object back to the pool.
   * Should be called after request handling is complete.
   */
  releaseParams(params: Record<string, string>): void {
    if (params !== EMPTY_PARAMS) {
      releaseParams(params);
    }
  }

  /**
   * Convert path pattern to RegExp with parameter extraction.
   *
   * Supports:
   * - Static: /users
   * - Named parameters: /users/:id
   * - Multiple parameters: /users/:userId/posts/:postId
   * - Wildcard: /files/*
   */
  private pathToRegExp(path: string): {
    pattern: RegExp;
    paramNames: string[];
  } {
    const paramNames: string[] = [];

    let pattern = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

    pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });

    pattern = pattern.replace(/\*/g, "(.*)");

    pattern = `^${pattern}$`;

    return {
      pattern: new RegExp(pattern),
      paramNames,
    };
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): Route[] {
    const allRoutes: Route[] = [];
    for (const routes of this.routes.values()) {
      allRoutes.push(...routes);
    }
    return allRoutes;
  }

  /**
   * Remove all routes.
   */
  clear(): void {
    this.routes.clear();
    this.staticCache.clear();
  }

  getStaticCacheSize(): number {
    let size = 0;
    for (const methodCache of this.staticCache.values()) {
      size += methodCache.size;
    }
    return size;
  }
}

// Export for external use
export { releaseParams };
