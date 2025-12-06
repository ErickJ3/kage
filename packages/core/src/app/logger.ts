import type { Logger, LoggerConfig, LogLevel } from "~/app/types.ts";

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

const encoder = new TextEncoder();

const write = (stream: typeof Deno.stdout, data: string): void => {
  stream.writeSync(encoder.encode(data));
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
  gray: "\x1b[90m",
};

const levelColors: Record<LogLevel, string> = {
  trace: colors.gray,
  debug: colors.blue,
  info: colors.green,
  warn: colors.yellow,
  error: colors.red,
  fatal: colors.magenta,
  silent: "",
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

interface LogEntry {
  level: LogLevel;
  time: number;
  msg: string;
  [key: string]: unknown;
}

function formatPretty(
  entry: LogEntry,
  name: string | undefined,
  showTimestamp: boolean,
): string {
  const { level, time, msg, ...rest } = entry;
  const color = levelColors[level];
  const levelStr = level.toUpperCase().padEnd(5);

  let line = "";

  if (showTimestamp) {
    line += `${colors.gray}${formatTime(time)}${colors.reset} `;
  }

  if (name) {
    line += `${colors.cyan}${colors.bold}[${name}]${colors.reset} `;
  }

  line += `${color}${levelStr}${colors.reset} ${msg}`;

  const keys = Object.keys(rest);
  if (keys.length > 0) {
    const extra = keys
      .map((k) => {
        const v = rest[k];
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `${colors.dim}${k}=${colors.reset}${val}`;
      })
      .join(" ");
    line += ` ${extra}`;
  }

  return line + "\n";
}

function formatJson(entry: LogEntry, name: string | undefined): string {
  const obj: Record<string, unknown> = { ...entry };
  if (name) obj.name = name;
  return JSON.stringify(obj) + "\n";
}

export function createLogger(options: LoggerConfig = {}): Logger {
  const currentLevel = options.level ?? "info";
  const name = options.name;
  const showTimestamp = options.timestamp ?? true;
  const jsonMode = options.json ?? false;
  const bindings: Record<string, unknown> = {};

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  };

  const log = (
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>,
  ): void => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      time: Date.now(),
      msg,
      ...bindings,
      ...data,
    };

    const output = jsonMode
      ? formatJson(entry, name)
      : formatPretty(entry, name, showTimestamp);

    const stream = level === "error" || level === "fatal"
      ? Deno.stderr
      : Deno.stdout;

    write(stream, output);
  };

  const logger: Logger = {
    trace(msg: string, data?: Record<string, unknown>) {
      log("trace", msg, data);
    },
    debug(msg: string, data?: Record<string, unknown>) {
      log("debug", msg, data);
    },
    info(msg: string, data?: Record<string, unknown>) {
      log("info", msg, data);
    },
    warn(msg: string, data?: Record<string, unknown>) {
      log("warn", msg, data);
    },
    error(msg: string, data?: Record<string, unknown>) {
      log("error", msg, data);
    },
    fatal(msg: string, data?: Record<string, unknown>) {
      log("fatal", msg, data);
    },
    child(childBindings: Record<string, unknown>): Logger {
      const childName = childBindings.name
        ? name ? `${name}:${childBindings.name}` : String(childBindings.name)
        : name;

      const { name: _, ...rest } = childBindings;

      const child = createLogger({
        level: currentLevel,
        name: childName,
        timestamp: showTimestamp,
        json: jsonMode,
      });

      const childLogger = child as unknown as {
        bindings: Record<string, unknown>;
      };
      if (childLogger.bindings) {
        Object.assign(childLogger.bindings, bindings, rest);
      }

      return child;
    },
  };

  return logger;
}

export function isLogger(value: unknown): value is Logger {
  return (
    typeof value === "object" &&
    value !== null &&
    "info" in value &&
    "error" in value &&
    "child" in value &&
    typeof (value as Logger).info === "function" &&
    typeof (value as Logger).error === "function" &&
    typeof (value as Logger).child === "function"
  );
}
