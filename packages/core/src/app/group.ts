import type { Handler, HttpMethod } from "~/router/mod.ts";
import type { Context } from "~/context/context.ts";
import type {
  ContextState,
  DeriveFn,
  OnAfterHandleHook,
  OnBeforeHandleHook,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
} from "~/app/types.ts";
import type { PathParams } from "~/routing/types.ts";
import type { Kage, KageHandler } from "~/app/kage.ts";
import { createPluginWrapper, normalizePath } from "~/app/helpers.ts";

// deno-lint-ignore ban-types
type Base = {};

export class KageGroup<
  TDecorators extends Record<string, unknown> = Base,
  TState extends Record<string, unknown> = Base,
  TDerived extends Record<string, unknown> = Base,
> {
  private routes: Array<{
    method: HttpMethod;
    path: string;
    handler: Handler;
  }> = [];

  private localDeriveFns: Array<DeriveFn<Record<string, unknown>>> = [];
  private localDecorators: Record<string, unknown> = {};
  private localState: Record<string, unknown> = {};
  private localBeforeHandleHooks: Array<OnBeforeHandleHook<unknown>> = [];
  private localAfterHandleHooks: Array<OnAfterHandleHook<unknown>> = [];
  private localOnErrorHooks: OnErrorHook[] = [];

  constructor(
    private parent: Kage<TDecorators, TState, TDerived>,
    private prefix: string,
    private inheritedState: ContextState<TDecorators, TState>,
  ) {}

  decorate<K extends string, V>(
    key: K,
    value: V,
  ): KageGroup<TDecorators & { [P in K]: V }, TState, TDerived> {
    this.localDecorators[key] = value;
    return this as unknown as KageGroup<
      TDecorators & { [P in K]: V },
      TState,
      TDerived
    >;
  }

  state<K extends string, V>(
    key: K,
    initialValue: V,
  ): KageGroup<TDecorators, TState & { [P in K]: V }, TDerived> {
    this.localState[key] = initialValue;
    return this as unknown as KageGroup<
      TDecorators,
      TState & { [P in K]: V },
      TDerived
    >;
  }

  derive<TNew extends Record<string, unknown>>(
    fn: DeriveFn<TNew>,
  ): KageGroup<TDecorators, TState, TDerived & TNew> {
    this.localDeriveFns.push(fn as DeriveFn<Record<string, unknown>>);
    return this as unknown as KageGroup<TDecorators, TState, TDerived & TNew>;
  }

  onRequest(hook: OnRequestHook): this {
    this.localBeforeHandleHooks.unshift(
      ((ctx: Context) => {
        const reqCtx = {
          set: <T>(key: string, value: T) => {
            ctx.state[key] = value;
          },
          get: <T = unknown>(key: string) => ctx.state[key] as T | undefined,
          has: (key: string) => key in ctx.state,
        };
        return hook(ctx.request, reqCtx);
      }) as OnBeforeHandleHook<unknown>,
    );
    return this;
  }

  onResponse(hook: OnResponseHook): this {
    this.localAfterHandleHooks.push(
      ((ctx: Context, response: Response) => {
        const reqCtx = {
          set: <T>(key: string, value: T) => {
            ctx.state[key] = value;
          },
          get: <T = unknown>(key: string) => ctx.state[key] as T | undefined,
          has: (key: string) => key in ctx.state,
        };
        return hook(response, ctx.request, reqCtx);
      }) as unknown as OnAfterHandleHook<unknown>,
    );
    return this;
  }

  onError(hook: OnErrorHook): this {
    this.localOnErrorHooks.push(hook);
    return this;
  }

  onBeforeHandle(
    hook: OnBeforeHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.localBeforeHandleHooks.push(hook as OnBeforeHandleHook<unknown>);
    return this;
  }

  onAfterHandle(
    hook: OnAfterHandleHook<
      Context & TDecorators & { store: TState } & TDerived
    >,
  ): this {
    this.localAfterHandleHooks.push(hook as OnAfterHandleHook<unknown>);
    return this;
  }

  use<
    TOutDecorators extends Record<string, unknown>,
    TOutState extends Record<string, unknown>,
    TOutDerived extends Record<string, unknown>,
  >(
    plugin: (
      group: KageGroup<TDecorators, TState, TDerived>,
    ) => KageGroup<TOutDecorators, TOutState, TOutDerived>,
  ): KageGroup<TOutDecorators, TOutState, TOutDerived> {
    return plugin(this);
  }

  group<
    TGroupDecorators extends Record<string, unknown>,
    TGroupState extends Record<string, unknown>,
    TGroupDerived extends Record<string, unknown>,
  >(
    prefix: string,
    configure: (
      group: KageGroup<TDecorators, TState, TDerived>,
    ) => KageGroup<
      TDecorators & TGroupDecorators,
      TState & TGroupState,
      TDerived & TGroupDerived
    >,
  ): this {
    const mergedState: ContextState<TDecorators, TState> = {
      decorators: {
        ...this.inheritedState.decorators,
        ...this.localDecorators,
      } as TDecorators,
      state: {
        ...this.inheritedState.state,
        ...this.localState,
      } as TState,
      deriveFns: [
        ...this.inheritedState.deriveFns,
        ...this.localDeriveFns,
      ],
      onRequestHooks: [],
      onResponseHooks: [],
      onErrorHooks: [],
      onBeforeHandleHooks: [
        ...this.inheritedState.onBeforeHandleHooks,
        ...this.localBeforeHandleHooks,
      ],
      onAfterHandleHooks: [
        ...this.inheritedState.onAfterHandleHooks,
        ...this.localAfterHandleHooks,
      ],
    };

    const nestedGroup = new KageGroup<TDecorators, TState, TDerived>(
      this.parent,
      normalizePath(this.prefix, prefix),
      mergedState,
    );

    nestedGroup.localOnErrorHooks = [...this.localOnErrorHooks];

    const configuredGroup = configure(nestedGroup);

    for (const route of configuredGroup._getRoutes()) {
      this.routes.push(route);
    }

    return this;
  }

  _getRoutes(): Array<{ method: HttpMethod; path: string; handler: Handler }> {
    return this.routes;
  }

  get<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("GET", path, handler as Handler);
    return this;
  }

  post<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("POST", path, handler as Handler);
    return this;
  }

  put<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("PUT", path, handler as Handler);
    return this;
  }

  patch<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("PATCH", path, handler as Handler);
    return this;
  }

  delete<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("DELETE", path, handler as Handler);
    return this;
  }

  head<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("HEAD", path, handler as Handler);
    return this;
  }

  options<TPath extends string>(
    path: TPath,
    handler: KageHandler<TDecorators, TState, TDerived, PathParams<TPath>>,
  ): this {
    this.addRoute("OPTIONS", path, handler as Handler);
    return this;
  }

  private addRoute(method: HttpMethod, path: string, handler: Handler): void {
    const fullPath = normalizePath(this.prefix, path);
    const wrappedHandler = this.wrapWithGroupPlugins(handler);
    this.routes.push({ method, path: fullPath, handler: wrappedHandler });
  }

  private wrapWithGroupPlugins(handler: Handler): Handler {
    const allDeriveFns = [
      ...this.inheritedState.deriveFns,
      ...this.localDeriveFns,
    ];
    const allDecorators = {
      ...this.inheritedState.decorators,
      ...this.localDecorators,
    };
    const state = Object.assign(
      Object.create(this.inheritedState.state),
      this.localState,
    ) as TState;
    const allBeforeHooks = [
      ...this.inheritedState.onBeforeHandleHooks,
      ...this.localBeforeHandleHooks,
    ];
    const allAfterHooks = [
      ...this.inheritedState.onAfterHandleHooks,
      ...this.localAfterHandleHooks,
    ];

    return createPluginWrapper(handler, {
      deriveFns: allDeriveFns,
      decorators: allDecorators,
      decoratorKeys: Object.keys(allDecorators),
      state,
      beforeHooks: allBeforeHooks,
      afterHooks: allAfterHooks,
      onErrorHooks: this.localOnErrorHooks.length > 0
        ? this.localOnErrorHooks
        : undefined,
    });
  }

  applyToParent(): void {
    for (const route of this.routes) {
      this.parent._addRouteInternal(route.method, route.path, route.handler);
    }
  }
}
