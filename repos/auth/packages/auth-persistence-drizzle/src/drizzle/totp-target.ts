import { makeNativeTotpServices, type NativeTotpMapping } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  TotpConfigurationError,
  TotpUnavailable,
  TotpPolicy,
  TotpPersistence,
} from "@yielded/auth/Totp";
import type { Table } from "drizzle-orm";
import { Effect, Schema, type Context, type Crypto } from "effect";

import type { D1BatchStatements } from "./D1BatchStatements";
import type { NativeDriverDatabase, NativeDriverTransaction } from "./driver-types";
import type { PersistenceMappingError } from "./model";
import { nativeClock } from "./native-clock";
import { NativeDatabase, nativeDatabase } from "./native-database";
import {
  nativeTarget,
  coordinateNativeTarget,
  type NativeTargetConfiguration,
} from "./native-target";
import { validateDrizzleStorage } from "./storage-validation";
import type { SuppliedService } from "./SuppliedService";
import type { TotpMapping, TotpMappingSource } from "./totp-model";

const unavailable = () => TotpUnavailable.make({});

/** Driver metadata is compiled once; the factor workflow and commit owner are shared. */
export const makeTotpTarget = <DatabaseId, D extends NativeDriverDatabase>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration: NativeTargetConfiguration,
) => {
  const validate = Effect.fnUntraced(
    function* (mapping: NativeTotpMapping) {
      yield* validateDrizzleStorage(mapping);
      yield* Schema.decodeEffect(TotpPolicy)(mapping.policy);
      if (
        mapping.moduleId.length === 0 ||
        (configuration.mode === "batch" &&
          (mapping.d1?.primary !== true || mapping.subject.requirementColumns === undefined))
      )
        return yield* TotpConfigurationError.make({});
    },
    Effect.mapError(() => TotpConfigurationError.make({})),
  );

  const services = Effect.fnUntraced(function* (mapping: NativeTotpMapping) {
    const target = yield* nativeTarget(configuration);

    return yield* target.provide(makeNativeTotpServices(target.tables, mapping));
  });

  const mapping = <S extends Table, F extends Table, C extends Table, N, P extends Table>(
    value: TotpMapping<S, F, C, N, P>,
  ): NativeTotpMapping =>
    ({
      ...value,
      ...(value.pending === undefined
        ? {}
        : { pending: { ...value.pending, clock: nativeClock(value.pending.clock) } }),
    }) as unknown as NativeTotpMapping;

  function coordinateTotpPersistence<
    DB extends D,
    S extends Table,
    F extends Table,
    C extends Table,
    N,
    P extends Table,
    A,
    E,
    R,
    DE,
    DR,
    RS = never,
  >(
    acquire: Effect.Effect<DB, DE, DR>,
    options: {
      readonly mapping: TotpMappingSource<TotpMapping<S, F, C, N, P>, RS>;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DE | TotpUnavailable | TotpConfigurationError | PersistenceMappingError,
    Exclude<R, TotpPersistence | D1BatchStatements> | DR | RS | LifecycleHooks | Crypto.Crypto
  >;
  function coordinateTotpPersistence<
    DB extends D,
    S extends Table,
    F extends Table,
    C extends Table,
    N,
    P extends Table,
    A,
    E,
    R,
    DE,
    DR,
    TxId,
    TxShape,
    RS = never,
  >(
    acquire: Effect.Effect<DB, DE, DR>,
    options: {
      readonly mapping: TotpMappingSource<TotpMapping<S, F, C, N, P>, RS>;
      readonly transaction: SuppliedService<TxId, NoInfer<NativeDriverTransaction<DB>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DE | TotpUnavailable | TotpConfigurationError | PersistenceMappingError,
    | Exclude<R, TotpPersistence | D1BatchStatements | TxId>
    | DR
    | RS
    | LifecycleHooks
    | Crypto.Crypto
  >;
  function coordinateTotpPersistence<
    DB extends D,
    S extends Table,
    F extends Table,
    C extends Table,
    N,
    P extends Table,
    A,
    E,
    R,
    DE,
    DR,
    TxId,
    TxShape,
    RS = never,
  >(
    acquire: Effect.Effect<DB, DE, DR>,
    options: {
      readonly mapping: TotpMappingSource<TotpMapping<S, F, C, N, P>, RS>;
      readonly transaction?: SuppliedService<TxId, NoInfer<NativeDriverTransaction<DB>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ) {
    return Effect.gen(function* () {
      const value = mapping(
        yield* Effect.isEffect(options.mapping) ? options.mapping : Effect.succeed(options.mapping),
      );

      const database = yield* nativeDatabase(acquire);

      yield* validate(value).pipe(Effect.provideService(NativeDatabase, database));

      return yield* coordinateNativeTarget(
        unavailable,
        database,
        configuration,
        services(value),
        (
          transaction: NativeDriverTransaction<DB>,
          bound,
        ): Effect.Effect<A, E, Exclude<R, TotpPersistence>> => {
          const work = body.pipe(Effect.provideService(TotpPersistence, bound.totpPersistence));

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      );
    });
  }

  return {
    coordinateTotpPersistence,
    makeTotpPersistenceServices: <
      S extends Table,
      F extends Table,
      C extends Table,
      N,
      P extends Table = Table,
      RS = never,
    >(
      source: TotpMappingSource<TotpMapping<S, F, C, N, P>, RS>,
    ) =>
      Effect.gen(function* () {
        const value = mapping(yield* Effect.isEffect(source) ? source : Effect.succeed(source));

        yield* validate(value);

        return yield* services(value);
      }).pipe(Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService))),
  };
};
