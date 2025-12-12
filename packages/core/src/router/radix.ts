import type { Handler, HttpMethod, Match } from "~/router/types.ts";

const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null));
const SLASH = 47;
const COLON = 58;
const STAR = 42;

interface RouteData {
  handler: Handler;
  paramNames: string[];
}

interface RadixNode {
  segment: string;
  route: RouteData | null;
  children: Map<string, RadixNode>;
  paramChild: RadixNode | null;
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

export class Router {
  private trees: Map<HttpMethod, RadixNode>;
  private staticCache: Map<string, Match>;

  constructor() {
    this.trees = new Map();
    this.staticCache = new Map();
  }

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
    let i = 1;
    const len = path.length;

    while (i < len) {
      let j = i;
      while (j < len && path.charCodeAt(j) !== SLASH) j++;
      const segment = path.slice(i, j);
      i = j + 1;

      const firstChar = segment.charCodeAt(0);

      if (firstChar === COLON) {
        isStatic = false;
        paramNames.push(segment.slice(1));
        if (!node.paramChild) {
          node.paramChild = createNode("");
        }
        node = node.paramChild;
      } else if (firstChar === STAR) {
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
        let child = node.children.get(segment);
        if (!child) {
          child = createNode(segment);
          node.children.set(segment, child);
        }
        node = child;
      }
    }

    if (node.route) {
      throw new Error(`Route already registered: ${method} ${path}`);
    }
    node.route = {
      handler,
      paramNames: paramNames.length > 0 ? [...paramNames] : [],
    };

    if (isStatic) {
      this.staticCache.set(`${method}:${path}`, {
        handler,
        params: EMPTY_PARAMS,
      });
    }
  }

  find(method: HttpMethod, path: string): Match | null {
    const cached = this.staticCache.get(`${method}:${path}`);
    if (cached) return cached;

    const tree = this.trees.get(method);
    if (!tree) return null;

    const paramValues: string[] = [];
    const route = this.match(tree, path, 1, paramValues);

    if (route) {
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

    if (start >= len) {
      return node.route;
    }

    let end = start;
    while (end < len && path.charCodeAt(end) !== SLASH) end++;
    const segment = path.slice(start, end);
    const nextStart = end + 1;

    const staticChild = node.children.get(segment);
    if (staticChild) {
      const result = this.match(staticChild, path, nextStart, paramValues);
      if (result) return result;
    }

    if (node.paramChild) {
      paramValues.push(segment);
      const result = this.match(node.paramChild, path, nextStart, paramValues);
      if (result) return result;
      paramValues.pop();
    }

    if (node.wildcardRoute) {
      paramValues.push(path.slice(start));
      return node.wildcardRoute;
    }

    return null;
  }

  clear(): void {
    this.trees.clear();
    this.staticCache.clear();
  }

  getStaticCacheSize(): number {
    return this.staticCache.size;
  }
}
