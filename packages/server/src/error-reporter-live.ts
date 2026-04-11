import { OtelLoggerProvider } from "@effect/opentelemetry/Logger"
import { ErrorReporter, LogLevel, Context, Tracer } from "effect"

const RuntimeErrorReporter = ErrorReporter.make(
  ({ attributes, error, fiber, severity, timestamp }) => {
    const span = Context.getOrUndefined(fiber.context, Tracer.ParentSpan)
    const loggerProvider = Context.getOrUndefined(fiber.context, OtelLoggerProvider)

    // Mirror the current span context into emitted error events so OTEL backends can correlate them.
    const payload = {
      ...attributes,
      errorMessage: error.message,
      errorName: error.name,
      fiberId: fiber.id,
      spanId: span?._tag === "Span" ? span.spanId : undefined,
      timestamp: timestamp.toString(),
      traceId: span?._tag === "Span" ? span.traceId : undefined,
    }

    if (loggerProvider !== undefined) {
      loggerProvider.getLogger("gororobas-runtime-errors").emit({
        attributes: payload,
        body: error.stack ?? error.message,
        severityNumber: LogLevel.getOrdinal(severity),
        severityText: severity,
      })
      return
    }

    console.error(`[${severity}]`, payload, error.stack ?? error.message)
  },
)

export const ErrorReporterLive = ErrorReporter.layer([RuntimeErrorReporter], {
  mergeWithExisting: true,
})
