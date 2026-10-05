import { type CommitJournal, type PreparedCommit } from "@yielded/auth/Hooks";
import { reportAuthFailure } from "@yielded/auth/Persistence";
/* oxlint-disable no-explicit-any -- existing storage kernels erase foreign table shapes; domain errors remain typed. */
import { Cause, Context, Effect } from "effect";
import type * as SqlClient from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import type { Statement } from "effect/sql/Statement";

import type {
  SqlExpression as SQL,
  QueryFailure,
  QueryOperations,
  SqlFragment,
  SqlColumn,
} from "./query-operations";

type Table = object;

export type Row = Record<string, any>;

/** Only query-builder/table shapes are erased here. Installed native
 * queries have captured clients, and their error channel remains explicit. */
type NativeQuery<A> = Effect.Effect<A, QueryFailure | SqlError>;

export interface TransactionNativeDatabase {
  readonly $client: SqlClient.SqlClient & {
    readonly batch: (statements: ReadonlyArray<Statement<any>>) => Effect.Effect<any, SqlError>;
  };
  readonly transaction: <A, E, R>(
    body: (transaction: any) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError, R>;
}

/** Captured root database for service construction and pre-transaction catalog checks.
 * Active transactions remain owned by their coordinator and journal. */
export class NativeDatabase extends Context.Service<NativeDatabase, TransactionNativeDatabase>()(
  "effect-auth/persistence/NativeDatabase",
) {}

export interface Observation {
  readonly table: Table;
  readonly where: SQL;
  rows: ReadonlyArray<Row>;
}

/** Expressions deliberately do not replace observed values. Read only semantic
 * columns when telemetry changes atomically, and state the physical result. */
export interface GuardedUpdate {
  readonly rows: number;
  readonly postcondition: SQL;
}

export interface TransactionOwner<Failure> {
  readonly database: any;
  readonly journal: CommitJournal;
  readonly marker: string;
  readonly batch: boolean;
  readonly observations: Observation[];
  readonly postconditions: Array<SQL | (() => SQL)>;
  readonly statements: Statement<any>[];
  readonly guards: PreparedCommit<void>[];
  exact(table: Table, row: Row): SQL;
  read(
    table: Table,
    where: SQL,
    options?: {
      readonly lock?: boolean;
      readonly limit?: number;
      readonly observe?: boolean;
      readonly admissionOnly?: boolean;
      readonly takeOnly?: boolean;
      readonly orderBy?: any;
      readonly columns?: ReadonlyArray<string>;
    },
  ): Effect.Effect<Observation, Failure>;
  write(query: any): Effect.Effect<void, Failure>;
  insert(
    table: Table,
    values: Row,
    key: Row,
    absent?: boolean,
  ): Effect.Effect<Observation, Failure>;
  update(table: Table, key: Row, values: Row): Effect.Effect<void, Failure>;
  updateGuarded(
    table: Table,
    where: SQL,
    values: Row,
    guard: GuardedUpdate,
  ): Effect.Effect<void, Failure>;
  /** Internal SQL only, run once after application work and before final guards. */
  finalUpdate(
    table: Table,
    where: SQL,
    values: Row,
    guard: GuardedUpdate,
  ): Effect.Effect<void, Failure>;
  remove(table: Table, key: Row): Effect.Effect<void, Failure>;
  check(condition: SQL): Effect.Effect<boolean, Failure>;
  now(clock: { readonly engineNowMillis: SQL }): Effect.Effect<number, Failure>;
  finish(): Effect.Effect<void, Failure>;
}

export const makeTransactionKernel = <
  Fragment extends SqlFragment = SqlFragment,
  Column extends SqlColumn = SqlColumn,
>(
  operations: QueryOperations<Fragment, Column>,
) => {
  const { eq, getTableColumns, isNull, sql, balancedD1And, compactD1GeneratedStatement } =
    operations;

  const isUnavailableCause = <Failure>(cause: Cause.Cause<unknown>, unavailable: () => Failure) => {
    const expected = unavailable();

    const tag =
      typeof expected === "object" && expected !== null && "_tag" in expected
        ? expected._tag
        : undefined;

    return (
      tag !== undefined &&
      cause.reasons.length > 0 &&
      cause.reasons.every(
        (reason) =>
          Cause.isFailReason(reason) &&
          typeof reason.error === "object" &&
          reason.error !== null &&
          "_tag" in reason.error &&
          reason.error._tag === tag,
      )
    );
  };

  /** Report once, before an adapter replaces the raw cause with its public
   * unavailable error. Already translated failures stay quiet at outer owners. */
  const reportTransactionFailure = <A, E, R, Failure>(
    effect: Effect.Effect<A, E, R>,
    unavailable: () => Failure,
  ): Effect.Effect<A, E, R> =>
    Effect.catchCause(effect, (cause) =>
      isUnavailableCause(cause, unavailable)
        ? Effect.failCause(cause)
        : reportAuthFailure("auth-persistence", cause).pipe(
            Effect.andThen(Effect.failCause(cause)),
          ),
    );

  const both = (...parts: ReadonlyArray<SQL | undefined>) => balancedD1And(...parts) ?? sql`1 = 1`;

  const makeTransactionRows = <Failure>(unavailable: () => Failure) => {
    const invariant: (value: unknown) => asserts value = (value) => {
      if (!value) throw unavailable();
    };

    const col = (table: Table, key: string) => {
      const value = getTableColumns(table)[key];

      invariant(value !== undefined);

      return value;
    };

    const equal = (table: Table, values: Row) =>
      both(
        ...Object.entries(values).map(([key, value]) =>
          value === null ? isNull(col(table, key)) : eq(col(table, key), value),
        ),
      );

    /** Mapped driver values use plain data, Dates and binary views. Application
     * identity classes are reconstructed by the mapped codecs, never cloned here. */
    const copiedRow = (row: Row) => {
      const seen = new WeakSet<object>();

      const supported = (value: unknown): void => {
        if (value === null || typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        if (value instanceof Date || value instanceof ArrayBuffer || ArrayBuffer.isView(value))
          return;
        invariant(
          Array.isArray(value) ||
            Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null,
        );
        for (const item of Object.values(value)) supported(item);
      };

      supported(row);

      return structuredClone(row);
    };

    const nativeKey = (value: unknown): string => {
      const packed = (tag: string, text: string) => tag + text.length + ":" + text;

      if (value instanceof Date) return packed("date", value.toISOString());
      if (typeof value === "bigint") return packed("bigint", value.toString());

      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            : undefined;

      if (bytes !== undefined) return packed("bytes", Array.from(bytes).join(","));
      if (value === null || typeof value !== "object") return packed(typeof value, String(value));
      if (Array.isArray(value)) return packed("array", value.map(nativeKey).join(""));
      invariant(
        Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
      );

      return packed(
        "object",
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, item]) => nativeKey(name) + nativeKey(item))
          .join(""),
      );
    };

