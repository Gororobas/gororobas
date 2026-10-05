import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  OAuthConnectedPersistence,
  OAuthConnectedRevocations,
  OAuthUnavailable,
} from "@yielded/auth/OAuth";
import type { Table } from "drizzle-orm";
import { Effect, Context } from "effect";

import { makeD1Owner } from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { nativeDatabase } from "./native-database";
import type {
  OAuthConnectedMapping,
  OAuthConnectedRevocationMapping,
} from "./oauth-connected-model";
import {
  coordinateTargetOAuthConnected,
  coordinateTargetOAuthConnectedRevocations,
  makeTargetOAuthConnectedServices,
  makeTargetOAuthConnectedRevocationServices,
} from "./oauth-connected-target";
import { type OAuthCoordinatorError, type OAuthTargetConfiguration } from "./oauth-target";
import type { SuppliedService } from "./SuppliedService";
// oxlint-disable-next-line no-explicit-any -- inspect the actual installed native transaction callback without erasing it.
type TransactionOf<D> = D extends { readonly transaction: (...args: any[]) => any }
  ? Parameters<Parameters<D["transaction"]>[0]>[0]
  : never;
const unavailable = () => OAuthUnavailable.make({});

export const makeOAuthConnectedTarget = <
  DatabaseId,
  Database,
  Family extends Table,
  Extra = {},
  Synchronous extends boolean = false,
