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
import type { EffectPgDatabase as PgliteDatabase } from "drizzle-orm/effect-pglite";
import type { EffectPgDatabase as PostgresDatabase } from "drizzle-orm/effect-postgres";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { nativeDatabase } from "./native-database";
import { Database as DatabaseService } from "./pg-database";
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

type Database = PostgresDatabase<AnyRelations> | PgliteDatabase<AnyRelations>;
type TransactionOf<D extends Database> = Parameters<Parameters<D["transaction"]>[0]>[0];

const configuration = (service: TransactionService | undefined) => ({
  mode: "interactive" as const,
  locking: true,
  standaloneGuard: sqlClientSessionStandaloneGuard(service),
});

export const makePgAuthenticationAuthorityServices = <
  Claims,
  Subject extends AnyPgTable,
  Credential extends AnyPgTable,
  Flow extends AnyPgTable,
  Pending extends AnyPgTable,
  NativeSubjectId,
>(
  mapping: AuthenticationAuthorityMapping<
    Claims,
    Subject,
    Credential,
    Flow,
    Pending,
    NativeSubjectId
  >,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetAuthenticationAuthorityServices<Claims>(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makePgPendingAuthenticationServices = <
  Claims,
  Subject extends AnyPgTable,
  Credential extends AnyPgTable,
  Pending extends AnyPgTable,
  Flow extends AnyPgTable,
  NativeSubjectId,
>(
  mapping: PendingAuthenticationMapping<
    Claims,
    Subject,
    Credential,
    Pending,
    Flow,
    NativeSubjectId
  >,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetPendingAuthenticationServices<Claims>(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makePgStatefulSessionServices = <
  Claims,
  Subject extends AnyPgTable,
  Credential extends AnyPgTable,
  Session extends AnyPgTable,
  Flow extends AnyPgTable,
  Pending extends AnyPgTable,
  NativeSubjectId,
  NativeSessionId,
>(
  mapping: StatefulSessionMapping<
    Claims,
    Subject,
    Credential,
    Session,
    Flow,
    Pending,
    NativeSubjectId,
    NativeSessionId
  >,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetStatefulSessionServices<Claims>(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makePgSignedSessionValidityServices = <
  Subject extends AnyPgTable,
  Tombstone extends AnyPgTable,
  NativeSubjectId,
  NativeSessionId,
>(
  mapping: SignedSessionValidityMapping<Subject, Tombstone, NativeSubjectId, NativeSessionId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetSignedSessionValidityServices(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentSessionSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export function coordinatePgAuthenticationAuthority<
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  F extends AnyPgTable,
  P extends AnyPgTable,
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

export function coordinatePgAuthenticationAuthority<
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  F extends AnyPgTable,
  P extends AnyPgTable,
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
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, AuthenticationAuthority | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinatePgAuthenticationAuthority<
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  F extends AnyPgTable,
  P extends AnyPgTable,
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
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
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
      TransactionOf<D>,
      A,
      E,
      Exclude<R, AuthenticationAuthority>
    >(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: TransactionOf<D>,
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

export function coordinatePgPendingAuthentication<
  TargetId,
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  P extends AnyPgTable,
  F extends AnyPgTable,
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

export function coordinatePgPendingAuthentication<
  TargetId,
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  P extends AnyPgTable,
  F extends AnyPgTable,
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
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinatePgPendingAuthentication<
  TargetId,
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  P extends AnyPgTable,
  F extends AnyPgTable,
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
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPendingAuthentication<Claims, TransactionOf<D>, A, E, Exclude<R, TargetId>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: TransactionOf<D>,
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

export function coordinatePgStatefulSessions<
  PersistenceId,
  RepositoryId,
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  Session extends AnyPgTable,
  F extends AnyPgTable,
  P extends AnyPgTable,
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

export function coordinatePgStatefulSessions<
  PersistenceId,
  RepositoryId,
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  Session extends AnyPgTable,
  F extends AnyPgTable,
  P extends AnyPgTable,
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
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, PersistenceId | RepositoryId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinatePgStatefulSessions<
  PersistenceId,
  RepositoryId,
  Claims,
  D extends Database,
  S extends AnyPgTable,
  C extends AnyPgTable,
  Session extends AnyPgTable,
  F extends AnyPgTable,
  P extends AnyPgTable,
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
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
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
      TransactionOf<D>,
      A,
      E,
      Exclude<R, PersistenceId | RepositoryId>
    >(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: TransactionOf<D>,
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

export function coordinatePgSignedSessionValidity<
  TargetId,
  D extends Database,
  S extends AnyPgTable,
  T extends AnyPgTable,
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

export function coordinatePgSignedSessionValidity<
  TargetId,
  D extends Database,
  S extends AnyPgTable,
  T extends AnyPgTable,
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
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinatePgSignedSessionValidity<
  TargetId,
  D extends Database,
  S extends AnyPgTable,
  T extends AnyPgTable,
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
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetSignedSessionValidity<TransactionOf<D>, A, E, Exclude<R, TargetId>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: TransactionOf<D>,
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

export const makePgSessionStepUpServices = <
  Claims,
  Id,
  S extends AnyPgTable,
  C extends AnyPgTable,
  I extends AnyPgTable,
  Session extends AnyPgTable,
  T extends AnyPgTable,
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

export function coordinatePgSessionStepUp<
  Claims,
  Id,
  S extends AnyPgTable,
  C extends AnyPgTable,
  I extends AnyPgTable,
  Session extends AnyPgTable,
  T extends AnyPgTable,
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

export function coordinatePgSessionStepUp<
  Claims,
  Id,
  S extends AnyPgTable,
  C extends AnyPgTable,
  I extends AnyPgTable,
  Session extends AnyPgTable,
  T extends AnyPgTable,
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
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, Id | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinatePgSessionStepUp<
  Claims,
  Id,
  S extends AnyPgTable,
  C extends AnyPgTable,
  I extends AnyPgTable,
  Session extends AnyPgTable,
  T extends AnyPgTable,
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
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SessionUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, Id> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetSessionStepUp<Claims, Id, TransactionOf<D>, A, E, Exclude<R, Id>>(
      database,
      options.mapping,
      options.target,
      configuration(transactionService(database)),
      (
        transaction: TransactionOf<D>,
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
