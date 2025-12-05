/**
 * Object pool for Context instances to reduce GC pressure.
 */

import { Context } from "~/context/context.ts";

export class ContextPool {
  private pool: Context[] = [];
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  acquire(
    request: Request,
    params: Record<string, string>,
    url: URL | null,
    pathname: string,
  ): Context {
    const ctx = this.pool.pop();
    if (ctx) {
      ctx.reset(request, params, url, pathname);
      return ctx;
    }
    return new Context(request, params, url, pathname);
  }

  release(ctx: Context): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(ctx);
    }
  }

  clear(): void {
    this.pool = [];
  }

  size(): number {
    return this.pool.length;
  }
}
