import { connect } from "@tursodatabase/database"
import { Config, Context, Effect, Layer, Record, Semaphore, Stream, Struct } from "effect"
import type { Scope } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"

type Database = Awaited<ReturnType<typeof connect>>
type PreparedStatement = Awaited<ReturnType<Database["prepare"]>>
type DatabaseOptions = NonNullable<Parameters<typeof connect>[1]>

export const TypeId = "~@gororobas/effect-sql-turso/TursoClient" as const
export type TypeId = typeof TypeId

export interface TursoClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: TursoClientConfig
  readonly sdk: Database
}

export const TursoClient = Context.Service<TursoClient>("@gororobas/effect-sql-turso/TursoClient")

export interface TursoClientConfig extends DatabaseOptions {
  readonly filename: string
  readonly spanAttributes?: Record<string, unknown> | undefined
  readonly transformResultNames?: ((name: string) => string) | undefined
  readonly transformQueryNames?: ((name: string) => string) | undefined
}

const sqlError = (cause: unknown) =>
  new SqlError({
    reason: classifySqliteError(cause, { message: "Turso statement failed", operation: "execute" }),
  })

export const make = (
  options: TursoClientConfig,
): Effect.Effect<TursoClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function* () {
    const databaseOptions = Struct.omit(options, [
      "filename",
      "spanAttributes",
      "transformResultNames",
      "transformQueryNames",
    ])

    const database = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => connect(options.filename, databaseOptions), catch: sqlError }),
      (database) =>
        Effect.gen(function* () {
          // Turso leaves committed pages in its WAL on close. The server's import
          // and backup tools copy the main file after this scope has closed.
          if (!options.readonly && options.filename !== ":memory:") {
            yield* Effect.tryPromise({
              try: () => database.exec("PRAGMA wal_checkpoint(TRUNCATE)"),
              catch: sqlError,
            })
          }
        }).pipe(
          Effect.ensuring(
            Effect.tryPromise({ try: () => database.close(), catch: sqlError }).pipe(Effect.orDie),
          ),
          Effect.orDie,
        ),
    )

    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : undefined

    const withStatement = <A>(input: {
      sql: string
      execute: (statement: PreparedStatement) => Promise<A>
    }) =>
      Effect.withFiber((fiber) =>
        // Native execution cannot be cancelled. Finish and close before releasing
        // the connection permit or rolling back an interrupted transaction.
        Effect.uninterruptible(
          Effect.acquireUseRelease(
            Effect.tryPromise({ try: async () => database.prepare(input.sql), catch: sqlError }),
            (statement) =>
              Effect.tryPromise({
                try: async () => {
                  statement.safeIntegers(Context.get(fiber.context, Client.SafeIntegers))
                  return await input.execute(statement)
                },
                catch: sqlError,
              }),
            (statement) => Effect.sync(() => statement.close()),
          ),
        ),
      )

    const run = (sql: string, parameters: ReadonlyArray<unknown>) =>
      withStatement({
        sql,
        execute: async (statement): Promise<ReadonlyArray<Record<string, unknown>>> => {
          if (statement.reader) return await statement.all(...parameters)
          await statement.run(...parameters)
          return []
        },
      })

    const runValues = (sql: string, parameters: ReadonlyArray<unknown>) =>
      withStatement({
        sql,
        execute: async (statement): Promise<ReadonlyArray<ReadonlyArray<unknown>>> => {
          statement.raw(true)
          if (statement.reader) return await statement.all(...parameters)
          await statement.run(...parameters)
          return []
        },
      })

    // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Effect SQL defines the positional Connection interface.
    const execute: Connection["execute"] = (sql, parameters, transform) =>
      transform ? Effect.map(run(sql, parameters), transform) : run(sql, parameters)

    const connection: Connection = {
      execute,
      executeUnprepared: execute,
      executeRaw: (sql, parameters) =>
        withStatement({
          sql,
          execute: async (
            statement,
          ): Promise<
            ReadonlyArray<Record<string, unknown>> | Awaited<ReturnType<PreparedStatement["run"]>>
          > =>
            statement.reader
              ? await statement.all(...parameters)
              : await statement.run(...parameters),
        }),
      executeValues: runValues,
      executeValuesUnprepared: runValues,
      executeStream: () => Stream.die("Turso streaming is not supported"),
    }

    const acquirers = Client.makeSqliteAcquirers({
      connection: Effect.succeed(connection),
      semaphore: yield* Semaphore.make(1),
    })

    return Object.assign(
      yield* Client.make({
        ...acquirers,
        compiler: Statement.makeCompilerSqlite(options.transformQueryNames),
        transformRows,
        beginTransaction: options.readonly ? "BEGIN" : "BEGIN IMMEDIATE",
        releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
        spanAttributes: [
          ...Record.toEntries(options.spanAttributes ?? {}),
          ["db.system.name", "sqlite"],
        ],
      }),
      { [TypeId]: TypeId, config: options, sdk: database },
    )
  })

export const layer = (options: TursoClientConfig) =>
  Layer.effectContext(
    Effect.map(make(options), (client) =>
      Context.make(TursoClient, client).pipe(Context.add(Client.SqlClient, client)),
    ),
  ).pipe(Layer.provide(Reactivity.layer))

export const layerConfig = (options: Config.Wrap<TursoClientConfig>) =>
  Layer.unwrap(Effect.map(Config.unwrap(options), layer))
