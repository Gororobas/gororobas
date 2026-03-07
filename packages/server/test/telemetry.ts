/**
 * OpenTelemetry instrumentation for test infrastructure.
 *
 * Provides tracing with console or OTLP export for profiling test execution.
 *
 * Configuration via environment:
 * - ENABLE_TELEMETRY=true to enable (default: false)
 * - TELEMETRY_EXPORT=console|otlp (default: console)
 */
import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base/build/src/export/ConsoleSpanExporter.js"
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base/build/src/export/SimpleSpanProcessor.js"
import { Effect, Layer } from "effect"

/**
 * Telemetry export configuration.
 */
type TelemetryExport = "console" | "otlp"

/**
 * Telemetry configuration.
 */
interface TelemetryConfig {
  readonly enabled: boolean
  readonly export: TelemetryExport
  readonly serviceName: string
}

/**
 * Read ENABLE_TELEMETRY environment variable.
 *
 * Returns false if not set or invalid.
 * Logs warning for invalid values.
 */
const readEnabledConfig = (): boolean => {
  const value = process.env.ENABLE_TELEMETRY
  if (value === undefined) {
    return false
  }
  if (value === "true" || value === "1") {
    return true
  }
  if (value === "false" || value === "0") {
    return false
  }
  console.warn(`Invalid ENABLE_TELEMETRY: ${value}, using default: false`)
  return false
}

/**
 * Read TELEMETRY_EXPORT environment variable.
 *
 * Returns "console" if not set or invalid.
 * Logs warning for invalid values.
 */
const readExportConfig = (): TelemetryExport => {
  const value = process.env.TELEMETRY_EXPORT
  if (value === "console" || value === "otlp") {
    return value
  }
  if (value !== undefined) {
    console.warn(`Invalid TELEMETRY_EXPORT: ${value}, using default: console`)
  }
  return "console"
}

/**
 * Read telemetry configuration from environment variables.
 */
const readConfig = (): TelemetryConfig => ({
  enabled: readEnabledConfig(),
  export: readExportConfig(),
  serviceName: "gororobas-tests",
})

/**
 * No-op span exporter that does nothing.
 *
 * Used as fallback when exporter creation fails.
 */
class NoOpSpanExporter {
  export(_spans: unknown, resultCallback: (result: { code: number }) => void): void {
    // No-op: immediately signal success
    resultCallback({ code: 0 })
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

/**
 * Create span exporter based on configuration.
 *
 * Returns ConsoleSpanExporter for console mode, OTLPTraceExporter for otlp mode.
 * Falls back to NoOpSpanExporter if creation fails.
 */
const createSpanExporter = (exportMode: TelemetryExport) => {
  try {
    if (exportMode === "console") {
      return new ConsoleSpanExporter()
    }

    // OTLP exporter with default configuration
    // Defaults to http://localhost:4318/v1/traces
    return new OTLPTraceExporter()
  } catch (error: unknown) {
    // Log error to stderr but don't fail - use no-op exporter instead
    console.error("Failed to create telemetry exporter:", error)
    console.error("Falling back to no-op exporter - telemetry will be disabled")
    return new NoOpSpanExporter()
  }
}

/**
 * OpenTelemetry layer for test instrumentation.
 *
 * Provides tracing with console or OTLP export based on configuration.
 * All errors are caught and logged to prevent telemetry failures from affecting tests.
 */
export const TelemetryLayer = Layer.unwrap(
  Effect.try({
    try: () => {
      const config = readConfig()

      // Create span processor based on export configuration
      const exporter = createSpanExporter(config.export)
      const spanProcessor = new SimpleSpanProcessor(exporter)

      return NodeSdk.layer(() => ({
        resource: {
          serviceName: config.serviceName,
        },
        spanProcessor,
      }))
    },
    catch: (error: unknown) => {
      // Log error to stderr but don't fail - return empty layer instead
      console.error("Failed to create telemetry layer:", error)
      console.error("Telemetry will be disabled for this test run")
      return Layer.empty
    },
  }).pipe(
    Effect.catch((error: unknown) => {
      // Catch any Effect errors and return empty layer
      console.error("Failed to create telemetry layer:", error)
      console.error("Telemetry will be disabled for this test run")
      return Effect.succeed(Layer.empty)
    }),
  ),
)

/**
 * Get the appropriate telemetry layer based on environment.
 *
 * Returns TelemetryLayer if ENABLE_TELEMETRY=true, otherwise Layer.empty.
 */
export const getTelemetryLayer = () => {
  const config = readConfig()
  return config.enabled ? TelemetryLayer : Layer.empty
}

/**
 * Wrap an effect with a custom test span.
 *
 * Usage:
 * ```typescript
 * yield* withTestSpan("setup-user-data",
 *   Effect.gen(function*() {
 *     // ... setup code
 *   })
 * )
 * ```
 *
 * If span creation fails, the effect executes without instrumentation.
 * Telemetry errors never cause the wrapped effect to fail.
 */
export const withTestSpan = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
  attributes?: Record<string, unknown>,
): Effect.Effect<A, E, R> => {
  try {
    // If no attributes, just use Effect.withSpan directly
    if (!attributes || Object.keys(attributes).length === 0) {
      return Effect.withSpan(effect, name) as Effect.Effect<A, E, R>
    }

    // Add attributes to the span
    return Effect.withSpan(effect, name, {
      attributes,
    }) as Effect.Effect<A, E, R>
  } catch (error: unknown) {
    // If span creation fails, log error and execute effect without instrumentation
    console.error("Failed to create test span:", error)
    return effect
  }
}
