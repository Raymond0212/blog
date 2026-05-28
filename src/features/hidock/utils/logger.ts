type LogLevel = "error" | "warn" | "info" | "debug"

const ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const isDev = typeof import.meta !== "undefined" && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
const configured =
  typeof localStorage !== "undefined" && typeof localStorage.getItem === "function"
    ? (localStorage.getItem("hidock.log.level") as LogLevel | null)
    : null
const threshold: LogLevel = configured ?? (isDev ? "debug" : "info")

function shouldLog(level: LogLevel): boolean {
  return ORDER[level] <= ORDER[threshold]
}

function write(level: LogLevel, scope: string, message: string, meta?: unknown) {
  if (!shouldLog(level)) return
  const stamp = new Date().toISOString()
  const prefix = `[hidock][${level}][${scope}] ${stamp} ${message}`

  if (level === "error") {
    console.error(prefix, meta ?? "")
  } else if (level === "warn") {
    console.warn(prefix, meta ?? "")
  } else if (level === "info") {
    console.info(prefix, meta ?? "")
  } else {
    console.debug(prefix, meta ?? "")
  }
}

export const logger = {
  error: (scope: string, message: string, meta?: unknown) => write("error", scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => write("warn", scope, message, meta),
  info: (scope: string, message: string, meta?: unknown) => write("info", scope, message, meta),
  debug: (scope: string, message: string, meta?: unknown) => write("debug", scope, message, meta),
}
