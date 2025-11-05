import { Context, Effect, Layer, LogLevel } from "effect"

// Define a logging service interface
export class LoggerService extends Context.Tag("LoggerService")<
  LoggerService,
  {
    readonly log: (level: LogLevel.LogLevel, message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
    readonly debug: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
    readonly info: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
    readonly warn: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
    readonly error: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
  }
>() {}

// Create a live implementation of the logger service
export const LoggerLive = Layer.succeed(
  LoggerService,
  LoggerService.of({
    log: (level, message, meta = {}) =>
      Effect.sync(() => {
        const timestamp = new Date().toISOString()
        const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ""
        console.log(`[${timestamp}] ${LogLevel.toString().toUpperCase()}: ${message}${metaStr}`)
      }),

    debug: (message, meta = {}) =>
      Effect.sync(() => {
        const timestamp = new Date().toISOString()
        const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ""
        console.debug(`[${timestamp}] DEBUG: ${message}${metaStr}`)
      }),

    info: (message, meta = {}) =>
      Effect.sync(() => {
        const timestamp = new Date().toISOString()
        const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ""
        console.info(`[${timestamp}] INFO: ${message}${metaStr}`)
      }),

    warn: (message, meta = {}) =>
      Effect.sync(() => {
        const timestamp = new Date().toISOString()
        const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ""
        console.warn(`[${timestamp}] WARN: ${message}${metaStr}`)
      }),

    error: (message, meta = {}) =>
      Effect.sync(() => {
        const timestamp = new Date().toISOString()
        const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ""
        console.error(`[${timestamp}] ERROR: ${message}${metaStr}`)
      })
  })
)

// Helper function to create a tagged logger
export const withLogTag = (tag: string) =>
  LoggerService.pipe(
    Effect.flatMap((logger) =>
      Effect.succeed({
        debug: (message: string, meta?: Record<string, unknown>) => logger.debug(`[${tag}] ${message}`, meta),
        info: (message: string, meta?: Record<string, unknown>) => logger.info(`[${tag}] ${message}`, meta),
        warn: (message: string, meta?: Record<string, unknown>) => logger.warn(`[${tag}] ${message}`, meta),
        error: (message: string, meta?: Record<string, unknown>) => logger.error(`[${tag}] ${message}`, meta)
      })
    )
  )
