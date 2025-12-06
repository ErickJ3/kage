/**
 * High-performance Radix Tree Router
 */

import type { Handler, HttpMethod, Match } from "~/types.ts";

// Frozen empty params - single allocation, reused everywhere
const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null));

// Character codes for fast comparison
const SLASH = 47; // '/'
const COLON = 58; // ':'
const STAR = 42; // '*'

interface RouteData {
  handler: Handler;
  paramNames: string[];
}

interface RadixNode {
  // The path segment this node represents
  segment: string;
  // Handler at this node (if terminal)
  route: RouteData | null;
  // Static children indexed by full segment
  children: Map<string, RadixNode>;
  // Parametric child node (:param)
  paramChild: RadixNode | null;
  // Wildcard route (*)
  wildcardRoute: RouteData | null;
}

function createNode(segment: string = ""): RadixNode {
  return {
    segment,
    route: null,
    children: new Map(),
    paramChild: null,
    wildcardRoute: null,
  };
}

/**
 * High-performance Radix Tree Router
 */
export class RadixRouter {
  private trees: Map<HttpMethod, RadixNode>;
  private staticCache: Map<string, Match>;

  constructor() {
    this.trees = new Map();
    this.staticCache = new Map();
  }

  /**
   * Add a route
   */
  add(method: HttpMethod, path: string, handler: Handler): void {
    if (path.charCodeAt(0) !== SLASH) {
      throw new Error(`Route path must start with /: ${path}`);
    }

    let tree = this.trees.get(method);
    if (!tree) {
      tree = createNode();
      this.trees.set(method, tree);
    }

    const paramNames: string[] = [];
    let node = tree;
    let isStatic = true;
    let i = 1; // Skip leading slash
    const len = path.length;

    while (i < len) {
      // Find segment end
      let j = i;
      while (j < len && path.charCodeAt(j) !== SLASH) j++;
      const segment = path.slice(i, j);
      i = j + 1; // Move past slash

      const firstChar = segment.charCodeAt(0);

      if (firstChar === COLON) {
        // Parameter segment
        isStatic = false;
        paramNames.push(segment.slice(1));
        if (!node.paramChild) {
          node.paramChild = createNode("");
        }
        node = node.paramChild;
      } else if (firstChar === STAR) {
        // Wildcard - consumes rest of path
        isStatic = false;
        paramNames.push("*");
        if (node.wildcardRoute) {
          throw new Error(
            `Wildcard route already registered: ${method} ${path}`,
          );
        }
        node.wildcardRoute = { handler, paramNames: [...paramNames] };
        return;
      } else {
        // Static segment
        let child = node.children.get(segment);
        if (!child) {
          child = createNode(segment);
          node.children.set(segment, child);
        }
        node = child;
      }
    }

    // Register at terminal node
    if (node.route) {
      throw new Error(`Route already registered: ${method} ${path}`);
    }
    node.route = {
      handler,
      paramNames: paramNames.length > 0 ? [...paramNames] : [],
    };

    // Cache static routes for O(1) lookup
    if (isStatic) {
      this.staticCache.set(`${method}:${path}`, {
        handler,
        params: EMPTY_PARAMS,
      });
    }
  }

  /**
   * Find a matching route - hot path optimized
   */
  find(method: HttpMethod, path: string): Match | null {
    // Fast path: O(1) static cache lookup
    const cached = this.staticCache.get(`${method}:${path}`);
    if (cached) return cached;

    const tree = this.trees.get(method);
    if (!tree) return null;

    // Dynamic matching with inline parsing
    const paramValues: string[] = [];
    const route = this.match(tree, path, 1, paramValues);

    if (route) {
      // Build params object
      const paramNames = route.paramNames;
      if (paramNames.length === 0) {
        return { handler: route.handler, params: EMPTY_PARAMS };
      }

      const params: Record<string, string> = Object.create(null);
      for (let i = 0; i < paramNames.length; i++) {
        params[paramNames[i]] = paramValues[i];
      }
      return { handler: route.handler, params };
    }

    return null;
  }

  private match(
    node: RadixNode,
    path: string,
    start: number,
    paramValues: string[],
  ): RouteData | null {
    const len = path.length;

    // End of path - check for route at current node
    if (start >= len) {
      return node.route;
    }

    // Find current segment
    let end = start;
    while (end < len && path.charCodeAt(end) !== SLASH) end++;
    const segment = path.slice(start, end);
    const nextStart = end + 1;

    // 1. Try static child first (most common, most specific)
    const staticChild = node.children.get(segment);
    if (staticChild) {
      const result = this.match(staticChild, path, nextStart, paramValues);
      if (result) return result;
    }

    // 2. Try parametric child
    if (node.paramChild) {
      paramValues.push(segment);
      const result = this.match(node.paramChild, path, nextStart, paramValues);
      if (result) return result;
      paramValues.pop();
    }

    // 3. Try wildcard (consumes everything from current position)
    if (node.wildcardRoute) {
      paramValues.push(path.slice(start));
      return node.wildcardRoute;
    }

    return null;
  }

  /**
   * Clear all routes
   */
  clear(): void {
    this.trees.clear();
    this.staticCache.clear();
  }

  /**
   * Get static cache size (for debugging)
   */
  getStaticCacheSize(): number {
    return this.staticCache.size;
  }
}

// Exported for compatibility with existing code
export function releaseParams(_params: Record<string, string>): void {
  // No-op - V8 GC handles small short-lived objects efficiently
}
