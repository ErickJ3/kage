# Contributing to Kage

## Development Directives

### Code Style

#### File Naming

Use `snake_case` for all files as recommended by Deno style guide:

```
router.ts          ✓ Correct
request_context.ts ✓ Correct
RequestContext.ts  ✗ Incorrect
request-context.ts ✗ Incorrect
```

#### TypeScript Standards

- Strict mode enabled for all packages
- No implicit any
- Explicit return types for public APIs
- Prefer `const` over `let`
- Use descriptive variable names
- Avoid abbreviations unless widely understood

#### Comments

Only comment what is necessary for future developers:

```typescript
// Good: Explains non-obvious optimization
// Using Set for O(1) lookup instead of Array.includes O(n)
const seen = new Set<string>();

// Bad: States the obvious
// Create a new user
const user = new User();

// Good: Documents complex algorithm
/**
 * Implements RegExp-based routing without linear loops.
 * Uses trie structure for O(log n) route matching.
 */
class Router {}

// Bad: Redundant documentation
/**
 * Gets the user name
 * @returns the user name
 */
getName(): string {}
```

Comment when:

- Algorithm is non-obvious
- Performance optimization requires explanation
- Security consideration is critical
- Workaround for known issue
- Public API needs documentation

Do not comment:

- Obvious operations
- Self-explanatory code
- Type information (use TypeScript)

### Testing Requirements

#### Coverage Standards

- Minimum 90% line coverage per package
- 100% coverage for critical paths (routing)
- Test edge cases and error conditions
- Include performance regression tests

#### Test Structure

```typescript
import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

describe("Router", () => {
  describe("add()", () => {
    it("should register route with exact path", () => {
      const router = new Router();
      router.add("GET", "/users", handler);
      assertEquals(router.find("GET", "/users"), handler);
    });

    it("should throw on duplicate route registration", () => {
      const router = new Router();
      router.add("GET", "/users", handler);
      assertRejects(() => router.add("GET", "/users", handler));
    });
  });
});
```

#### Test Files

- Use `.test.ts` suffix for test files (e.g., `router.test.ts`)
- Use `.bench.ts` suffix for benchmark files (e.g., `router.bench.ts`)
- Tests live in `test/` directory within each package
- Integration tests in `tests/` directory
- Benchmarks in `bench/` directory

### Benchmarking

All performance-critical code must have benchmarks:

```typescript
import { bench } from "@std/bench";

// Benchmark against baseline
bench({
  name: "router - static route",
  fn: () => {
    router.find("GET", "/users");
  },
});

bench({
  name: "router - dynamic route",
  fn: () => {
    router.find("GET", "/users/123");
  },
});
```

Keep benchmarks organized by package in `bench/` directory. Run benchmarks
before and after changes to detect regressions.

### Architecture Decisions

Each package:

- Has its own `deno.json` with exports
- Maintains independent versioning
- Can be published separately to JSR
- Has minimal dependencies on other packages

#### Dependency Rules

1. Core package depends on nothing
2. Router depends only on core
3. Other packages depend on core and router only
4. No circular dependencies
5. Prefer Deno standard library over third-party
6. External dependencies require justification

#### Module Boundaries

```typescript
// Good: Clean interface
export interface Router {
  add(method: string, path: string, handler: Handler): void;
  find(method: string, path: string): Match | null;
}

// Bad: Exposing internals
export class Router {
  public _internalState: Map<string, Node>; // ✗
}
```

### Security Guidelines

#### Input Validation

- Validate all external input
- Use schema validation (Zod)
- Sanitize before processing
- Reject invalid input early

#### Permission Handling

- Never run with `--allow-all` in production
- Validate permissions before operations
- Fail securely (deny by default)
- Log permission violations

#### Common Vulnerabilities

Prevent:

- Command injection
- Path traversal
- XSS in error messages
- SQL injection (via ORMs)
- Prototype pollution
- ReDoS (Regular Expression Denial of Service)

### Performance Guidelines

#### Optimization Priorities

1. Correctness first, then performance
2. Measure before optimizing
3. Profile to find bottlenecks
4. Optimize hot paths only
5. Keep optimizations readable

#### Performance Patterns

```typescript
// Good: Reuse objects
const response = new Response();
response.headers.set("Content-Type", "application/json");

// Bad: Create objects in hot path
return new Response(JSON.stringify(data), {
  headers: { "Content-Type": "application/json" },
});
```

#### Avoid Premature Optimization

```typescript
// Good: Simple and clear
function findUser(id: string): User | null {
  return users.find((u) => u.id === id) ?? null;
}

// Bad: Premature optimization without benchmarks
const userCache = new Map<string, User>();
function findUser(id: string): User | null {
  if (userCache.has(id)) return userCache.get(id)!;
  const user = users.find((u) => u.id === id) ?? null;
  if (user) userCache.set(id, user);
  return user;
}
```

### Git Workflow

#### Commits

Not managed by this tool. Contributors should:

- Write clear, descriptive commit messages
- Keep commits focused and atomic
- Reference issues when applicable

#### Branches

- `main` - stable, released code
- `develop` - integration branch
- `feature/*` - new features
- `fix/*` - bug fixes
- `perf/*` - performance improvements

### Development Commands

```bash
# Run all tests
deno task test

# Watch mode for TDD
deno task test:watch

# Type check entire workspace
deno task check

# Format all code
deno task fmt

# Lint all code
deno task lint

# Run benchmarks
deno task bench

# Generate coverage report
deno task coverage
```

### Package Development

When adding a new package:

1. Create directory in `packages/`
2. Add `deno.json` with package metadata
3. Define clear public API in `mod.ts`
4. Add comprehensive tests
5. Add benchmarks if performance-critical
6. Update workspace `deno.json`
7. Document in package README

### Pull Request Process

1. Ensure all tests pass
2. Add tests for new functionality
3. Update benchmarks if applicable
4. Run formatter and linter
5. Update documentation
6. Verify no performance regressions

### Questions?

Open an issue for:

- Clarification on architecture
- Proposing new features
- Reporting bugs
- Performance concerns

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
