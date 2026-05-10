import { appendFileSync } from "node:fs";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  write?: (line: string) => void;
  filePath?: string;
}

export interface LoggingConfigOptions {
  quiet?: boolean;
  verbose?: boolean;
  env?: NodeJS.ProcessEnv;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const VALID_LEVELS = new Set<LogLevel>([
  "silent",
  "error",
  "warn",
  "info",
  "debug",
]);

let activeLogger: Logger = createLogger({ level: "info" });

export function configureLogger(options: LoggingConfigOptions = {}): void {
  const env = options.env ?? process.env;
  const level = resolveLogLevel({ ...options, env });
  activeLogger = createLogger({
    level,
    ...(env["AI_SKILLS_LOG_FILE"] ? { filePath: env["AI_SKILLS_LOG_FILE"] } : {}),
  });
}

export function logError(message: string, fields?: Record<string, unknown>): void {
  activeLogger.error(message, fields);
}

export function logWarn(message: string, fields?: Record<string, unknown>): void {
  activeLogger.warn(message, fields);
}

export function logInfo(message: string, fields?: Record<string, unknown>): void {
  activeLogger.info(message, fields);
}

export function logDebug(message: string, fields?: Record<string, unknown>): void {
  activeLogger.debug(message, fields);
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const write = buildWriter(options.write, options.filePath);

  function emit(eventLevel: Exclude<LogLevel, "silent">, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[eventLevel]) return;
    const suffix = fields === undefined ? "" : ` ${redact(safeJson(fields))}`;
    write(`ai-skills ${eventLevel}: ${redact(message)}${suffix}`);
  }

  return {
    error: (message, fields) => emit("error", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    info: (message, fields) => emit("info", message, fields),
    debug: (message, fields) => emit("debug", message, fields),
  };
}

export function resolveLogLevel(options: LoggingConfigOptions = {}): LogLevel {
  const envLevel = options.env?.["AI_SKILLS_LOG"]?.trim().toLowerCase();
  if (isLogLevel(envLevel)) return envLevel;
  if (options.quiet) return "silent";
  if (options.verbose) return "debug";
  return "info";
}

export function redact(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1[redacted]@")
    .replace(/\b(Authorization:\s*Bearer\s+)[^\s,}"']+/gi, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(
      /"([^"]*(?:token|secret|password|passwd|pwd|api[_-]?key|credential|dsn)[^"]*)"\s*:\s*"[^"]*"/gi,
      "\"$1\":\"[redacted]\"",
    )
    .replace(
      /\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|pwd|api[_-]?key|credential|dsn)[A-Za-z0-9_-]*)(\s*[:=]\s*)(["']?)[^\s"',}]+(["']?)/gi,
      "$1$2$3[redacted]$4",
    )
    .replace(/(^|[\s"'(=])\/(?:Users|home|private\/var|var\/folders|tmp)\/[^\s"'`)]+/g, "$1[redacted-path]")
    .replace(/\b[A-Za-z]:\\[^\s"'`<>|]+(?:\\[^\s"'`<>|]+)*/g, "[redacted-path]");
}

function buildWriter(customWrite?: (line: string) => void, filePath?: string): (line: string) => void {
  return (line: string) => {
    const output = `${line}\n`;
    if (customWrite) {
      customWrite(line);
    } else {
      process.stderr.write(output);
    }
    if (!filePath) return;
    try {
      appendFileSync(filePath, output, "utf8");
    } catch {
      // Logging must never affect command behavior.
    }
  };
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && VALID_LEVELS.has(value as LogLevel);
}

function safeJson(fields: Record<string, unknown>): string {
  try {
    return JSON.stringify(fields);
  } catch {
    return "{\"fields\":\"[unserializable]\"}";
  }
}
