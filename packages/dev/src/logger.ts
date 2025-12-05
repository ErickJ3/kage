/**
 * Debug logging system for Kage development.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(prefix: string): Logger;
  setLevel(level: LogLevel): void;
}

export function createLogger(options: {
  level?: LogLevel;
  prefix?: string;
  timestamps?: boolean;
} = {}): Logger {
  let currentLevel = options.level ?? "info";
  const prefix = options.prefix ?? "kage";
  const showTimestamps = options.timestamps ?? true;

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  };

  const formatTimestamp = (): string => {
    if (!showTimestamps) return "";
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false });
    const ms = now.getMilliseconds().toString().padStart(3, "0");
    return `${colors.gray}${time}.${ms}${colors.reset} `;
  };

  const formatPrefix = (color: string): string => {
    return `${color}${colors.bold}[${prefix}]${colors.reset}`;
  };

  const formatLevel = (level: string, color: string): string => {
    return `${color}${level.toUpperCase().padEnd(5)}${colors.reset}`;
  };

  const log = (
    level: LogLevel,
    color: string,
    message: string,
    args: unknown[],
  ): void => {
    if (!shouldLog(level)) return;

    const timestamp = formatTimestamp();
    const prefixStr = formatPrefix(color);
    const levelStr = formatLevel(level, color);

    const output = `${timestamp}${prefixStr} ${levelStr} ${message}`;

    if (level === "error") {
      console.error(output, ...args);
    } else if (level === "warn") {
      console.warn(output, ...args);
    } else {
      console.log(output, ...args);
    }
  };

  const logger: Logger = {
    debug(message: string, ...args: unknown[]) {
      log("debug", colors.gray, message, args);
    },

    info(message: string, ...args: unknown[]) {
      log("info", colors.cyan, message, args);
    },

    warn(message: string, ...args: unknown[]) {
      log("warn", colors.yellow, message, args);
    },

    error(message: string, ...args: unknown[]) {
      log("error", colors.red, message, args);
    },

    child(childPrefix: string): Logger {
      return createLogger({
        level: currentLevel,
        prefix: `${prefix}:${childPrefix}`,
        timestamps: showTimestamps,
      });
    },

    setLevel(level: LogLevel) {
      currentLevel = level;
    },
  };

  return logger;
}

export const defaultLogger = createLogger();
