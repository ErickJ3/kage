/**
 * Object pool for Context instances to reduce GC pressure.
 * Pre-allocates contexts for warm start performance.
 */

import { Context } from "~/context/context.ts";

const DUMMY_REQUEST = new Request("http://localhost/");

export class ContextPool {
  private pool: Context[];
  private maxSize: number;

  constructor(maxSize = 256) {
    this.maxSize = maxSize;
    this.pool = [];
  }

  /**
   * Pre-allocate contexts for warm start.
   * Call this during initialization to avoid allocation during requests.
   */
  preallocate(count: number): void {
    const toCreate = Math.min(count, this.maxSize - this.pool.length);
    for (let i = 0; i < toCreate; i++) {
      this.pool.push(new Context(DUMMY_REQUEST, {}, null, "/"));
    }
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
    ctx.request = DUMMY_REQUEST;
    ctx.params = {};
    ctx.state = {};

    (ctx as any)._url = null;
    (ctx as any)._pathname = "/";

    if (this.pool.length < this.maxSize) {
      this.pool.push(ctx);
    }
  }

  clear(): void {
    this.pool.length = 0;
  }

  size(): number {
    return this.pool.length;
  }
}
