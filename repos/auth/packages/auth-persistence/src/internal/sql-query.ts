import { Effect, Predicate } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";

import { PersistenceMappingError } from "./mapping-error";
import type { QueryOperations } from "./query-operations";
import {
  type Column,
  Fragment,
  Table,
  identifier,
  type Compiler,
  type Dialect,
  type Row,
} from "./sql-table";

const render = (value: unknown, compiler: Compiler): string => {
  if (value instanceof Fragment) return value.render(compiler);
  if (Predicate.hasProperty(value, "getSQL") && typeof value.getSQL === "function") {
    return render(value.getSQL(), compiler);
  }

  compiler.parameters.push(
    compiler.dialect === "sqlite" && typeof value === "boolean" ? Number(value) : value,
  );

  return compiler.dialect === "pg" ? `$${compiler.parameters.length}` : "?";
};

const template = (parts: TemplateStringsArray, ...values: unknown[]): Fragment =>
  new Fragment((compiler) =>
    parts.reduce(
      (sql, part, i) => sql + (i === 0 ? "" : render(values[i - 1], compiler)) + part,
      "",
    ),
  );

const combine = (separator: string, values: ReadonlyArray<Fragment | undefined>) => {
  const fragments = values.filter((value) => value !== undefined);

  return fragments.length === 0
    ? undefined
    : new Fragment(
        (compiler) =>
          "(" + fragments.map((fragment) => fragment.render(compiler)).join(separator) + ")",
      );
};

const and = (...values: ReadonlyArray<Fragment | undefined>) => combine(" AND ", values);
const or = (...values: ReadonlyArray<Fragment | undefined>) => combine(" OR ", values);

const operations = {
  and,
  or,
  asc: (value: unknown) => template`${value} ASC`,
  eq: (left: unknown, right: unknown) => template`${left} = ${right}`,
  gt: (left: unknown, right: unknown) => template`${left} > ${right}`,
  gte: (left: unknown, right: unknown) => template`${left} >= ${right}`,
  lte: (left: unknown, right: unknown) => template`${left} <= ${right}`,
  isNull: (value: unknown) => template`${value} IS NULL`,
  notExists: (value: unknown) => template`NOT EXISTS (${value})`,
  inArray: (column: unknown, values: ReadonlyArray<unknown>) =>
    values.length === 0
      ? template`false`
      : new Fragment(
          (compiler) =>
            `${render(column, compiler)} IN (${values.map((value) => render(value, compiler)).join(", ")})`,
        ),
  sql: Object.assign(template, {
    param: (value: unknown, column: Column) => column.mapToDriverValue(value),
    join: (values: ReadonlyArray<unknown>, separator: Fragment = template``) =>
      new Fragment((compiler) =>
        values
          .map(
            (value, index) =>
              (index === 0 ? "" : separator.render(compiler)) + render(value, compiler),
          )
          .join(""),
      ),
  }),
  getTableColumns: (table: Table) => table.columns,
  column: (table: Table, key: string) => {
    const column = table.columns[key];

    if (column === undefined)
      throw PersistenceMappingError.make({ operation: "column", cause: key });

    return column;
  },
  updateValues: (entries: ReadonlyArray<readonly [string, unknown]>) => Object.fromEntries(entries),
  balancedD1And: and,
  // Raw clients use interactive transactions, so no D1 batch compaction is needed.
  compactD1GeneratedStatement: <S>(_client: unknown, statement: S) => statement,
};

// The existing kernels erase query-builder shapes at this boundary. The raw compiler
// implements precisely those operations; no row decoding or Effect requirements are cast.
export const sqlQueryOperations = operations as unknown as QueryOperations;

type Selection = Readonly<Record<string, Fragment>>;

interface QueryState {
  readonly operation: "select" | "insert" | "update" | "delete";
  readonly table?: Table | Fragment;
  readonly joins?: ReadonlyArray<{
    readonly table: Table | Fragment;
    readonly on: Fragment;
  }>;
  readonly selection?: Selection;
  readonly where?: Fragment | undefined;
  readonly values?: Row;
  readonly returning?: Selection | true;
  readonly order?: ReadonlyArray<Fragment>;
  readonly limit?: number;
  readonly lock?: boolean;
  readonly conflict?: boolean;
}

const selectionFor = (state: QueryState): Selection =>
  state.selection ?? (state.table instanceof Table ? state.table.columns : {});

const selectionFields = (selection: Selection) => {
  const used = new Set(Object.keys(selection));
  let index = 0;

  return Object.entries(selection).flatMap<{
    readonly key: string;
    readonly name: string | undefined;
    readonly column: Fragment;
    readonly alias: string;
  }>(([key, value]) =>
    value instanceof Table
      ? Object.entries(value.columns).map(([name, column]) => {
          let alias: string;

          do alias = `auth_column_${index++}`;
          while (used.has(alias));
          used.add(alias);

          return { key, name, column, alias };
        })
      : [{ key, name: undefined, column: value, alias: key }],
  );
};

const projection = (selection: Selection, compiler: Compiler) =>
  selectionFields(selection)
    .map(({ column, alias }) => `${column.render(compiler)} AS ${identifier(alias)}`)
    .join(", ");

// Joined table selections retain their own column codecs and nested row names.
const decodeRow = (selection: Selection, row: Row): Row => {
  const entries: Array<readonly [string, unknown]> = [];
  const groups = new Map<string, Array<readonly [string, unknown]>>();

  for (const field of selectionFields(selection)) {
    const value = field.column.decode(row[field.alias]);

    if (field.name === undefined) entries.push([field.key, value]);
    else {
      const group = groups.get(field.key) ?? [];

      group.push([field.name, value]);
      groups.set(field.key, group);
    }
  }

  return Object.fromEntries([
    ...entries,
    ...Array.from(groups, ([key, values]) => [key, Object.fromEntries(values)]),
  ]);
};

