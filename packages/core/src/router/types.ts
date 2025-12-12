export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

// deno-lint-ignore no-explicit-any
export type Handler<TContext = any> = (
  ctx: TContext,
) => unknown | Promise<unknown>;

export interface Match {
  handler: Handler;
  params: Record<string, string>;
}
