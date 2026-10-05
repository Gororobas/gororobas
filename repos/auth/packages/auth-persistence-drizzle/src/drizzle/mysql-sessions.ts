import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import {
  AuthenticationAuthority,
  type SessionUnavailable,
  type PendingAuthentication,
  type SessionRepository,
  type SignedSessionValidity,
  type StatefulSessionPersistence,
  type SessionStepUpPersistence,
} from "@yielded/auth/Sessions";
import type { AnyRelations } from "drizzle-orm";
import type { EffectMysql2Database } from "drizzle-orm/effect-mysql2";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { Database as DatabaseService } from "./mysql-database";
import { nativeDatabase } from "./native-database";
import type {
  AuthenticationAuthorityMapping,
  PendingAuthenticationMapping,
  SignedSessionValidityMapping,
  StatefulSessionMapping,
} from "./session-model";
import { CurrentSessionSql } from "./session-sql";
import {
  coordinateTargetAuthenticationAuthority,
  coordinateTargetPendingAuthentication,
  coordinateTargetSignedSessionValidity,
  coordinateTargetStatefulSessions,
  makeTargetAuthenticationAuthorityServices,
  makeTargetPendingAuthenticationServices,
  makeTargetSignedSessionValidityServices,
  makeTargetStatefulSessionServices,
  sqlClientSessionStandaloneGuard,
  makeTargetSessionStepUpServices,
  coordinateTargetSessionStepUp,
} from "./session-target";
import {
  type TransactionService,
  acquireTransactionService,
  transactionService,
} from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";

type Database = EffectMysql2Database<AnyRelations>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const configuration = (service: TransactionService | undefined) => ({
  mode: "interactive" as const,
  locking: true,
  standaloneGuard: sqlClientSessionStandaloneGuard(service),
});

