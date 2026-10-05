import {
  PersistenceConfigurationError,
  makeComposedPasskeys,
  createPersistence,
} from "@yielded/auth-persistence/Adapter";
import type { StorageTable } from "@yielded/auth-persistence/Adapter";
import { getTableColumns } from "drizzle-orm";
import {
  getTableConfig,
  bigint,
  boolean,
  pgTable,
  text,
  uniqueIndex,
  type PgTable,
} from "drizzle-orm/pg-core";
import type { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import { drizzleQueryOperations } from "../drizzle/query-operations";

const makeTable = (definition: StorageTable) =>
  pgTable(
    definition.name,
    Object.fromEntries(
      Object.entries(definition.columns).map(([key, column]) => {
        const builder =
          column.type === "text"
            ? text(column.name)
            : column.type === "boolean"
              ? boolean(column.name)
              : bigint(column.name, { mode: "number" });

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

const describe = (table: PgTable): StorageTable => {
  const config = getTableConfig(table);

  return {
    name: config.name,
    ...(config.schema === undefined ? {} : { schema: config.schema }),
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

export const postgresPersistence = <R>(acquire: Effect.Effect<object, never, R | SqlClient>) =>
  createPersistence<PgTable, R>({
    makeTable,
    describe,
    operations: drizzleQueryOperations,
    acquire,
    passkeys: makeComposedPasskeys(drizzleQueryOperations),
  });
