import type { D1Client } from "@effect/sql-d1/D1Client";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  PasskeyUnavailable,
  PasskeyPersistence,
  PasskeyManagementPersistence,
} from "@yielded/auth/Passkey";
import type { AnyRelations } from "drizzle-orm";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Effect, Context } from "effect";

import { Database as DatabaseService } from "./d1-database";
import { makeD1Owner } from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { nativeDatabase } from "./native-database";
import { makePasskeyTarget } from "./passkey-drivers";
import type {
  D1PasskeyMapping,
  PasskeyCredentialMapping,
  PasskeyMappingSource,
  PasskeyPersistenceMapping,
} from "./passkey-model";
import type { PasskeyRegistrationCeremonyMapping } from "./passkey-registration-ceremony-model";
import {
  type PasskeyCoordinatorError,
  coordinateTargetPasskey,
  coordinateTargetPasskeyRegistration,
} from "./passkey-target";

type Table = AnySQLiteTable<{ dialect: "sqlite" }>;
type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };

const unavailable = () => PasskeyUnavailable.make({});

const configuration = {
  mode: "batch" as const,
  dialect: "sqlite" as const,
  locking: false,
  standaloneGuard: () => Effect.void,
};

const target = makePasskeyTarget<DatabaseService, Database, Table, D1PasskeyMapping>(
  DatabaseService,
  configuration,
);

export const {
  makePasskeyCredentialServices,
  makePasskeyEnrollmentContextServices,
  makePasskeyPersistenceServices,
  makePasskeyRegistrationCeremonyServices,
  makePasskeyManagementServices,
  makePasskeyRegistrationServices,
} = target;

