import { Option, Schema, SchemaGetter } from "effect";

import { PersistenceMappingError } from "./mapping-error";

const SqlInteger = Schema.Union([
  Schema.Int,
  Schema.BigInt,
  Schema.String.check(Schema.isPattern(/^-?\d+$/)),
]).pipe(
  Schema.decodeTo(Schema.Int, {
    decode: SchemaGetter.transform(Number),
    encode: SchemaGetter.passthrough(),
  }),
);

const decodeInteger = Schema.decodeUnknownOption(SqlInteger);

export type Dialect = "pg" | "sqlite";
export type Row = Readonly<Record<string, unknown>>;

export interface Compiler {
  readonly dialect: Dialect;
  readonly parameters: unknown[];
}

export const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';

export class Fragment {
  constructor(
    readonly render: (compiler: Compiler) => string,
    readonly decode: (value: unknown) => unknown = (value) => value,
  ) {}

  mapWith(decode: (value: unknown) => unknown): Fragment {
    return new Fragment(this.render, decode);
  }

  as(_name: string): Fragment {
    return this;
  }

  getSQL(): Fragment {
    return this;
  }
}

export interface ColumnOptions {
  readonly name: string;
  readonly type: "text" | "integer" | "boolean";
  readonly nullable?: boolean;
}

export class Column extends Fragment {
  constructor(
    readonly tableName: string,
    readonly options: ColumnOptions,
    readonly schema?: string,
  ) {
    super(
      () =>
        `${schema === undefined ? "" : identifier(schema) + "."}${identifier(tableName)}.${identifier(options.name)}`,
      (value) => {
        if (value === null) return value;
        if (options.type === "boolean") {
          if (value === true || value === 1) return true;
          if (value === false || value === 0) return false;
          throw PersistenceMappingError.make({ operation: "decode", cause: "Invalid SQL boolean" });
        }
        if (options.type === "integer") {
          const number = decodeInteger(value);

          if (Option.isSome(number)) return number.value;
          throw PersistenceMappingError.make({
            operation: "decode",
            cause: "SQL integer is outside the safe range",
          });
        }

        return value;
      },
    );
  }

  mapToDriverValue(value: unknown): unknown {
    return value;
  }
}

/** Plain SQL identifiers and column representations, independent of an ORM. */
export class Table extends Fragment {
  readonly columns: Readonly<Record<string, Column>>;

  constructor(
    readonly name: string,
    columns: Readonly<Record<string, ColumnOptions>>,
    readonly unique: ReadonlyArray<ReadonlyArray<string>>,
    readonly schema?: string,
  ) {
    super(() => (schema === undefined ? "" : identifier(schema) + ".") + identifier(name));
    this.columns = Object.fromEntries(
      Object.entries(columns).map(([key, options]) => [key, new Column(name, options, schema)]),
    );
  }
}
