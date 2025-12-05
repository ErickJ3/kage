# Kage Performance Analysis & Optimization Report

## Current Performance (vs Hono & Oak)

| Scenario         | Kage    | Hono   | Oak    | Kage vs Hono |
| ---------------- | ------- | ------ | ------ | ------------ |
| Simple route     | 97,583  | 87,428 | 48,135 | **+11.6%**   |
| Parameterized    | 98,433  | 86,335 | 47,709 | **+14.0%**   |
| JSON parsing     | 45,774  | 41,221 | 26,451 | **+11.0%**   |
| Middleware chain | 109,522 | 78,552 | 47,238 | **+39.4%**   |

### Latency Analysis

| Scenario         | Kage p50 | Kage p99 | Hono p50 | Hono p99 |
| ---------------- | -------- | -------- | -------- | -------- |
| Simple route     | 0.99ms   | 2.69ms   | 1.10ms   | 1.86ms   |
| Parameterized    | 1.01ms   | 2.02ms   | 1.08ms   | 1.78ms   |
| JSON parsing     | 2.22ms   | 3.25ms   | 2.40ms   | 3.75ms   |
| Middleware chain | 0.82ms   | 1.37ms   | 1.29ms   | 2.51ms   |

**Observation**: Kage tem throughput superior, mas p99 latency maior em alguns cenários (Simple Route: 2.69ms vs 1.86ms). Isso indica outliers esporádicos.

---

## Análise de Gargalos Potenciais (p99 Latency)

### 1. Garbage Collection Pressure

**Problema**: Alocação de objetos durante request handling pode causar GC pauses.

**Fontes identificadas**:

- `Object.create(null)` no router para params (linha 116 em `router.ts`)
- Criação de novos `Response` objects em `toResponse()` e `Context.json()`
- `JSON.stringify()` cria strings temporárias

**Impacto**: GC pauses podem causar spikes de latência p99.

**Otimizações possíveis**:

```typescript
// 1. Usar Response caching para responses comuns
const cachedOkResponse = new Response(null, { status: 200 });

// 2. Pool de params objects
const paramsPool: Record<string, string>[] = [];

// 3. Pre-stringify para responses estáticas
const HELLO_RESPONSE = new Response('{"message":"Hello"}', {
  headers: JSON_HEADERS,
});
```

### 2. Context Pool Contention

**Problema**: `ContextPool` usa um array simples com `pop()`/`push()`. Em alta concorrência, pode haver contenção.

**Código atual** (`pool.ts`):

```typescript
acquire(): Context {
  const ctx = this.pool.pop();  // Single-threaded, mas...
  // ...
}
```

**Otimizações possíveis**:

- Pre-allocate contexts no startup
- Aumentar `maxSize` default (atualmente 100)
- Usar typed arrays para melhor cache locality

### 3. URL Parsing Duplicado

**Problema**: O pathname é parseado tanto em `handleRequest()` quanto potencialmente em `Context.reset()`.

**Código atual** (`kage.ts:458-477`):

```typescript
// Parsing manual do pathname
const protocolEnd = urlStr.indexOf("://");
// ... parsing complexo ...
```

**Otimização**: O código já faz lazy URL parsing, o que é bom. Mas podemos otimizar ainda mais:

```typescript
// Cache o pathname extraído no Request se possível
// Deno.serve pode fornecer o path diretamente em versões futuras
```

### 4. Response Creation Overhead

**Problema**: Cada request cria um novo `Response` object.

**Código atual** (`kage.ts:581-613`):

```typescript
private toResponse(result: unknown): Response {
  // Multiple instanceof checks
  if (result instanceof Response) return result;
  if (result == null) return NO_CONTENT_RESPONSE.clone();
  // ...
  return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
}
```

**Otimizações possíveis**:

```typescript
// 1. Evitar clone() quando possível
// 2. Response pooling para responses comuns
// 3. Headers pre-computed (já feito com JSON_HEADERS)
```

### 5. Middleware Async Overhead