const compile = (state: QueryState, compiler: Compiler): string => {
  const table = state.table;

  if (table === undefined)
    throw PersistenceMappingError.make({ operation: "query", cause: "Missing table" });
  let query: string;

  if (state.operation === "select") {
    query = `SELECT ${projection(selectionFor(state), compiler)} FROM ${table.render(compiler)}`;
    for (const join of state.joins ?? [])
      query += ` INNER JOIN ${join.table.render(compiler)} ON ${join.on.render(compiler)}`;
  } else {
    if (!(table instanceof Table))
      throw PersistenceMappingError.make({
        operation: "query",
        cause: "Mutation requires a table",
      });
    const target = table.render(compiler);

    const fields = Object.entries(state.values ?? {}).filter(
      ([key, value]) => table.columns[key] !== undefined && value !== undefined,
    );

    if (state.operation === "insert") {
      query = `INSERT INTO ${target} (${fields.map(([key]) => identifier(table.columns[key].options.name)).join(", ")}) VALUES (${fields.map(([, value]) => render(value, compiler)).join(", ")})`;
    } else if (state.operation === "update") {
      query = `UPDATE ${target} SET ${fields.map(([key, value]) => `${identifier(table.columns[key].options.name)} = ${render(value, compiler)}`).join(", ")}`;
    } else query = `DELETE FROM ${target}`;
  }
  if (state.where !== undefined) query += ` WHERE ${state.where.render(compiler)}`;
  if (state.order?.length)
    query += ` ORDER BY ${state.order.map((field) => field.render(compiler)).join(", ")}`;
  if (state.limit !== undefined) query += ` LIMIT ${render(state.limit, compiler)}`;
  if (state.conflict) query += " ON CONFLICT DO NOTHING";
  if (state.returning)
    query += ` RETURNING ${projection(state.returning === true && table instanceof Table ? table.columns : state.returning === true ? {} : state.returning, compiler)}`;
  if (state.lock && compiler.dialect === "pg") query += " FOR UPDATE";

  return query;
};

/** Captures one Effect SQL client. Its transaction service remains the physical owner. */
export const makeSqlDatabase = Effect.fnUntraced(function* (dialect: Dialect) {
  const client = yield* SqlClient;

  const query = (state: QueryState): Query => {
    const execute = Effect.suspend(() => {
      const compiler: Compiler = { dialect, parameters: [] };
      const text = compile(state, compiler);

      const selected: Selection =
        state.operation === "select"
          ? selectionFor(state)
          : state.returning === true
            ? state.table instanceof Table
              ? state.table.columns
              : {}
            : state.returning || {};

      return client
        .unsafe<Row>(text, compiler.parameters)
        .pipe(Effect.map((rows) => rows.map((row) => decodeRow(selected, row))));
    });

    return Object.assign(execute, {
      toSQL: () => {
        const compiler: Compiler = { dialect, parameters: [] };

        return { sql: compile(state, compiler), params: compiler.parameters };
      },
      getSQL: () => new Fragment((compiler) => compile(state, compiler)),
      from: (table: Table | Fragment) => query({ ...state, table }),
      innerJoin: (table: Table | Fragment, on: Fragment) =>
        query({ ...state, joins: [...(state.joins ?? []), { table, on }] }),
      where: (where: Fragment | undefined) => query({ ...state, where }),
      limit: (limit: number) => query({ ...state, limit }),
      orderBy: (...order: Fragment[]) => query({ ...state, order }),
      for: (_lock: "update") => query({ ...state, lock: true }),
      values: (values: Row) => query({ ...state, values }),
      set: (values: Row) => query({ ...state, values }),
      returning: (returning: Selection | true = true) => query({ ...state, returning }),
      onConflictDoNothing: () => query({ ...state, conflict: true }),
    });
  };

  const database: SqlDatabase = {
    $client: client,
    select: (selection?: Selection) =>
      query({ operation: "select", ...(selection === undefined ? {} : { selection }) }),
    insert: (table: Table) => query({ operation: "insert", table }),
    update: (table: Table) => query({ operation: "update", table }),
    delete: (table: Table) => query({ operation: "delete", table }),
    transaction: <A, E, R>(
      body: (database: SqlDatabase) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | SqlError, R> =>
      client.withTransaction(Effect.suspend(() => body(database))),
  };

  return database;
});

interface Query extends Effect.Effect<Row[], SqlError> {
  toSQL(): { readonly sql: string; readonly params: ReadonlyArray<unknown> };
  getSQL(): Fragment;
  from(table: Table | Fragment): Query;
  innerJoin(table: Table | Fragment, on: Fragment): Query;
  where(where: Fragment | undefined): Query;
  limit(limit: number): Query;
  orderBy(...order: Fragment[]): Query;
  for(lock: "update"): Query;
  values(values: Row): Query;
  set(values: Row): Query;
  returning(returning?: Selection | true): Query;
  onConflictDoNothing(): Query;
}

export interface SqlDatabase {
  readonly $client: SqlClient;
  select(selection?: Selection): Query;
  insert(table: Table): Query;
  update(table: Table): Query;
  delete(table: Table): Query;
  transaction<A, E, R>(
    body: (database: SqlDatabase) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqlError, R>;
}

export const sql = template;
