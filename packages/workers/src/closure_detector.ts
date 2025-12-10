/**
 * Closure detection for inline workers.
 */

const SAFE_GLOBALS = new Set([
  "undefined",
  "null",
  "NaN",
  "Infinity",
  "globalThis",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "BigInt",
  "Function",
  "Promise",
  "Proxy",
  "Reflect",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
  "JSON",
  "Math",
  "console",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent",
  "eval",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "self",
  "postMessage",
  "close",
  "importScripts",
  "ArrayBuffer",
  "DataView",
  "SharedArrayBuffer",
  "Uint8Array",
  "Int8Array",
  "Uint8ClampedArray",
  "Uint16Array",
  "Int16Array",
  "Uint32Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "Blob",
  "File",
  "FileReader",
  "FileReaderSync",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "crypto",
  "SubtleCrypto",
  "CryptoKey",
  "performance",
  "PerformanceObserver",
  "fetch",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "atob",
  "btoa",
  "Event",
  "EventTarget",
  "MessageEvent",
  "ErrorEvent",
  "CloseEvent",
  "WebSocket",
  "structuredClone",
  "Intl",
  "Iterator",
  "Generator",
  "GeneratorFunction",
  "AsyncGenerator",
  "AsyncGeneratorFunction",
  "AbortController",
  "AbortSignal",
  "Atomics",
  "WeakRef",
  "FinalizationRegistry",
]);

// Keywords that should be ignored as they're not variable references
const JS_KEYWORDS = new Set([
  "break",
  "case",
  "catch",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "new",
  "return",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "class",
  "const",
  "enum",
  "export",
  "extends",
  "import",
  "super",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "async",
  "await",
  "of",
  "from",
  "as",
  "get",
  "set",
  "true",
  "false",
]);

/**
 * Error thrown when a function contains invalid closures.
 */
export class ClosureError extends Error {
  /**
   * @param variables - List of variable names that are invalid closures
   */
  constructor(public readonly variables: string[]) {
    super(
      `Invalid closure: function references external variables that won't be available in worker context: ${
        variables.join(", ")
      }. ` +
        `Inline workers must be self-contained. Pass data through the function parameter instead.`,
    );
    this.name = "ClosureError";
  }
}

/**
 * Extracts parameter names from a function string.
 */
function extractParameters(fnString: string): Set<string> {
  const params = new Set<string>();

  // Match arrow function params: (a, b) => or a =>
  // Match regular function params: function(a, b) or function name(a, b)
  const arrowMatch = fnString.match(/^\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
  const arrowSingleMatch = fnString.match(/^\s*(?:async\s*)?(\w+)\s*=>/);
  const funcMatch = fnString.match(
    /^\s*(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/,
  );

  let paramString = "";
  if (arrowMatch) {
    paramString = arrowMatch[1];
  } else if (arrowSingleMatch) {
    params.add(arrowSingleMatch[1]);
    return params;
  } else if (funcMatch) {
    paramString = funcMatch[1];
  }

  // Parse parameter string, handling destructuring and defaults
  if (paramString) {
    // Simple extraction: split by comma and extract identifiers
    // This handles: a, b = 1, { x, y }, [a, b], ...rest
    const identifierPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = identifierPattern.exec(paramString)) !== null) {
      params.add(match[1]);
    }
  }

  return params;
}

/**
 * Extracts locally declared variables from function body.
 */
function extractLocalVariables(fnString: string): Set<string> {
  const locals = new Set<string>();

  // Find function body (after => or after function(...) {)
  let bodyStart = fnString.indexOf("=>");
  if (bodyStart !== -1) {
    bodyStart += 2;
  } else {
    bodyStart = fnString.indexOf("{");
    if (bodyStart !== -1) bodyStart += 1;
  }

  if (bodyStart === -1) return locals;

  const body = fnString.slice(bodyStart);

  // Match variable declarations: const x, let y, var z
  // Also match destructuring: const { a, b } = ..., const [x, y] = ...
  const patterns = [
    // const/let/var followed by identifier
    /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // const/let/var with destructuring - extract all identifiers
    /\b(?:const|let|var)\s+[\[{]([^=]+)[\]}]\s*=/g,
    // function declarations
    /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // class declarations
    /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // catch clause parameter
    /\bcatch\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // for...of and for...in loop variables
    /\bfor\s*\(\s*(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // Arrow function parameters: (a, b) => or single param a =>
    /\(([^)]*)\)\s*=>/g,
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g,
    // Regular function parameters in nested functions: function(a, b)
    /\bfunction\s*\w*\s*\(([^)]*)\)/g,
    // Method shorthand in objects: foo(a, b) { }
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*\{/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      // Handle method shorthand which has 2 groups
      const captured = match[2] ?? match[1];
      // For destructuring patterns, extract all identifiers
      const identifiers = captured.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
      if (identifiers) {
        for (const id of identifiers) {
          locals.add(id);
        }
      }
    }
  }

  return locals;
}

/**
 * Extracts all identifiers used in the function body.
 */
function extractIdentifiers(fnString: string): Set<string> {
  const identifiers = new Set<string>();

  // Find function body
  let bodyStart = fnString.indexOf("=>");
  if (bodyStart !== -1) {
    bodyStart += 2;
  } else {
    bodyStart = fnString.indexOf("{");
    if (bodyStart !== -1) bodyStart += 1;
  }

  if (bodyStart === -1) return identifiers;

  const body = fnString.slice(bodyStart);

  // Remove string literals to avoid false positives
  const cleaned = body
    .replace(/`(?:[^`\\]|\\.)*`/g, '""') // template literals
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double quotes
    .replace(/'(?:[^'\\]|\\.)*'/g, '""') // single quotes
    .replace(/\/\/[^\n]*/g, "") // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // multi-line comments

  // Match all identifiers
  const pattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match;
  while ((match = pattern.exec(cleaned)) !== null) {
    const id = match[1];
    // Skip if it's after a dot (property access)
    const beforeIndex = match.index - 1;
    if (beforeIndex >= 0 && cleaned[beforeIndex] === ".") {
      continue;
    }
    identifiers.add(id);
  }

  return identifiers;
}

/**
 * Detects potential closure variables in a function.
 *
 * @param fn - The function to analyze
 * @returns Array of variable names that appear to be closures
 *
 * @example
 * ```ts
 * const multiplier = 2;
 * const closures = detectClosures((n) => n * multiplier);
 * // Returns: ["multiplier"]
 * ```
 */
export function detectClosures(fn: (...args: unknown[]) => unknown): string[] {
  const fnString = fn.toString();
  const params = extractParameters(fnString);
  const locals = extractLocalVariables(fnString);
  const identifiers = extractIdentifiers(fnString);

  const allowed = new Set([
    ...SAFE_GLOBALS,
    ...JS_KEYWORDS,
    ...params,
    ...locals,
  ]);

  const closures: string[] = [];
  for (const id of identifiers) {
    if (!allowed.has(id)) {
      closures.push(id);
    }
  }

  return [...new Set(closures)]; // deduplicate
}

/**
 * Validates that a function has no closures and throws if it does.
 *
 * @param fn - The function to validate
 * @throws {ClosureError} If the function contains closure references
 *
 * @example
 * ```ts
 * const multiplier = 2;
 *
 * // This will throw ClosureError
 * validateNoClosures((n) => n * multiplier);
 *
 * // This is valid - no closures
 * validateNoClosures((n) => n * 2);
 * ```
 */
export function validateNoClosures(fn: (...args: unknown[]) => unknown): void {
  const closures = detectClosures(fn);
  if (closures.length > 0) {
    throw new ClosureError(closures);
  }
}
