import { Effect } from "effect";
import { SqlClient } from "effect/sql";

import { PersistenceConfigurationError, type PersistenceApi } from "./configuration";
import { makeComposedPasskeys } from "./passkeys";
import { createPersistence } from "./persistence";
import { makeSqlDatabase, sqlQueryOperations } from "./sql-query";
import { Table } from "./sql-table";
import type { StorageTable } from "./storage-tables";

const table = (definition: StorageTable) =>
  new Table(definition.name, definition.columns, definition.unique, definition.schema);

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
    }),
    operations: sqlQueryOperations,
    passkeys: makeComposedPasskeys(sqlQueryOperations),
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

      return yield* makeSqlDatabase(dialect);
    }),
  }),
  table,
};