    const matchesNativeRow = (table: Table, row: Row, key: Row) =>
      Object.entries(key).every(([name, value]) => {
        if (value === null || row[name] === null) return value === row[name];
        const column = col(table, name);

        return (
          nativeKey(column.mapToDriverValue(row[name])) ===
          nativeKey(column.mapToDriverValue(value))
        );
      });

    return { col, equal, copiedRow, matchesNativeRow };
  };

  const makeTransactionOwner = <Failure>(
    database: any,
    journal: CommitJournal,
    marker: string,
    unavailable: () => Failure,
    configuration: {
      readonly client?: any;
      readonly batch: boolean;
      readonly locking: boolean;
      readonly mysql: boolean;
      readonly dialect: "pg" | "mysql" | "sqlite";
    },
  ): TransactionOwner<Failure> => {
    const invariant: (value: unknown) => asserts value = (value) => {
      if (!value) throw unavailable();
    };

    const { col, equal, matchesNativeRow } = makeTransactionRows(unavailable);
    let phase: "open" | "finishing" | "finished" = "open";
    let poisoned = false;
    const open = () => invariant(phase === "open" && !poisoned);

    const result = <A, E>(effect: Effect.Effect<A, E>) =>
      effect.pipe(
        (operation) => reportTransactionFailure(operation, unavailable),
        Effect.mapError(unavailable),
        Effect.catchDefect(() => Effect.fail(unavailable())),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            if (exit._tag === "Failure") poisoned = true;
          }),
        ),
      );

    const observations: Observation[] = [];
    const statements: Statement<any>[] = [];
    const postconditions: Array<SQL | (() => SQL)> = [];
    const guards: PreparedCommit<void>[] = [];
    const finalUpdates: Array<{ readonly query: any; readonly guard: GuardedUpdate }> = [];

    const exactRow = (table: Table, row: Row) =>
      both(
        ...Object.entries(row).map(([key, value]) => {
          if (typeof value !== "string") return equal(table, { [key]: value });

          const column = col(table, key),
            bound = sql.param(value, column);

          return configuration.dialect === "mysql"
            ? sql`binary ${column} = binary ${bound}`
            : configuration.dialect === "pg"
              ? sql`convert_to(cast(${column} as text), 'UTF8') = convert_to(cast(${bound} as text), 'UTF8')`
              : sql`cast(${column} as blob) = cast(${bound} as blob)`;
        }),
      );

    const toStatement = (query: any): Statement<any> => {
      const rendered = query.toSQL();
      const client = configuration.client ?? database.$client;

      return compactD1GeneratedStatement(
        client,
        client.unsafe(rendered.sql, rendered.params),
        unavailable,
      );
    };

    const assertion = (condition: SQL) =>
      database
        .select({
          value: sql`case when ${condition} then 1 else json_extract('[]', ${"$[oauth-owner-" + marker + "]"}) end`,
        })
        .from(sql`(select 1) as oauth_assertion`);

    const observedConditions = (table: Table, where: SQL, rows: ReadonlyArray<Row>) => [
      sql`(select count(*) from ${table} where ${where}) = ${rows.length}`,
      ...rows.map(
        (row) => sql`exists(select 1 from ${table} where ${both(where, exactRow(table, row))})`,
      ),
    ];

    // All chunks remain inside the same native owner or atomic D1 batch. A single
    // wide row is compacted; separate observations cannot accumulate unbounded
    // bind parameters or expression depth in one final SELECT.
    const chunks = (conditions: ReadonlyArray<SQL>) => {
      const output: SQL[] = [];
      let pending: SQL[] = [];

      for (const condition of conditions) {
        const candidate = [...pending, condition];
        const rendered = assertion(both(...candidate)).toSQL();

        if (
          pending.length > 0 &&
          (rendered.params.length > 96 || new TextEncoder().encode(rendered.sql).length > 48_000)
        ) {
          output.push(both(...pending));
          pending = [condition];
        } else pending = candidate;
      }
      if (pending.length > 0) output.push(both(...pending));

      return output;
    };

    const appendAssertions = (conditions: ReadonlyArray<SQL>) => {
      for (const condition of chunks(conditions))
        statements.push(toStatement(assertion(condition)));
    };

    const observed = (table: Table, where: SQL, rows: ReadonlyArray<Row>) => {
      const observation = { table, where, rows };

      observations.push(observation);

      return observation;
    };

    const queryCondition = (condition: SQL) =>
      database
        .select({
          value: sql`case when ${condition} then 1 else 0 end`.mapWith(Number).as("value"),
        })
        .from(sql`(select 1) as oauth_guard`);

    const conditionHolds = (condition: SQL) =>
      Effect.gen(function* () {
        const query = queryCondition(condition);

        const rows: ReadonlyArray<Row> = yield* configuration.dialect === "sqlite"
          ? toStatement(query)
          : (query as NativeQuery<Row[]>);

        invariant(rows.length === 1);

        return rows[0]!.value === 1;
      });

    const guardedQuery = (table: Table, where: SQL, values: Row, guard: GuardedUpdate) => {
      invariant(Number.isSafeInteger(guard.rows) && guard.rows > 0 && guard.rows <= 128);

      return { query: database.update(table).set(values).where(where), guard: { ...guard } };
    };

    const applyGuarded = (entry: { readonly query: any; readonly guard: GuardedUpdate }) =>
      Effect.gen(function* () {
        if (configuration.batch) {
          statements.push(toStatement(entry.query));
          statements.push(toStatement(assertion(sql`changes() = ${entry.guard.rows}`)));
          appendAssertions([entry.guard.postcondition]);
        } else {
          if (configuration.mysql) {
            // mysql2 reports matched rows (FOUND_ROWS), including a telemetry no-op.
            const changed = yield* entry.query as NativeQuery<{ readonly affectedRows: number }>;

            invariant(changed.affectedRows === entry.guard.rows);
          } else {
            const changed = yield* entry.query.returning({ value: sql`1` }) as NativeQuery<
              ReadonlyArray<Row>
            >;

            invariant(changed.length === entry.guard.rows);
          }
          invariant(yield* conditionHolds(entry.guard.postcondition));
        }
      });

    const owner: TransactionOwner<Failure> = {
      database,
      journal,
      marker,
      batch: configuration.batch,
      observations,
      statements,
      postconditions,
      guards,
      exact: exactRow,
      read: (table, where, options = {}) =>
        result(
          Effect.gen(function* () {
            open();
            const limit = options.limit ?? 64;

            let query = database
              .select(
                options.columns === undefined
                  ? undefined
                  : Object.fromEntries(options.columns.map((key) => [key, col(table, key)])),
              )
              .from(table)
              .where(where)
              .limit(options.takeOnly ? limit : limit + 1);

            if (options.orderBy !== undefined) query = query.orderBy(options.orderBy);
            if (options.lock !== false && configuration.locking) query = query.for("update");
            const rows: Row[] = yield* query as NativeQuery<Row[]>;

            invariant(rows.length <= limit);
            if (configuration.batch && (options.observe !== false || options.admissionOnly))
              appendAssertions(observedConditions(table, where, rows));

            return options.observe === false || options.admissionOnly
              ? { table, where, rows }
              : observed(table, where, rows);
          }),
        ),
      write: (query) =>
        result(
          Effect.gen(function* () {
            open();
            if (configuration.batch) statements.push(toStatement(query));
            else yield* query as NativeQuery<unknown>;
          }),
        ),
      insert: (table, values, key, absent = false) =>
        result(
          Effect.gen(function* () {
            open();
            let query = database.insert(table).values(values);

            if (absent)
              query = configuration.mysql
                ? query.onDuplicateKeyUpdate({
                    set: { [Object.keys(key)[0]!]: col(table, Object.keys(key)[0]!) },
                  })
                : query.onConflictDoNothing();
            yield* owner.write(query);
            const where = equal(table, key);

            if (configuration.batch) return observed(table, where, [values]);
            const found = yield* owner.read(table, where, { limit: 1 });
            const markerColumn = Object.keys(values).find((key) => values[key] === marker);

            if (!absent || (markerColumn !== undefined && found.rows[0]?.[markerColumn] === marker))
              invariant(
                yield* owner.check(
                  sql`exists(select 1 from ${table} where ${both(where, exactRow(table, values))})`,
                ),
              );

            return found;
          }),
        ),
      update: (table, key, values) =>
        result(
          Effect.gen(function* () {
            open();
            yield* owner.write(database.update(table).set(values).where(equal(table, key)));
            for (const observation of observations)
              if (observation.table === table)
                observation.rows = observation.rows.map((row) =>
                  matchesNativeRow(table, row, key) ? { ...row, ...values } : row,
                );
          }),
        ),
      updateGuarded: (table, where, values, guard) =>
        result(
          Effect.gen(function* () {
            open();
            const entry = guardedQuery(table, where, values, guard);

            yield* applyGuarded(entry);
            postconditions.push(entry.guard.postcondition);
          }),
        ),
      finalUpdate: (table, where, values, guard) =>
        result(
          Effect.sync(() => {
            open();
            invariant(finalUpdates.length < 128);
            finalUpdates.push(guardedQuery(table, where, values, guard));
          }),
        ),
      remove: (table, key) =>
        result(
          Effect.gen(function* () {
            open();
            yield* owner.write(database.delete(table).where(equal(table, key)));
            for (const observation of observations)
              if (observation.table === table)
                observation.rows = observation.rows.filter(
                  (row) => !matchesNativeRow(table, row, key),
                );
          }),
        ),
      check: (condition) =>
        result(
          Effect.gen(function* () {
            open();
            const holds = yield* conditionHolds(condition);

            if (configuration.batch)
              statements.push(toStatement(assertion(holds ? condition : sql`not (${condition})`)));

            return holds;
          }),
        ),
      now: (clock) =>
        result(
          Effect.gen(function* () {
            open();

            const rows: Row[] = yield* database
              .select({
                value: sql`${clock.engineNowMillis}`.mapWith(Number),
              })
              .from(sql`(select 1) as oauth_clock`) as NativeQuery<Row[]>;

            const value = rows[0]?.value;

            invariant(Number.isSafeInteger(value) && value >= 0);

            return value as number;
          }),
        ),
      finish: () =>
        result(
          Effect.gen(function* () {
            open();
            phase = "finishing";
            Object.freeze(observations);
            Object.freeze(postconditions);
            Object.freeze(guards);
            Object.freeze(finalUpdates);

            // Close registration before any late-bound SQL predicate is materialized.
            // No callback is invoked after the first final write.
            const conditions: SQL[] = observations.flatMap((observation) =>
              observedConditions(observation.table, observation.where, observation.rows),
            );

            conditions.push(
              ...postconditions.map((condition) =>
                typeof condition === "function" ? condition() : condition,
              ),
            );
            conditions.push(...finalUpdates.map((entry) => entry.guard.postcondition));
            for (const guard of guards) {
              const status = yield* Effect.result(guard.read);

              invariant(status._tag === "Failure" && status.failure._tag === "CommitPending");
            }
            invariant(!poisoned);
            for (const entry of finalUpdates) yield* applyGuarded(entry);
            if (configuration.batch) appendAssertions(conditions);
            else
              for (const condition of chunks(conditions))
                invariant(yield* conditionHolds(condition));
            invariant(!poisoned);
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                phase = "finished";
              }),
            ),
          ),
        ),
    };

    return owner;
  };

  return { reportTransactionFailure, both, makeTransactionRows, makeTransactionOwner };
};
