import type { Effect } from "effect";
import type { Statement } from "effect/sql/Statement";

import type { PersistenceMappingError } from "./mapping-error";
import type { NativeDatabase } from "./transaction-kernel";

/** Adapter-owned table metadata. No driver or ORM type enters the shared models. */
export interface TableModel {
  readonly table: object;
  readonly column: string;
  readonly select: Record<string, unknown>;
  readonly insert: Record<string, unknown>;
}

/** Kernels erase the physical table handle after the adapter validates its
 * mapping. Rows and insert values still pass through their declared codecs. */
export interface AnyTableModel extends TableModel {
  // oxlint-disable-next-line no-explicit-any -- physical compiler handle, never a domain value or an Effect error.
  readonly table: any;
}

/** Opaque compiler expression; only the owning compiler interprets its contents. */
export interface SqlExpression {
  readonly getSQL: () => SqlExpression;
}

export interface SqlFragment extends SqlExpression {
  readonly mapWith: (decode: (value: unknown) => unknown) => SqlFragment;
  readonly as: (name: string) => SqlExpression;
}

export interface SqlColumn extends SqlExpression {
  readonly mapToDriverValue: (value: unknown) => unknown;
}

/** Native query failures stay in E until the owning kernel reports and redacts
 * them. Drivers may carry a more specific tag; the cause remains available to
 * the application's constraint classifier and is never public telemetry. */
export interface QueryFailure {
  readonly _tag: string;
  readonly cause: unknown;
}

type Predicate<Fragment> = (
  ...parts: ReadonlyArray<SqlExpression | undefined>
) => Fragment | undefined;
type Comparison<Fragment> = (left: unknown, right: unknown) => Fragment;

/** Compiler operations shared by the SQL state machines; no driver is acquired here. */
export interface QueryOperations<
  Fragment extends SqlFragment = SqlFragment,
  Column extends SqlColumn = SqlColumn,
> {
  /** Acquisition-only validation; adapters provide their captured root database. */
  readonly validateStorage?: (
    mapping: unknown,
  ) => Effect.Effect<void, PersistenceMappingError, NativeDatabase>;
  readonly and: Predicate<Fragment>;
  readonly or: Predicate<Fragment>;
  readonly balancedD1And: Predicate<Fragment>;
  readonly asc: (value: unknown) => Fragment;
  readonly eq: Comparison<Fragment>;
  readonly gt: Comparison<Fragment>;
  readonly gte: Comparison<Fragment>;
  readonly lte: Comparison<Fragment>;
  readonly inArray: (value: unknown, values: ReadonlyArray<unknown>) => Fragment;
  readonly isNull: (value: unknown) => Fragment;
  readonly notExists: (value: SqlExpression) => Fragment;
  readonly sql: {
    (parts: TemplateStringsArray, ...values: ReadonlyArray<unknown>): Fragment;
    readonly param: (value: unknown, column: SqlColumn) => unknown;
    readonly join: (values: ReadonlyArray<unknown>, separator: SqlExpression) => Fragment;
  };
  readonly getTableColumns: (table: object) => Readonly<Record<string, Column>>;
  readonly column: (table: object, key: string) => Column;
  readonly updateValues: (
    entries: ReadonlyArray<readonly [string, unknown]>,
  ) => Record<string, unknown>;
  readonly compactD1GeneratedStatement: <A extends object>(
    client: {
      readonly unsafe: <Row extends object>(
        sql: string,
        params?: ReadonlyArray<unknown>,
      ) => Statement<Row>;
    },
    statement: Statement<A>,
    invalid: () => unknown,
  ) => Statement<A>;
}
