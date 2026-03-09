import { Cause, Effect, ErrorReporter, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { SqlError } from "effect/unstable/sql"

type InfrastructureError = Schema.SchemaError | SqlError.SqlError

interface ApiOperation {
  readonly endpoint: string
  readonly group: string
}

const internalServerErrorResponse = HttpServerResponse.empty({ status: 500 })

const isSqlError = (error: unknown): error is SqlError.SqlError =>
  typeof error === "object" && error !== null && "_tag" in error && error._tag === "SqlError"

const isInfrastructureError = (error: unknown): error is InfrastructureError =>
  Schema.isSchemaError(error) || isSqlError(error)

const annotateOperationSpan = (operation: ApiOperation, attributes: Record<string, unknown>) =>
  Effect.annotateCurrentSpan({
    "gororobas.http.endpoint": operation.endpoint,
    "gororobas.http.group": operation.group,
    ...attributes,
  })

const reportInfrastructureError = (error: InfrastructureError, operation: ApiOperation) =>
  Effect.gen(function* () {
    yield* annotateOperationSpan(operation, {
      "gororobas.error.tag": error._tag,
      "gororobas.http.status_code": 500,
      "gororobas.schema.drift_suspected": error._tag === "SchemaError",
      "gororobas.sql.retry_exhausted": error._tag === "SqlError",
    })

    yield* ErrorReporter.report(Cause.fail(error))
  })

const protectApiOperation = <A, E, R>(
  operation: ApiOperation,
  effect: Effect.Effect<A, E | InfrastructureError, R>,
): Effect.Effect<A | HttpServerResponse.HttpServerResponse, E, R> =>
  effect.pipe(
    Effect.tapError((error) =>
      isSqlError(error)
        ? annotateOperationSpan(operation, { "gororobas.sql.retrying": true })
        : Effect.void,
    ),
    // Return a raw 500 response so the endpoint schema can stay domain-specific.
    Effect.catchIf(isInfrastructureError, (error) =>
      reportInfrastructureError(error, operation).pipe(Effect.as(internalServerErrorResponse)),
    ),
  )

/**
 * Boundary for API handlers that should hide `SqlError` / `SchemaError` from the public contract.
 */
export const withApiInfrastructureErrors =
  (operation: ApiOperation) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A | HttpServerResponse.HttpServerResponse, Exclude<E, InfrastructureError>, R> =>
    protectApiOperation(
      operation,
      effect as Effect.Effect<A, Exclude<E, InfrastructureError> | InfrastructureError, R>,
    ) as Effect.Effect<
      A | HttpServerResponse.HttpServerResponse,
      Exclude<E, InfrastructureError>,
      R
    >
