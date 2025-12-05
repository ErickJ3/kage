/**
 * Built-in middleware exports.
 */

export { errorHandler } from "~/middleware/builtin/error-handler.ts";
export { logger } from "~/middleware/builtin/logger.ts";
export { cors, type CorsOptions } from "~/middleware/builtin/cors.ts";
export {
  compression,
  type CompressionOptions,
} from "~/middleware/builtin/compression.ts";