>(
  databaseService: Context.Service<DatabaseId, Database>,
  configuration: OAuthTargetConfiguration,
) => {
  function coordinateOAuthConnected<
    D extends Database,
    S extends Family,
    AC extends Family,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    UA extends Family,
    DC extends Family,
    N,
    J extends Family,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedMapping<S, AC, T, O, F, G, C, H, UA, DC, N, J> & Extra;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<OAuthConnectedPersistence> : R>,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, OAuthConnectedPersistence>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateOAuthConnected<
    D extends Database,
    S extends Family,
    AC extends Family,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    UA extends Family,
    DC extends Family,
    N,
    J extends Family,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedMapping<S, AC, T, O, F, G, C, H, UA, DC, N, J> & Extra;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
    },
    body: Effect.Effect<
      A,
      E,
      Synchronous extends true ? NoInfer<OAuthConnectedPersistence | TxId> : R
    >,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, OAuthConnectedPersistence | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateOAuthConnected<
    D extends Database,
    S extends Family,
    AC extends Family,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    UA extends Family,
    DC extends Family,
    N,
    J extends Family,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedMapping<S, AC, T, O, F, G, C, H, UA, DC, N, J> & Extra;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    Exclude<R, OAuthConnectedPersistence> | LifecycleHooks | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetOAuthConnected<TransactionOf<D>, A, E, Exclude<R, OAuthConnectedPersistence>>(
        database,
        options.mapping,
        configuration,
        (
          transaction: TransactionOf<D>,
          services: { readonly oauthConnectedPersistence: OAuthConnectedPersistence["Service"] },
        ) => {
          const provided = Context.make(
            OAuthConnectedPersistence,
            services.oauthConnectedPersistence,
          );

          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }
  function coordinateOAuthConnectedRevocations<
    D extends Database,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    J extends Family,
    N,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedRevocationMapping<T, O, F, G, C, H, J, N> & Extra;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<OAuthConnectedRevocations> : R>,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, OAuthConnectedRevocations>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateOAuthConnectedRevocations<
    D extends Database,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    J extends Family,
    N,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedRevocationMapping<T, O, F, G, C, H, J, N> & Extra;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
    },
    body: Effect.Effect<
      A,
      E,
      Synchronous extends true ? NoInfer<OAuthConnectedRevocations | TxId> : R
    >,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, OAuthConnectedRevocations | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateOAuthConnectedRevocations<
    D extends Database,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    J extends Family,
    N,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedRevocationMapping<T, O, F, G, C, H, J, N> & Extra;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    Exclude<R, OAuthConnectedRevocations> | LifecycleHooks | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetOAuthConnectedRevocations<
        TransactionOf<D>,
        A,
        E,
        Exclude<R, OAuthConnectedRevocations>
      >(
        database,
        options.mapping,
        configuration,
        (
          transaction: TransactionOf<D>,
          services: { readonly oauthConnectedRevocations: OAuthConnectedRevocations["Service"] },
        ) => {
          const provided = Context.make(
            OAuthConnectedRevocations,
            services.oauthConnectedRevocations,
          );

          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  return {
    makeOAuthConnectedServices: <
      S extends Family,
      AC extends Family,
      T extends Family,
      O extends Family,
      F extends Family,
      G extends Family,
      C extends Family,
      H extends Family,
      UA extends Family,
      DC extends Family,
      N,
      J extends Family = never,
    >(
      mapping: OAuthConnectedMapping<S, AC, T, O, F, G, C, H, UA, DC, N, J> & Extra,
    ) =>
      makeTargetOAuthConnectedServices(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    makeOAuthConnectedRevocationServices: <
      T extends Family,
      O extends Family,
      F extends Family,
      G extends Family,
      C extends Family,
      H extends Family,
      J extends Family,
      N,
    >(
      mapping: OAuthConnectedRevocationMapping<T, O, F, G, C, H, J, N> & Extra,
    ) =>
      makeTargetOAuthConnectedRevocationServices(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinateOAuthConnected,
    coordinateOAuthConnectedRevocations,
  };
};

export const makeD1OAuthConnectedTarget = <DatabaseId, Database, Family extends Table, Extra>(
  databaseService: Context.Service<DatabaseId, Database>,
  configuration: OAuthTargetConfiguration,
) => {
  function coordinateOAuthConnected<
    S extends Family,
    AC extends Family,
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    UA extends Family,
    DC extends Family,
    N,
    J extends Family,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: OAuthConnectedMapping<S, AC, T, O, F, G, C, H, UA, DC, N, J> & Extra;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    | Exclude<R, OAuthConnectedPersistence | D1BatchStatements>
    | LifecycleHooks
    | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetOAuthConnected<
        Database,
        A,
        E | OAuthUnavailable,
        Exclude<R, OAuthConnectedPersistence | D1BatchStatements>
      >(database, options.mapping, configuration, (_tx, services, append) =>
        Effect.gen(function* () {
          const original = services.oauthConnectedPersistence;

          const nativeCollector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(unavailable()).pipe(
            Effect.provideService(D1BatchStatements, nativeCollector),
          );

          const service: OAuthConnectedPersistence["Service"] = {
            claimSignIn: (input, prepare) => owner.run(original.claimSignIn(input, prepare)),
            inspectSignIn: (input) => owner.run(original.inspectSignIn(input)),
            settleSignIn: (input, prepare) => owner.run(original.settleSignIn(input, prepare)),
            capture: (input) => owner.run(original.capture(input)),
            issue: (input, prepare) => owner.run(original.issue(input, prepare)),
            prepare: (input, prepare) => owner.run(original.prepare(input, prepare)),
            inspectPrepared: (input) => owner.run(original.inspectPrepared(input)),
            preflight: (input) => owner.run(original.preflight(input)),
            claim: (input, prepare) => owner.run(original.claim(input, prepare)),
            inspectGrant: (input) => owner.run(original.inspectGrant(input)),
            settle: (input, prepare) => owner.run(original.settle(input, prepare)),
            list: (input) => owner.run(original.list(input)),
            inspectDisconnect: (input) => owner.run(original.inspectDisconnect(input)),
            disconnect: (input, prepare) => owner.run(original.disconnect(input, prepare)),
            inspectAccess: (input) => owner.run(original.inspectAccess(input)),
            claimRefresh: (input, prepare) => owner.run(original.claimRefresh(input, prepare)),
            settleRefresh: (input, prepare) => owner.run(original.settleRefresh(input, prepare)),
            admitUse: (input, prepare) => owner.run(original.admitUse(input, prepare)),
            cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
          };

          const provided = Context.make(OAuthConnectedPersistence, service).pipe(
            Context.add(D1BatchStatements, owner.collector),
          );

          return yield* owner.close(Effect.provideContext(body, provided));
        }),
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }
  function coordinateOAuthConnectedRevocations<
    T extends Family,
    O extends Family,
    F extends Family,
    G extends Family,
    C extends Family,
    H extends Family,
    J extends Family,
    N,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: { readonly mapping: OAuthConnectedRevocationMapping<T, O, F, G, C, H, J, N> & Extra },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    OAuthCoordinatorError<E> | DatabaseError,
    | Exclude<R, OAuthConnectedRevocations | D1BatchStatements>
    | LifecycleHooks
    | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetOAuthConnectedRevocations<
        Database,
        A,
        E | OAuthUnavailable,
        Exclude<R, OAuthConnectedRevocations | D1BatchStatements>
      >(database, options.mapping, configuration, (_tx, services, append) =>
        Effect.gen(function* () {
          const original = services.oauthConnectedRevocations;

          const nativeCollector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(unavailable()).pipe(
            Effect.provideService(D1BatchStatements, nativeCollector),
          );

          const service: OAuthConnectedRevocations["Service"] = {
            claim: (input, prepare) => owner.run(original.claim(input, prepare)),
            settle: (input, prepare) => owner.run(original.settle(input, prepare)),
          };

          const provided = Context.make(OAuthConnectedRevocations, service).pipe(
            Context.add(D1BatchStatements, owner.collector),
          );

          return yield* owner.close(Effect.provideContext(body, provided));
        }),
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  return {
    ...makeOAuthConnectedTarget<DatabaseId, Database, Family, Extra>(
      databaseService,
      configuration,
    ),
    coordinateOAuthConnected,
    coordinateOAuthConnectedRevocations,
  };
};
