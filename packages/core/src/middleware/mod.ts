/**
 * Middleware module - composition and built-in middleware.
 */

export type { Middleware } from "~/middleware/types.ts";
export { compose } from "~/middleware/compose.ts";

export {
  compression,
  type CompressionOptions,
  cors,
  type CorsOptions,
  errorHandler,
  logger,
} from "~/middleware/builtin/mod.ts";
