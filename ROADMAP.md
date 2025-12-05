# Kage Roadmap

## Vision

Build the definitive Deno-native framework for secure, multi-tenant APIs by
leveraging Deno's unique capabilities that other runtimes cannot replicate.

## Phases

### Phase 1: Foundation

**Goal**: Prove core value proposition with minimal viable framework

- [x] Workspace structure and tooling
- [x] High-performance routing engine
  - [x] RegExp-based router without linear loops
  - [x] Path parameter extraction
  - [x] Wildcard and catch-all routes
  - [x] Route priority resolution
- [x] Permission-aware routing system
  - [x] Parse Deno permission flags
  - [x] Declarative permissions per route
  - [x] Runtime permission validation
  - [x] Permission conflict detection
- [x] Context API and middleware system
  - [x] Request/response abstraction
  - [x] Middleware composition
  - [x] Error handling middleware
  - [x] Built-in middleware (cors, logger)
  - [x] Compression middleware
- [x] Basic schema validation with Zod
  - [x] Request body validation
  - [x] Query parameter validation
  - [x] Response validation (development mode)
  - [x] Type inference from schemas
  - [x] Middleware-based validation
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

**Success points**: Framework demonstrates permission-aware routing with
performance within 10% of Hono. **Exceeded: 27% faster than Hono**

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

### Phase 4: Multi-Tenancy & Enterprise

**Goal**: Production-ready multi-tenant SaaS capabilities

- [ ] Tenant resolution system
  - Header-based resolution
  - Subdomain resolution
  - Path-based resolution
  - Custom resolver functions
- [ ] Tenant isolation
  - Namespace separation
  - Permission boundaries
  - Resource quotas
  - Data segregation
- [ ] Deno KV multi-tenant namespacing
  - Automatic key prefixing
  - Tenant-scoped queries
  - Cross-tenant protection
- [ ] Rate limiting per tenant
  - Token bucket algorithm
  - Sliding window
  - Distributed rate limiting
  - Custom limit strategies
- [ ] Audit logging
  - Structured event logging
  - Tenant action tracking
  - Compliance support
  - Log aggregation hooks
- [ ] Billing integration hooks
  - Usage metering
  - Event-based billing
  - Quota enforcement

**Success points**: Deploy production multi-tenant application with isolated
tenants and usage tracking.

### Phase 5: Ecosystem & Adoption

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
- Multi-tenant route: >40k req/s

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

### Why Zod for validation?

Zod is the TypeScript-native validation library with the best type inference.
Alternatives like Ajv are faster but require code generation or lose type
safety.

### Why focus on multi-tenancy?

Multi-tenant SaaS is a large, underserved market with specific technical
requirements. Most frameworks treat it as an afterthought. Making it a
first-class feature creates clear differentiation.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to contribute to this roadmap.