export const makeMysqlAuthenticationAuthorityServices = <
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
>(
  mapping: AuthenticationAuthorityMapping<Claims, S, C, F, P, NativeId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetAuthenticationAuthorityServices<Claims>(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makeMysqlPendingAuthenticationServices = <
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  P extends AnyMySqlTable,
  F extends AnyMySqlTable,
  NativeId,
>(
  mapping: PendingAuthenticationMapping<Claims, S, C, P, F, NativeId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetPendingAuthenticationServices<Claims>(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makeMysqlStatefulSessionServices = <
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
>(
  mapping: StatefulSessionMapping<Claims, S, C, Session, F, P, NativeId, NativeSessionId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetStatefulSessionServices<Claims>(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makeMysqlSignedSessionValidityServices = <
  S extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
>(
  mapping: SignedSessionValidityMapping<S, T, NativeId, NativeSessionId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetSignedSessionValidityServices(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export function coordinateMysqlAuthenticationAuthority<
  D extends Database,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: AuthenticationAuthorityMapping<Claims, S, C, F, P, NativeId>;
    readonly transaction?: never;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, AuthenticationAuthority> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlAuthenticationAuthority<
  D extends Database,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
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
    readonly mapping: AuthenticationAuthorityMapping<Claims, S, C, F, P, NativeId>;
    readonly transaction: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, AuthenticationAuthority | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlAuthenticationAuthority<
  D extends Database,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
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
    readonly mapping: AuthenticationAuthorityMapping<Claims, S, C, F, P, NativeId>;
    readonly transaction?: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, AuthenticationAuthority> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetAuthenticationAuthority<
      Claims,
      Transaction,
      A,
      E,
      Exclude<R, AuthenticationAuthority>
    >(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: Transaction,
        services: { readonly authenticationAuthority: AuthenticationAuthority["Service"] },
      ) => {
        const provided = Context.make(AuthenticationAuthority, services.authenticationAuthority);
        const work = Effect.provideContext(body, provided);

        return options.transaction === undefined
          ? work
          : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateMysqlPendingAuthentication<
  D extends Database,
  TargetId,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  P extends AnyMySqlTable,
  F extends AnyMySqlTable,
  NativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PendingAuthenticationMapping<NoInfer<Claims>, S, C, P, F, NativeId>;
    readonly target: SuppliedService<TargetId, PendingAuthentication<Claims>>;
    readonly transaction?: never;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlPendingAuthentication<
  D extends Database,
  TargetId,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  P extends AnyMySqlTable,
  F extends AnyMySqlTable,
  NativeId,
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
    readonly mapping: PendingAuthenticationMapping<NoInfer<Claims>, S, C, P, F, NativeId>;
    readonly target: SuppliedService<TargetId, PendingAuthentication<Claims>>;
    readonly transaction: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlPendingAuthentication<
  D extends Database,
  TargetId,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  P extends AnyMySqlTable,
  F extends AnyMySqlTable,
  NativeId,
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
    readonly mapping: PendingAuthenticationMapping<NoInfer<Claims>, S, C, P, F, NativeId>;
    readonly target: SuppliedService<TargetId, PendingAuthentication<Claims>>;
    readonly transaction?: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPendingAuthentication<Claims, Transaction, A, E, Exclude<R, TargetId>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: Transaction,
        services: { readonly pendingAuthentication: PendingAuthentication<Claims> },
      ) => {
        const provided = Context.make(options.target, services.pendingAuthentication);
        const work = Effect.provideContext(body, provided);

        return options.transaction === undefined
          ? work
          : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateMysqlStatefulSessions<
  D extends Database,
  PersistenceId,
  RepositoryId,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: StatefulSessionMapping<
      NoInfer<Claims>,
      S,
      C,
      Session,
      F,
      P,
      NativeId,
      NativeSessionId
    >;
    readonly persistence: SuppliedService<PersistenceId, StatefulSessionPersistence<Claims>>;
    readonly repository: SuppliedService<RepositoryId, SessionRepository>;
    readonly transaction?: never;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, PersistenceId | RepositoryId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlStatefulSessions<
  D extends Database,
  PersistenceId,
  RepositoryId,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
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
    readonly mapping: StatefulSessionMapping<
      NoInfer<Claims>,
      S,
      C,
      Session,
      F,
      P,
      NativeId,
      NativeSessionId
    >;
    readonly persistence: SuppliedService<PersistenceId, StatefulSessionPersistence<Claims>>;
    readonly repository: SuppliedService<RepositoryId, SessionRepository>;
    readonly transaction: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, PersistenceId | RepositoryId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlStatefulSessions<
  D extends Database,
  PersistenceId,
  RepositoryId,
  Claims,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  F extends AnyMySqlTable,
  P extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
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
    readonly mapping: StatefulSessionMapping<
      NoInfer<Claims>,
      S,
      C,
      Session,
      F,
      P,
      NativeId,
      NativeSessionId
    >;
    readonly persistence: SuppliedService<PersistenceId, StatefulSessionPersistence<Claims>>;
    readonly repository: SuppliedService<RepositoryId, SessionRepository>;
    readonly transaction?: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, PersistenceId | RepositoryId> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetStatefulSessions<
      Claims,
      Transaction,
      A,
      E,
      Exclude<R, PersistenceId | RepositoryId>
    >(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: Transaction,
        services: {
          readonly statefulSessionPersistence: StatefulSessionPersistence<Claims>;
          readonly sessionRepository: SessionRepository;
        },
      ) => {
        const provided = Context.make(
          options.persistence,
          services.statefulSessionPersistence,
        ).pipe(Context.add(options.repository, services.sessionRepository));

        const work = Effect.provideContext(body, provided);

        return options.transaction === undefined
          ? work
          : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateMysqlSignedSessionValidity<
  D extends Database,
  TargetId,
  S extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: SignedSessionValidityMapping<S, T, NativeId, NativeSessionId>;
    readonly target: SuppliedService<TargetId, SignedSessionValidity>;
    readonly transaction?: never;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlSignedSessionValidity<
  D extends Database,
  TargetId,
  S extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
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
    readonly mapping: SignedSessionValidityMapping<S, T, NativeId, NativeSessionId>;
    readonly target: SuppliedService<TargetId, SignedSessionValidity>;
    readonly transaction: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlSignedSessionValidity<
  D extends Database,
  TargetId,
  S extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
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
    readonly mapping: SignedSessionValidityMapping<S, T, NativeId, NativeSessionId>;
    readonly target: SuppliedService<TargetId, SignedSessionValidity>;
    readonly transaction?: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetSignedSessionValidity<Transaction, A, E, Exclude<R, TargetId>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: Transaction,
        services: { readonly signedSessionValidity: SignedSessionValidity },
      ) => {
        const provided = Context.make(options.target, services.signedSessionValidity);
        const work = Effect.provideContext(body, provided);

        return options.transaction === undefined
          ? work
          : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

import type { SessionStepUpMapping } from "./step-up-model";

export const makeMysqlSessionStepUpServices = <
  Claims,
  Id,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
>(
  mapping: SessionStepUpMapping<NoInfer<Claims>, S, C, I, Session, T, NativeId, NativeSessionId>,
  target: Context.Service<Id, SessionStepUpPersistence<Claims>>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetSessionStepUpServices(mapping, target, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export function coordinateMysqlSessionStepUp<
  Claims,
  Id,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
  D extends Database,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: SessionStepUpMapping<
      NoInfer<Claims>,
      S,
      C,
      I,
      Session,
      T,
      NativeId,
      NativeSessionId
    >;
    readonly target: SuppliedService<Id, SessionStepUpPersistence<Claims>>;
    readonly transaction?: never;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, Id> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlSessionStepUp<
  Claims,
  Id,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
  D extends Database,
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
    readonly mapping: SessionStepUpMapping<
      NoInfer<Claims>,
      S,
      C,
      I,
      Session,
      T,
      NativeId,
      NativeSessionId
    >;
    readonly target: SuppliedService<Id, SessionStepUpPersistence<Claims>>;
    readonly transaction: SuppliedService<
      TxId,
      NoInfer<Parameters<Parameters<D["transaction"]>[0]>[0]>,
      TxShape
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, Id | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlSessionStepUp<
  Claims,
  Id,
  S extends AnyMySqlTable,
  C extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Session extends AnyMySqlTable,
  T extends AnyMySqlTable,
  NativeId,
  NativeSessionId,
  D extends Database,
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
    readonly mapping: SessionStepUpMapping<
      NoInfer<Claims>,
      S,
      C,
      I,
      Session,
      T,
      NativeId,
      NativeSessionId
    >;
    readonly target: SuppliedService<Id, SessionStepUpPersistence<Claims>>;
    readonly transaction?: SuppliedService<
      TxId,
      NoInfer<Parameters<Parameters<D["transaction"]>[0]>[0]>,
      TxShape
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, Id> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetSessionStepUp<
      Claims,
      Id,
      Parameters<Parameters<D["transaction"]>[0]>[0],
      A,
      E,
      Exclude<R, Id>
    >(
      database,
      options.mapping,
      options.target,
      configuration(transactionService(database)),
      (
        transaction: Parameters<Parameters<D["transaction"]>[0]>[0],
        services: { readonly sessionStepUpPersistence: SessionStepUpPersistence<Claims> },
      ) => {
        const provided = Context.make(options.target, services.sessionStepUpPersistence);
        const work = Effect.provideContext(body, provided);

        return options.transaction === undefined
          ? work
          : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}
