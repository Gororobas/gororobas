import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { PersistenceConfigurationError, type PersistenceApi } from "./configuration";
import { makeNativeSqlTables } from "./native-sql-table";
import { createPersistence } from "./persistence";
import { Table } from "./sql-table";
import type { StorageTable } from "./storage-tables";

const table = (definition: StorageTable) =>
  new Table(
    definition.name,
    definition.columns,
    definition.unique,
    definition.schema,
    definition.indexes,
  );

export const AuthPersistence: PersistenceApi<Table> & { readonly table: typeof table } = {
  ...createPersistence({
    makeTable: table,
    describe: (table: Table): StorageTable => ({
      name: table.name,
      ...(table.schema === undefined ? {} : { schema: table.schema }),
      columns: Object.fromEntries(
        Object.entries(table.columns).map(([key, column]) => [key, column.options]),
      ),
      unique: table.unique,
      indexes: table.indexes,
    }),
    nativeTables: makeNativeSqlTables,
    acquire: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const dialect = sql.onDialectOrElse({
        pg: () => "pg" as const,
        sqlite: () => "sqlite" as const,
        orElse: () => undefined,
      });

      if (dialect === undefined)
        return yield* PersistenceConfigurationError.make({
          reason: "Use an explicit adapter for this SQL dialect",
        });

      return sql;
    }),
  }),
  table,
};
