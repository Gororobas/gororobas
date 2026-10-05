import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import { EmailAddressPersistence, type EmailUnavailable } from "@yielded/auth/Email";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
/* oxlint-disable no-explicit-any -- proof mapping tables are independently typed by the proof owner; this driver forwards them unchanged to the shared target. */
import type { AnyRelations } from "drizzle-orm";
import type { EffectLibsqlDatabase } from "drizzle-orm/effect-libsql";
import type { EffectSQLiteBunDatabase } from "drizzle-orm/effect-sqlite-bun";
import type { EffectSQLiteDoDatabase as DODatabase } from "drizzle-orm/effect-sqlite-do";
import type { EffectSQLiteNodeDatabase as NodeDatabase } from "drizzle-orm/effect-sqlite-node";
import type { EffectSQLiteWasmDatabase as WasmDatabase } from "drizzle-orm/effect-sqlite-wasm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import type {
  EmailAddressMapping,
  EmailRegistrationMapping,
  EmailSignInMapping,
} from "./email-model";
import type { EmailRegistrationAuthority } from "./email-registration";
import { CurrentEmailSql } from "./email-sql";
import type { EmailSqlQuery } from "./email-sql";
import {
  coordinateTargetEmailAddress,
  coordinateTargetEmailRegistration,
  makeTargetEmailAddressServices,
  makeTargetEmailRegistrationServices,
  makeTargetEmailSignInServices,
  type EmailTargetConfiguration,
} from "./email-target";
import { nativeDatabase } from "./native-database";
import type { ProofPersistenceMapping } from "./proof-model";
import type { ProofSqlQuery } from "./proof-sql";
import {
  type TransactionService,
  acquireTransactionService,
  transactionService,
} from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";

export type SqliteEmailDatabase =
  | NodeDatabase<AnyRelations>
  | EffectSQLiteBunDatabase<AnyRelations>
  | EffectLibsqlDatabase<AnyRelations>
  | WasmDatabase<AnyRelations>
  | DODatabase<AnyRelations>;

type TransactionOf<D extends SqliteEmailDatabase> = Parameters<Parameters<D["transaction"]>[0]>[0];
type ProofMapping = ProofPersistenceMapping<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

export const sqliteEmailConfiguration = (
  mode: "interactive" | "synchronous",
  standaloneGuard: EmailTargetConfiguration["standaloneGuard"],
  proofStandaloneGuard: EmailTargetConfiguration["proof"]["standaloneGuard"],
  coordinatorGuard?: EmailTargetConfiguration["coordinatorGuard"],
): EmailTargetConfiguration => ({
  mode,
  locking: false,
  standaloneGuard,
  ...(coordinatorGuard === undefined ? {} : { coordinatorGuard }),
  generatedSubjectRows: (query: EmailSqlQuery) => query.returning(),
  proof: {
    mode,
    locking: false,
    standaloneGuard: proofStandaloneGuard,
    insertIfAbsent: (query: ProofSqlQuery) => query.onConflictDoNothing(),
  },
});

export const makeSqliteEmailTarget = <
  DatabaseId,
  D extends SqliteEmailDatabase,
  Synchronous extends boolean = false,
