import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";
import type * as Statement from "effect/sql/Statement";

import { PersistenceMappingError } from "./mapping-error";
import type { Table } from "./sql-table";
import { identifier } from "./sql-table";

/** Physical names are components, so a literal dot in a mapped name stays quoted. */
export const sqlName = (sql: SqlClient.SqlClient, name: string): Statement.Fragment =>
  sql.literal(identifier(name));

export const sqlTable = (sql: SqlClient.SqlClient, table: Table): Statement.Fragment =>
  sql.literal(
    (table.schema === undefined ? "" : identifier(table.schema) + ".") + identifier(table.name),
  );

export const sqlColumn = (
  sql: SqlClient.SqlClient,
  table: Table,
  key: string,
  alias?: string,
): Statement.Fragment =>
  sql`${alias === undefined ? sqlTable(sql, table) : sqlName(sql, alias)}.${sqlName(sql, table.columns[key]!.options.name)}`;

export const sqlProjection = (
  sql: SqlClient.SqlClient,
  table: Table,
  alias?: string,
  prefix = "",
): Statement.Fragment =>
  sql.csv(
    Object.keys(table.columns).map(
      (key) => sql`${sqlColumn(sql, table, key, alias)} as ${sqlName(sql, prefix + key)}`,
    ),
  );

export const sqlValue = (
  sql: SqlClient.SqlClient,
  table: Table,
  key: string,
  value: unknown,
): unknown =>
  table.columns[key]!.options.type === "boolean" && typeof value === "boolean"
    ? sql.onDialectOrElse({ sqlite: () => Number(value), orElse: () => value })
    : value;

export const sqlInsert = (
  sql: SqlClient.SqlClient,
  table: Table,
  values: Readonly<Record<string, unknown>>,
): Statement.Fragment => {
  // The built-in insert/update helpers split dots in names and flatten SQL
  // expression values. Keep physical name components and interpolated values.
  const keys = Object.keys(table.columns).filter((key) => values[key] !== undefined);

  return sql`(${sql.csv(keys.map((key) => sqlName(sql, table.columns[key]!.options.name)))}) values (${sql.csv(keys.map((key) => sql`${sqlValue(sql, table, key, values[key])}`))})`;
};

export const sqlInsertMany = (
  sql: SqlClient.SqlClient,
  table: Table,
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
): Statement.Fragment => {
  const keys = Object.keys(table.columns).filter((key) => rows[0]?.[key] !== undefined);

  return sql`(${sql.csv(keys.map((key) => sqlName(sql, table.columns[key]!.options.name)))}) values ${sql.csv(rows.map((row) => sql`(${sql.csv(keys.map((key) => sql`${sqlValue(sql, table, key, row[key])}`))})`))}`;
};

export const sqlUpdate = (
  sql: SqlClient.SqlClient,
  table: Table,
  values: Readonly<Record<string, unknown>>,
): Statement.Fragment =>
  sql.csv(
    Object.entries(values)
      .filter(([key, value]) => table.columns[key] !== undefined && value !== undefined)
      .map(
        ([key, value]) =>
          sql`${sqlName(sql, table.columns[key]!.options.name)} = ${sqlValue(sql, table, key, value)}`,
      ),
  );

export const decodeSqlRow = (table: Table, row: Readonly<Record<string, unknown>>, prefix = "") =>
  Effect.try({
    try: () =>
      Object.fromEntries(
        Object.entries(table.columns).map(([key, column]) => [
          key,
          column.decode(row[prefix + key]),
        ]),
      ),
    catch: (cause) => PersistenceMappingError.make({ operation: "decode", cause }),
  });

/** CTE names share a namespace with unqualified application tables. */
export const sqlAlias = (tables: ReadonlyArray<Table | undefined>, name: string): string => {
  const occupied = new Set(
    tables.flatMap((table) => (table === undefined ? [] : [table.name.toLowerCase()])),
  );

  while (occupied.has(name.toLowerCase())) name += "_";

  return name;
};
