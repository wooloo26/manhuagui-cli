type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as LogLevel;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getLevel()];
}

export const logger = {
  debug: (msg: string) => shouldLog("debug") && console.error(`[DEBUG] ${msg}`),
  info: (msg: string) => shouldLog("info") && console.log(msg),
  warn: (msg: string) => shouldLog("warn") && console.error(`[WARN] ${msg}`),
  error: (msg: string) => shouldLog("error") && console.error(`[ERROR] ${msg}`),
};