>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration:
    | EmailTargetConfiguration
    | ((service: TransactionService | undefined) => EmailTargetConfiguration),
) => {
  const configurationFor = (database: D) =>
    typeof configuration === "function"
      ? configuration(transactionService(database))
      : configuration;

  const standaloneConfiguration =
    typeof configuration === "function"
      ? Effect.map(acquireTransactionService(databaseService), configuration)
      : Effect.succeed(configuration);

  function coordinateEmailAddress<
    Database extends D,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    M extends AnySQLiteTable,
    NativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: EmailAddressMapping<S, I, C, AC, M, NativeId>;
      readonly proofMapping: ProofMapping;
      readonly transaction?: never;
    },
    body: Effect.Effect<Out, E, Synchronous extends true ? NoInfer<EmailAddressPersistence> : R>,
  ): Effect.Effect<
    Out,
    E | EmailUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, EmailAddressPersistence>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateEmailAddress<
    Database extends D,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    M extends AnySQLiteTable,
    NativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: EmailAddressMapping<S, I, C, AC, M, NativeId>;
      readonly proofMapping: ProofMapping;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<
      Out,
      E,
      Synchronous extends true ? NoInfer<EmailAddressPersistence | TxId> : R
    >,
  ): Effect.Effect<
    Out,
    E | EmailUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, EmailAddressPersistence | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateEmailAddress<
    Database extends D,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    M extends AnySQLiteTable,
    NativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: EmailAddressMapping<S, I, C, AC, M, NativeId>;
      readonly proofMapping: ProofMapping;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<Out, E, R>,
  ): Effect.Effect<
    Out,
    E | EmailUnavailable | HookConfigurationError | SqlError | DatabaseError,
    Exclude<R, EmailAddressPersistence> | LifecycleHooks | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetEmailAddress<
        TransactionOf<Database>,
        Out,
        E,
        Exclude<R, EmailAddressPersistence>
      >(
        database,
        options.mapping,
        options.proofMapping,
        configurationFor(database),
        (
          transaction: TransactionOf<Database>,
          services: { readonly emailAddressPersistence: EmailAddressPersistence["Service"] },
        ) => {
          const provided = Context.make(EmailAddressPersistence, services.emailAddressPersistence);
          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }
  function coordinateEmailRegistration<
    Database extends D,
    TargetId,
    Registration,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    Rq extends AnySQLiteTable,
    NativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: EmailRegistrationMapping<NoInfer<Registration>, S, I, C, AC, Rq, NativeId>;
      readonly proofMapping: ProofMapping;
      readonly target: SuppliedService<TargetId, EmailRegistrationAuthority<Registration>>;
      readonly transaction?: never;
    },
    body: Effect.Effect<Out, E, Synchronous extends true ? NoInfer<TargetId> : R>,
  ): Effect.Effect<
    Out,
    E | EmailUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, TargetId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateEmailRegistration<
    Database extends D,
    TargetId,
    Registration,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    Rq extends AnySQLiteTable,
    NativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: EmailRegistrationMapping<NoInfer<Registration>, S, I, C, AC, Rq, NativeId>;
      readonly proofMapping: ProofMapping;
      readonly target: SuppliedService<TargetId, EmailRegistrationAuthority<Registration>>;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<Out, E, Synchronous extends true ? NoInfer<TargetId | TxId> : R>,
  ): Effect.Effect<
    Out,
    E | EmailUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, TargetId | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateEmailRegistration<
    Database extends D,
    TargetId,
    Registration,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    Rq extends AnySQLiteTable,
    NativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: EmailRegistrationMapping<NoInfer<Registration>, S, I, C, AC, Rq, NativeId>;
      readonly proofMapping: ProofMapping;
      readonly target: SuppliedService<TargetId, EmailRegistrationAuthority<Registration>>;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<Out, E, R>,
  ): Effect.Effect<
    Out,
    E | EmailUnavailable | HookConfigurationError | SqlError | DatabaseError,
    Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetEmailRegistration<
        Registration,
        TransactionOf<Database>,
        Out,
        E,
        Exclude<R, TargetId>
      >(
        database,
        options.mapping,
        options.proofMapping,
        configurationFor(database),
        (
          transaction: TransactionOf<Database>,
          services: { readonly registrationAuthority: EmailRegistrationAuthority<Registration> },
        ) => {
          const provided = Context.make(options.target, services.registrationAuthority);
          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  return {
    makeEmailSignInServices: <
      S extends AnySQLiteTable,
      I extends AnySQLiteTable,
      C extends AnySQLiteTable,
      NativeId,
    >(
      mapping: EmailSignInMapping<S, I, C, NativeId>,
    ) =>
      Effect.flatMap(standaloneConfiguration, (configuration) =>
        makeTargetEmailSignInServices(mapping, configuration),
      ).pipe(
        Effect.provideServiceEffect(CurrentEmailSql, nativeDatabase(databaseService)),
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    makeEmailAddressServices: <
      S extends AnySQLiteTable,
      I extends AnySQLiteTable,
      C extends AnySQLiteTable,
      AC extends AnySQLiteTable,
      M extends AnySQLiteTable,
      NativeId,
    >(
      mapping: EmailAddressMapping<S, I, C, AC, M, NativeId>,
      proofMapping: ProofMapping,
    ) =>
      Effect.flatMap(standaloneConfiguration, (configuration) =>
        makeTargetEmailAddressServices(mapping, proofMapping, configuration),
      ).pipe(
        Effect.provideServiceEffect(CurrentEmailSql, nativeDatabase(databaseService)),
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinateEmailAddress,
    makeEmailRegistrationServices: <
      Registration,
      S extends AnySQLiteTable,
      I extends AnySQLiteTable,
      C extends AnySQLiteTable,
      AC extends AnySQLiteTable,
      Rq extends AnySQLiteTable,
      NativeId,
    >(
      mapping: EmailRegistrationMapping<Registration, S, I, C, AC, Rq, NativeId>,
      proofMapping: ProofMapping,
    ) =>
      Effect.flatMap(standaloneConfiguration, (configuration) =>
        makeTargetEmailRegistrationServices<Registration>(mapping, proofMapping, configuration),
      ).pipe(
        Effect.provideServiceEffect(CurrentEmailSql, nativeDatabase(databaseService)),
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinateEmailRegistration,
  };
};