**Problema**: Cada middleware call usa `async/await`, mesmo quando não necessário.

**Código atual** (`kage.ts:539-554`):

```typescript
private async executeSingleMiddleware(): Promise<Response> {
  const response = await this.middleware[0](ctx, async () => {
    const result = await handler(ctx);  // await mesmo se sync
    return this.toResponse(result);
  });
}
```

**Otimização**: Detectar se handler é sync e evitar await:

```typescript
private executeSingleMiddleware(): Response | Promise<Response> {
  const result = handler(ctx);
  if (result instanceof Promise) {
    return result.then(r => this.toResponse(r));
  }
  return this.toResponse(result);
}
```

---

## Otimizações Específicas para Deno

### 1. Deno.serve() Optimizations

Deno.serve já é altamente otimizado. Algumas dicas:

```typescript
// Usar handler direto sem wrapping extra
Deno.serve({ port: 8000 }, (req) => {
  // Handler direto, sem this.fetch wrapper
});
```

### 2. V8 JIT Optimization

**Hidden Classes**: Manter shapes consistentes nos objetos.

```typescript
// Bom: shape consistente
const params = { id: "", name: "" }; // Sempre mesmas keys

// Ruim: shapes dinâmicos
const params = Object.create(null); // Hidden class diferente
params[dynamicKey] = value; // Deopt
```

**Monomorphic Functions**: Evitar polimorfismo em hot paths.

```typescript
// Atual (polimórfico):
private toResponse(result: unknown): Response

// Melhor (funções específicas):
private jsonResponse(data: object): Response
private textResponse(text: string): Response
```

### 3. ArrayBuffer/TypedArray para Binary Data

Deno tem excelente suporte para zero-copy operations:

```typescript
// Use Uint8Array diretamente quando possível
// Evite conversões string <-> binary
```

### 4. Deno KV para Caching (Futuro)

Para cenários com dados estáticos ou semi-estáticos:

```typescript
// Deno KV tem latência muito baixa
const kv = await Deno.openKv();
const cached = await kv.get(["responses", path]);
```

### 5. Web Workers para CPU-Intensive Tasks

Para rotas que fazem computação pesada:

```typescript
// Offload para worker, não bloqueia event loop
const worker = new Worker(new URL("./worker.ts", import.meta.url));
```

---

## Plano de Otimização Priorizado

### Fase 1: Quick Wins (Baixo esforço, alto impacto)

1. **Sync handler detection**: Evitar await em handlers síncronos
2. **Response reuse**: Não clonar NOT_FOUND_RESPONSE, reusar diretamente
3. **Pre-allocate contexts**: Iniciar pool com N contextos pré-alocados

### Fase 2: Medium Effort

4. **Params object pooling**: Pool de objetos params para rotas parametrizadas
5. **Monomorphic toResponse**: Funções específicas por tipo de response
6. **Hidden class optimization**: Shapes consistentes em objetos hot

### Fase 3: Advanced (Workers/Async)

7. **Worker pool para CPU tasks**: Rotas pesadas em workers separados
8. **Response streaming**: Streaming para payloads grandes
9. **HTTP/2 multiplexing**: Otimizações específicas HTTP/2

---

## Benchmarks Adicionais Recomendados

1. **Memory profiling**: `deno run --v8-flags=--expose-gc` para medir GC
2. **Flame graphs**: `deno run --inspect` + Chrome DevTools
3. **Latency histograms**: Capturar distribuição completa de latências
4. **Concurrent connections**: Testar com 1000+ connections
5. **Payload sizes**: Testar com payloads de 1KB, 10KB, 100KB

---

## Conclusão

Kage já supera Hono em throughput (11-40% mais rápido). Os principais pontos de melhoria são:

1. **p99 latency**: Reduzir GC pressure e evitar alocações em hot paths
2. **Async overhead**: Detectar handlers síncronos e evitar await
3. **Object pooling**: Expandir pooling para mais objetos além de Context

O foco deve ser manter o throughput alto enquanto reduz a variância de latência (p99 mais próximo do p50).
