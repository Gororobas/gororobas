import { Effect, Schema } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

import { PersistenceConfigurationError } from "./configuration";
import type { StorageTable } from "./storage-tables";

const Column = Schema.Struct({ name: Schema.String, pk: Schema.Int });
const Index = Schema.Struct({ name: Schema.String, unique: Schema.Int, partial: Schema.Int });
const IndexColumn = Schema.Struct({ name: Schema.NullOr(Schema.String) });
const PgColumns = Schema.Array(Schema.Struct({ name: Schema.String }));
const PgKeys = Schema.Array(Schema.Struct({ columns: Schema.Array(Schema.String) }));
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';

/** Physical metadata needed for catalog validation; value codecs remain adapter-owned. */
export interface PhysicalStorageTable {
  readonly name: string;
  readonly schema?: string;
  readonly columns: Readonly<Record<string, { readonly name: string }>>;
}

export const qualifiedTableName = (table: Pick<StorageTable, "name" | "schema">) =>
  (table.schema === undefined ? "" : quote(table.schema) + ".") + quote(table.name);

/** Validate physical uniqueness before the first authentication operation. A
 * partial or expression index cannot establish these unconditional guarantees. */
export const validateStorage = Effect.fnUntraced(
  function* (
    dialect: "pg" | "mysql" | "sqlite",
    table: PhysicalStorageTable,
    required: ReadonlyArray<ReadonlyArray<string>>,
  ) {
    const client = yield* SqlClient;

    const physicalKeys: ReadonlyArray<ReadonlyArray<string>> = yield* dialect === "sqlite"
      ? Effect.gen(function* () {
          if (table.schema !== undefined && table.schema !== "main")
            return yield* PersistenceConfigurationError.make({
              reason: "SQLite storage must belong to the main database",
            });

          const columns = yield* client`select name, pk from pragma_table_info(${table.name})`.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Column))),
          );

          for (const column of Object.values(table.columns)) {
            if (!columns.some((actual) => actual.name === column.name))
              return yield* PersistenceConfigurationError.make({
                reason: `Missing SQL column ${table.name}.${column.name}`,
              });
          }
          const keys: string[][] = [];
          const primary = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);

          if (primary.length > 0) keys.push(primary.map((column) => column.name));

          const indexes =
            yield* client`select name, "unique", partial from pragma_index_list(${table.name})`.pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Index))),
            );

          for (const index of indexes) {
            if (index.unique !== 1 || index.partial !== 0) continue;

            const columns = yield* client`select name from pragma_index_info(${index.name})`.pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(IndexColumn))),
            );

            if (columns.every((column) => column.name !== null))
              keys.push(columns.flatMap((column) => (column.name === null ? [] : [column.name])));
          }

          return keys;
        })
      : dialect === "mysql"
        ? Effect.gen(function* () {
            const columns = yield* client`
              select column_name as name from information_schema.columns
              where table_schema = coalesce(${table.schema ?? null}, database())
                and table_name = ${table.name}
            `.pipe(Effect.flatMap(Schema.decodeUnknownEffect(PgColumns)));

            for (const column of Object.values(table.columns)) {
              if (!columns.some((actual) => actual.name === column.name))
                return yield* PersistenceConfigurationError.make({
                  reason: `Missing SQL column ${table.name}.${column.name}`,
                });
            }

            const indexes = yield* client`
              select index_name as name, column_name as columnName, sub_part as prefix
              from information_schema.statistics
              where table_schema = coalesce(${table.schema ?? null}, database())
                and table_name = ${table.name} and non_unique = 0
              order by index_name, seq_in_index
            `.pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  Schema.Array(
                    Schema.Struct({
                      name: Schema.String,
                      columnName: Schema.NullOr(Schema.String),
                      prefix: Schema.NullOr(Schema.Number),
                    }),
                  ),
                ),
              ),
            );

            const keys = new Map<string, Array<(typeof indexes)[number]>>();

            for (const index of indexes) {
              const columns = keys.get(index.name) ?? [];

              columns.push(index);
              keys.set(index.name, columns);
            }

            return [...keys.values()]
              .filter((columns) =>
                columns.every((column) => column.columnName !== null && column.prefix === null),
              )
              .map((columns) =>
                columns.flatMap((column) =>
                  column.columnName === null ? [] : [column.columnName],
                ),
              );
          })
        : Effect.gen(function* () {
            const relation = qualifiedTableName(table);

            const columns =
              yield* client`select attname as name from pg_attribute where attrelid = to_regclass(${relation}) and attnum > 0 and not attisdropped`.pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(PgColumns)),
              );

            for (const column of Object.values(table.columns)) {
              if (!columns.some((actual) => actual.name === column.name))
                return yield* PersistenceConfigurationError.make({
                  reason: `Missing SQL column ${relation}.${column.name}`,
                });
            }

            const indexes = yield* client`
          select array_agg(a.attname order by k.ordinality) as columns
          from pg_index i
          cross join lateral unnest(i.indkey) with ordinality as k(attnum, ordinality)
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
          where i.indrelid = to_regclass(${relation}) and i.indisunique and i.indisvalid
            and i.indimmediate and i.indpred is null and i.indexprs is null
            and k.ordinality <= i.indnkeyatts
          group by i.indexrelid
        `.pipe(Effect.flatMap(Schema.decodeUnknownEffect(PgKeys)));

            return indexes.map((index) => index.columns);
          });

    for (const keys of required) {
      const columns = keys.map((key) => table.columns[key]?.name);

      if (
        columns.some((column) => column === undefined) ||
        !physicalKeys.some(
          // A stronger key also guarantees the required tuple's uniqueness.
          (actual) =>
            actual.length > 0 &&
            actual.length <= columns.length &&
            actual.every((column) => columns.includes(column)),
        )
      )
        return yield* PersistenceConfigurationError.make({
          reason: `Missing unique key on ${table.name} (${keys.join(", ")})`,
        });
    }
  },
  (effect, _dialect, table) =>
    effect.pipe(
      Effect.mapError((error) =>
        Schema.is(PersistenceConfigurationError)(error)
          ? error
          : PersistenceConfigurationError.make({
              reason: `Cannot validate SQL storage for ${table.name}`,
            }),
      ),
    ),
);
