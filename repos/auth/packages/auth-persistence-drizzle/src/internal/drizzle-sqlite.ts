import {
  PersistenceConfigurationError,
  makeComposedPasskeys,
  createPersistence,
} from "@yielded/auth-persistence/Adapter";
import type { StorageTable } from "@yielded/auth-persistence/Adapter";
import { getTableColumns } from "drizzle-orm";
import {
  getTableConfig,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import type { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import { drizzleQueryOperations } from "../drizzle/query-operations";

const makeTable = (definition: StorageTable) =>
  sqliteTable(
    definition.name,
    Object.fromEntries(
      Object.entries(definition.columns).map(([key, column]) => {
        const builder =
          column.type === "text"
            ? text(column.name)
            : column.type === "boolean"
              ? integer(column.name, { mode: "boolean" })
              : integer(column.name);

        return [key, column.nullable ? builder : builder.notNull()];
      }),
    ),
    (columns) =>
      definition.unique.map((keys, i) => {
        const [first, ...rest] = keys;

        if (first === undefined)
          throw PersistenceConfigurationError.make({ reason: "An empty unique key is invalid" });

        return uniqueIndex(`${definition.name}_key_${i}`).on(
          columns[first],
          ...rest.map((key) => columns[key]),
        );
      }),
  );

const describe = (table: SQLiteTable): StorageTable => {
  const config = getTableConfig(table);

  return {
    name: config.name,
    columns: Object.fromEntries(
      Object.entries(getTableColumns(table)).map(([key, column]) => [
        key,
        {
          name: column.name,
          type:
            column.dataType === "boolean"
              ? "boolean"
              : column.dataType === "number"
                ? "integer"
                : "text",
          nullable: !column.notNull,
        },
      ]),
    ),
    unique: [],
  };
};

export const sqlitePersistence = <R>(acquire: Effect.Effect<object, never, R | SqlClient>) =>
  createPersistence<SQLiteTable, R>({
    makeTable,
    describe,
    operations: drizzleQueryOperations,
    acquire,
    passkeys: makeComposedPasskeys(drizzleQueryOperations),
  });
