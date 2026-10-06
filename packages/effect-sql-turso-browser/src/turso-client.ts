import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { SqlError, classifySqliteError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"
import * as Struct from "effect/Struct"

/**
 * Turso adapter for Effect SQL, backed by `@tursodatabase/database-wasm`.
 *
 * This module provides a {@link TursoClient} and the generic SQL client service
 * for the in-process Rust Turso engine. It uses Effect SQL's SQLite compiler,
 * supports a managed engine connection or a caller-owned live connection,
 * classifies Turso and SQLite failures as `SqlError`s, and provides transaction
 * support with savepoints. Streaming queries are not implemented by this driver.
 *
 * @since 4.0.0
 */
import type { BrowserDatabase, DatabaseOptions } from "./turso-browser-database.js"
import { open } from "./turso-browser-database.js"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

const classifyError = ({
  cause,
  message,
  operation,
}: {
  cause: unknown
  message: string
  operation: string
}) => classifySqliteError(cause, { message, operation })

/**
 * Runtime type identifier used to mark `TursoClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@gororobas/effect-sql-turso-browser/TursoClient"

/**
 * Type-level identifier used to mark `TursoClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@gororobas/effect-sql-turso-browser/TursoClient"

/**
 * Turso-backed SQL client service, extending `SqlClient` with its runtime type marker and client configuration.
 *
 * @category models
 * @since 4.0.0
 */
export interface TursoClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: TursoClientConfig
  readonly sdk: BrowserDatabase
}

/**
 * Service tag for the Turso client service.
 *
 * **When to use**
 *
 * Use to access or provide a Turso client through the Effect context.
 *
 * @category services
 * @since 4.0.0
 */
export const TursoClient = Context.Service<TursoClient>(
  "@gororobas/effect-sql-turso-browser/TursoClient",
)

/**
 * Configuration for a Turso client, either by supplying connection options or an existing live connection.
 *
 * @category models
 * @since 4.0.0
 */
export type TursoClientConfig = TursoClientConfig.Full | TursoClientConfig.Live

/**
 * Namespace containing the configuration variants for `TursoClient`.
 *
 * @since 4.0.0
 */
export declare namespace TursoClientConfig {
  /**
   * Shared Turso client options for span attributes and query/result name transformations.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Base {
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly transformResultNames?: ((str: string) => string) | undefined
    readonly transformQueryNames?: ((str: string) => string) | undefined
  }

  /**
   * Connection-based Turso configuration used to open a managed engine connection.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Full extends Base, DatabaseOptions {
    /**
     * The database path.
     *
     * **Details**
     *
     * The browser engine opens a database in OPFS by path, or an in-memory
     * database with `":memory:"`. Pass a path rather than a remote URL.
     */
    readonly url: string | URL
  }

  /**
   * Configuration that uses an existing Turso connection. The supplied `liveClient` is caller-owned and is not closed by the Effect client.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Live extends Base {
    readonly liveClient: BrowserDatabase
  }
}

/**
 * Creates a scoped Turso SQL client with transaction support. When given connection options it opens and closes the engine connection; when given `liveClient`, the caller retains ownership.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: TursoClientConfig,
): Effect.Effect<TursoClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function* () {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : undefined

    const spanAttributes: Array<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "sqlite"],
    ]

    const db =
      "liveClient" in options
        ? options.liveClient
        : yield* Effect.gen(function* () {
            const databaseOptions = Struct.omit(options, [
              "url",
              "spanAttributes",
              "transformQueryNames",
              "transformResultNames",
            ])

            return yield* open(options.url.toString(), databaseOptions).pipe(
              Effect.mapError(
                (cause) =>
                  new SqlError({
                    reason: classifyError({
                      cause: cause,
                      message: "Failed to open database",
                      operation: "openDatabase",
                    }),
                  }),
              ),
            )
          })

    const runRaw = ({
      sql,
      params,
      raw = false,
      values = false,
    }: {
      sql: string
      params: ReadonlyArray<unknown>
      raw?: boolean | undefined
      values?: boolean | undefined
    }) =>
      Effect.withFiber((fiber) =>
        db
          .execute({
            sql: sql,
            params: params,
            raw: raw,
            safeIntegers: Context.get(fiber.context, Client.SafeIntegers),
            values: values,
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new SqlError({
                  reason: classifyError({
                    cause: cause,
                    message: "Failed to execute statement",
                    operation: "execute",
                  }),
                }),
            ),
          ),
      )

    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- The database worker returns unknown statement results across the message boundary.
    const decodeRows = Schema.decodeUnknownEffect(
      Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
    )
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- The database worker returns unknown statement results across the message boundary.
    const decodeValues = Schema.decodeUnknownEffect(Schema.Array(Schema.Array(Schema.Unknown)))

    const invalidResult = (cause: unknown) =>
      new SqlError({
        reason: classifyError({
          cause: cause,
          message: "Invalid statement result",
          operation: "execute",
        }),
      })

    const run = (sql: string, params: ReadonlyArray<unknown>) =>
      runRaw({ sql: sql, params: params }).pipe(
        Effect.flatMap((result) => decodeRows(result).pipe(Effect.mapError(invalidResult))),
      )
    const runValues = (sql: string, params: ReadonlyArray<unknown>) =>
      runRaw({ sql: sql, params: params, raw: false, values: true }).pipe(
        Effect.flatMap((result) => decodeValues(result).pipe(Effect.mapError(invalidResult))),
      )

    const connection = identity<Connection>({
      // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Effect SQL's Connection interface defines this positional signature.
      execute(sql, params, transformRows) {
        return transformRows ? Effect.map(run(sql, params), transformRows) : run(sql, params)
      },
      executeRaw(sql, params) {
        return runRaw({ sql: sql, params: params, raw: true })
      },
      executeValues(sql, params) {
        return runValues(sql, params)
      },
      executeValuesUnprepared(sql, params) {
        return runValues(sql, params)
      },
      // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Effect SQL's Connection interface defines this positional signature.
      executeUnprepared(sql, params, transformRows) {
        return transformRows ? Effect.map(run(sql, params), transformRows) : run(sql, params)
      },
      executeStream(_sql, _params) {
        return Stream.die("executeStream not implemented")
      },
    })

    const { acquirer, transactionAcquirer, onCommitFailure } = Client.makeSqliteAcquirers({
      connection: Effect.succeed(connection),
      semaphore: yield* Semaphore.make(1),
    })

    return Object.assign(
      yield* Client.make({
        acquirer,
        compiler,
        transactionAcquirer,
        onCommitFailure,
        releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
        spanAttributes,
        transformRows,
      }),
      {
        [TypeId]: TypeId,
        config: options,
        sdk: db,
      },
    )
  })

/**
 * Creates a layer from a `Config`-wrapped Turso client configuration, providing both `TursoClient` and `SqlClient`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  config: Config.Wrap<TursoClientConfig>,
): Layer.Layer<TursoClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effectContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(TursoClient, client).pipe(Context.add(Client.SqlClient, client)),
      ),
    ),
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Creates a layer from a concrete Turso client configuration, providing both `TursoClient` and `SqlClient`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: TursoClientConfig,
): Layer.Layer<TursoClient | Client.SqlClient, SqlError> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(TursoClient, client).pipe(Context.add(Client.SqlClient, client)),
    ),
  ).pipe(Layer.provide(Reactivity.layer))
