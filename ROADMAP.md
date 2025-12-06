# Kage Roadmap

## Vision

Build the fastest, most developer-friendly Deno-native framework by leveraging
Deno's unique capabilities: native TypeScript, Web Workers, and Web Standards.

## Phases

### Phase 1: Foundation

**Goal**: Prove core value proposition with minimal viable framework

- [x] Workspace structure and tooling
- [x] High-performance routing engine
  - [x] RegExp-based router without linear loops
  - [x] Path parameter extraction
  - [x] Wildcard and catch-all routes
  - [x] Route priority resolution
- [x] Method chaining API
  - [x] Fluent route registration (.get().post().listen())
- [x] Context API and middleware system
  - [x] Request/response abstraction
  - [x] Middleware composition
  - [x] Error handling middleware
  - [x] Built-in middleware (cors, logger)
  - [x] Compression middleware
- [x] Schema validation with TypeBox
  - [x] Request body validation
  - [x] Query parameter validation
  - [x] Full type inference from schemas
  - [x] Comprehensive test coverage
- [x] Comprehensive test coverage (>90%)
  - [x] Router tests (100% coverage)
  - [x] Core application tests
  - [x] Performance regression tests
  - [x] Schema validation tests
- [x] Initial benchmarks vs Hono, Oak, Express
  - [x] Router performance baseline (757ns static, 1.2µs parameter)
  - [x] Realistic API benchmark (12.3µs)
  - [x] Cross-framework comparison (65k req/s, competitive with Hono)
- [x] Performance optimizations
  - [x] Nested Map for O(1) static route lookup
  - [x] Pre-allocated Response/Headers objects
  - [x] Lazy URL parsing
  - [x] Optimized middleware execution paths
  - [x] Achieved ~145k req/s without middleware, ~73k with middleware

**Success points**: Framework demonstrates high performance with great DX.
**Exceeded: 27% faster than Hono**

### Phase 2: Type Safety & Developer Experience (Current)

**Goal**: Best-in-class TypeScript experience and developer ergonomics

- [x] End-to-end type inference
  - [x] Full request/response typing
  - [x] Context type propagation
  - [x] TypedContext, TypedHandler, TypedRouteDefinition
  - [x] createRoute() and route() fluent builder
  - [x] Path parameter type extraction from route patterns
  - [ ] Client type generation (planned)
- [ ] OpenAPI specification generation
  - Automatic schema extraction
  - Route documentation
  - Type-safe API clients
- [x] Structured error handling
  - [x] Custom error types (KageError, BadRequestError, NotFoundError, etc.)
  - [x] Error transformation with defaultErrorTransformer
  - [x] Development vs production modes (stack traces, details)
  - [x] Validation errors with field-level details
  - [x] Rate limit errors with Retry-After header
- [x] Hot reload and development tooling
  - [x] File watcher integration with debouncing
  - [x] Dev server with auto-restart
  - [x] Debug logging system with levels
  - [x] CLI command (kage dev)
- [x] Plugin system architecture
  - [x] Plugin lifecycle hooks (onRegister, onBeforeStart, onStart, onShutdown, onRequest, onResponse, onError)
  - [x] Configuration merging
  - [x] Plugin composition with composePlugins()
  - [x] Dependency checking between plugins
- [x] Plugin system
  - [x] Type-safe decorate() for singleton values
  - [x] Type-safe state() for mutable global state
  - [x] Type-safe derive() for per-request computed values
  - [x] Plugin functions via use() with full type inference
  - [x] Scoped groups via group() with prefix and isolated plugins
  - [x] Fluent lifecycle hooks (onRequest, onResponse, onError, onBeforeHandle, onAfterHandle)

**Success points**: Developer can build type-safe API in <100 LOC with zero
type annotations.

### Phase 3: Parallelism & Performance

**Goal**: Leverage Deno's Web Workers for transparent parallelism

- [ ] Transparent Workers API
  - Declarative parallel execution
  - Worker pool management
  - Automatic serialization
  - Resource cleanup
- [ ] Request-level parallelism
  - Concurrent handler execution
  - Shared-nothing architecture
  - Worker result aggregation
- [ ] Streaming support
  - Server-Sent Events (SSE)
  - WebSocket integration
  - Chunked responses
  - Backpressure handling
- [ ] Advanced caching strategies
  - In-memory cache
  - Deno KV integration
  - Cache invalidation
  - Stale-while-revalidate
- [ ] Performance optimizations
  - Zero-copy operations
  - Buffer pooling
  - JIT-friendly patterns

**Success points**: Match or exceed Hono performance, add unique worker-based
parallelism.

### Phase 4: Ecosystem & Adoption

**Goal**: Comprehensive ecosystem and community growth

- [ ] Official plugins
  - Authentication (Lucia, Auth.js)
  - CORS and security headers
  - Compression (Brotli, Gzip)
  - Request logging
  - Metrics and tracing
- [ ] ORM integrations
  - Prisma adapter
  - Drizzle adapter
  - Kysely support
- [ ] Deployment guides
  - Deno Deploy setup
  - Self-hosted deployment
  - Docker containerization
  - Environment configuration
- [ ] Starter templates
  - Basic API template
  - Multi-tenant SaaS template
  - Full-stack with Fresh
  - Microservices template
- [ ] CLI tooling
  - Project scaffolding
  - Code generation
  - Deployment helpers
  - Migration tools
- [ ] Comprehensive documentation
  - Getting started guide
  - API reference
  - Architecture deep-dives
  - Migration guides
  - Best practices

## Metrics & Benchmarks

Performance targets (requests/second on standard hardware):

- Simple route: >100k req/s
- JSON response: >80k req/s
- Validated route: >50k req/s
- Worker-based route: >40k req/s

Comparison benchmarks maintained against:

- Hono (edge performance leader)
- Fastify (Node.js performance leader)
- Oak (Deno middleware framework)
- Express (industry standard)

## Non-Goals

- Multi-runtime support (Bun, Node, Cloudflare Workers)
- Frontend framework integration (use Fresh or others)
- Built-in ORM or database layer
- Template rendering
- Session management (use external libraries)

## Decision Log

### Why Deno-exclusive?

Supporting multiple runtimes requires lowest-common-denominator APIs. Deno's
permission system, native TypeScript, and Web Standards are unique advantages
worth building around exclusively.

### Why not extend Hono?

Hono's multi-runtime design prevents tight Deno integration. Permission-aware
routing and transparent workers require runtime-specific APIs that would break
Hono's abstraction.

### Why TypeBox for validation?

TypeBox provides excellent type inference with better performance than Zod.
It compiles schemas to efficient validation functions and is lighter weight.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to contribute to this roadmap.