export function coordinatePasskeyPersistence<
  D extends Database,
  S extends Table,
  C extends Table,
  F extends Table,
  O extends Table,
  H extends Table,
  M extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  N,
  A,
  E,
  R,
  RSetup = never,
  DatabaseError = never,
  DatabaseRequirements = never,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasskeyMappingSource<
      PasskeyPersistenceMapping<
        PasskeyCredentialMapping<S, C, F, O, H, N>,
        M,
        Flow,
        Admission,
        Charge,
        N
      > &
        D1PasskeyMapping,
      RSetup
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  PasskeyCoordinatorError<E> | DatabaseError,
  | Exclude<R, PasskeyPersistence | D1BatchStatements>
  | LifecycleHooks
  | DatabaseRequirements
  | RSetup
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPasskey(database, options.mapping, configuration, (_, services, append) =>
      Effect.gen(function* () {
        const original = services.passkeyPersistence;

        const nativeCollector = D1BatchStatements.of({
          append: (statement) => Effect.sync(() => append(statement)),
        });

        const owner = yield* makeD1Owner(unavailable()).pipe(
          Effect.provideService(D1BatchStatements, nativeCollector),
        );

        const service: PasskeyPersistence["Service"] = {
          issue: (input, prepare) => owner.run(original.issue(input, prepare)),
          context: (input) => owner.run(original.context(input)),
          claim: (input, prepare) => owner.run(original.claim(input, prepare)),
          settle: (input, prepare) => owner.run(original.settle(input, prepare)),
          cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
        };

        const provided = Context.make(PasskeyPersistence, service).pipe(
          Context.add(D1BatchStatements, owner.collector),
        );

        return yield* owner.close(Effect.provideContext(body, provided));
      }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinatePasskeyRegistrationCeremony<
  D extends Database,
  M extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  Intent extends Table,
  H extends Table,
  A,
  E,
  R,
  RSetup = never,
  DatabaseError = never,
  DatabaseRequirements = never,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasskeyMappingSource<
      PasskeyRegistrationCeremonyMapping<M, Flow, Admission, Charge, Intent, H> & D1PasskeyMapping,
      RSetup
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  PasskeyCoordinatorError<E> | DatabaseError,
  | Exclude<R, PasskeyPersistence | D1BatchStatements>
  | LifecycleHooks
  | DatabaseRequirements
  | RSetup
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPasskeyRegistration(
      database,
      options.mapping,
      configuration,
      (_, services, append) =>
        Effect.gen(function* () {
          const original = services.passkeyPersistence;

          const nativeCollector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(unavailable()).pipe(
            Effect.provideService(D1BatchStatements, nativeCollector),
          );

          const service: PasskeyPersistence["Service"] = {
            issue: (input, prepare) => owner.run(original.issue(input, prepare)),
            context: (input) => owner.run(original.context(input)),
            claim: (input, prepare) => owner.run(original.claim(input, prepare)),
            settle: (input, prepare) => owner.run(original.settle(input, prepare)),
            cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
          };

          const provided = Context.make(PasskeyPersistence, service).pipe(
            Context.add(D1BatchStatements, owner.collector),
          );

          return yield* owner.close(Effect.provideContext(body, provided));
        }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

import type {
  PasskeyManagementMapping,
  PasskeyRegistrationMapping,
  PasskeyRegistrationServices,
  PasskeyRegistrationWriter,
} from "./passkey-write-model";
import {
  coordinateTargetPasskeyManagement,
  coordinateTargetPasskeyRegistrationWriter,
} from "./passkey-write-target";

export function coordinatePasskeyManagement<
  D extends Database,
  S extends Table,
  C extends Table,
  F extends Table,
  O extends Table,
  H extends Table,
  M extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  Command extends Table,
  N,
  A,
  E,
  R,
  RSetup = never,
  DatabaseError = never,
  DatabaseRequirements = never,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasskeyMappingSource<
      PasskeyManagementMapping<S, C, F, O, H, M, Flow, Admission, Charge, Command, N> &
        D1PasskeyMapping,
      RSetup
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  PasskeyCoordinatorError<E> | DatabaseError,
  | Exclude<R, PasskeyPersistence | PasskeyManagementPersistence | D1BatchStatements>
  | LifecycleHooks
  | DatabaseRequirements
  | RSetup
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPasskeyManagement(
      database,
      options.mapping,
      configuration,
      (_, services, append) =>
        Effect.gen(function* () {
          const collector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(unavailable()).pipe(
            Effect.provideService(D1BatchStatements, collector),
          );

          const original = services.passkeyPersistence;

          const persistence: PasskeyPersistence["Service"] = {
            issue: (input, prepare) => owner.run(original.issue(input, prepare)),
            context: (input) => owner.run(original.context(input)),
            claim: (input, prepare) => owner.run(original.claim(input, prepare)),
            settle: (input, prepare) => owner.run(original.settle(input, prepare)),
            cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
          };

          const authority = services.passkeyManagementPersistence;

          const service: PasskeyManagementPersistence["Service"] = {
            list: (input) => owner.run(authority.list(input)),
            inspectRemove: (input) => owner.run(authority.inspectRemove(input)),
            issueEnrollment: (input, prepare) =>
              owner.run(authority.issueEnrollment(input, prepare)),
            completeEnrollment: (input, prepare) =>
              owner.run(authority.completeEnrollment(input, prepare)),
            rename: (input, prepare) => owner.run(authority.rename(input, prepare)),
            remove: (input, prepare) => owner.run(authority.remove(input, prepare)),
          };

          const context = Context.make(PasskeyPersistence, persistence).pipe(
            Context.add(PasskeyManagementPersistence, service),
            Context.add(D1BatchStatements, owner.collector),
          );

          return yield* owner.close(Effect.provideContext(body, context));
        }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinatePasskeyRegistration<
  D extends Database,
  S extends Table,
  C extends Table,
  F extends Table,
  O extends Table,
  H extends Table,
  M extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  Intent extends Table,
  N,
  Value,
  AuthorityId,
  A,
  E,
  R,
  RSetup = never,
  DatabaseError = never,
  DatabaseRequirements = never,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasskeyMappingSource<
      PasskeyRegistrationMapping<S, C, F, O, H, M, Flow, Admission, Charge, Intent, N, Value> &
        D1PasskeyMapping,
      RSetup
    >;
    readonly authority: Context.Key<AuthorityId, PasskeyRegistrationWriter<Value>>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  PasskeyCoordinatorError<E> | DatabaseError,
  | Exclude<R, PasskeyPersistence | AuthorityId | D1BatchStatements>
  | LifecycleHooks
  | DatabaseRequirements
  | RSetup
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPasskeyRegistrationWriter(
      database,
      options.mapping,
      configuration,
      (_, services: PasskeyRegistrationServices<Value>, append) =>
        Effect.gen(function* () {
          const collector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(unavailable()).pipe(
            Effect.provideService(D1BatchStatements, collector),
          );

          const original = services.passkeyPersistence;

          const persistence: PasskeyPersistence["Service"] = {
            issue: (input, prepare) => owner.run(original.issue(input, prepare)),
            context: (input) => owner.run(original.context(input)),
            claim: (input, prepare) => owner.run(original.claim(input, prepare)),
            settle: (input, prepare) => owner.run(original.settle(input, prepare)),
            cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
          };

          const authority = services.passkeyRegistrationAuthority;

          const service: PasskeyRegistrationWriter<Value> = {
            inspect: (input) => owner.run(authority.inspect(input)),
            issueRegistration: (input, prepare) =>
              owner.run(authority.issueRegistration(input, prepare)),
            completeRegistration: (input, prepare) =>
              owner.run(authority.completeRegistration(input, prepare)),
          };

          const context = Context.make(PasskeyPersistence, persistence).pipe(
            Context.add(options.authority, service),
            Context.add(D1BatchStatements, owner.collector),
          );

          return yield* owner.close(Effect.provideContext(body, context));
        }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}
