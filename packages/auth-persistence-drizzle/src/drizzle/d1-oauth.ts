import type { D1Client } from "@effect/sql-d1/D1Client";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  OAuthAccountsPersistence,
  OAuthRegistrationIntents,
  OAuthSignInPersistence,
  OAuthUnavailable,
} from "@yielded/auth/OAuth";
import type { AnyRelations } from "drizzle-orm";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Effect, Context } from "effect";

import { Database as DatabaseService } from "./d1-database";
import { makeD1Owner } from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { nativeDatabase } from "./native-database";
import type {
  OAuthAccountsMapping,
  OAuthD1Mapping,
  OAuthRegistrationAuthority,
  OAuthRegistrationIntentMapping,
  OAuthRegistrationMapping,
  OAuthSignInMapping,
} from "./oauth-model";
import {
  type OAuthCoordinatorError,
  coordinateTargetOAuthAccounts,
  coordinateTargetOAuthSignIn,
  coordinateTargetOAuthRegistrationIntents,
  coordinateTargetOAuthRegistration,
  makeTargetOAuthRegistrationIntentServices,
  makeTargetOAuthRegistrationServices,
  makeTargetOAuthSignInServices,
  makeTargetOAuthAccountsServices,
} from "./oauth-target";
import type { SuppliedService } from "./SuppliedService";
type SQLiteTable = AnySQLiteTable<{ dialect: "sqlite" }>;
type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
const unavailable = () => OAuthUnavailable.make({});

const configuration = {
  mode: "batch" as const,
  dialect: "sqlite" as const,
  locking: false,
  standaloneGuard: () => Effect.void,
};

export const makeD1OAuthAccountsServices = <
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  F extends SQLiteTable,
  T extends SQLiteTable,
  U extends SQLiteTable,
  N,
>(
  mapping: OAuthAccountsMapping<S, O, C, AC, F, T, U, N> & OAuthD1Mapping,
) =>
  makeTargetOAuthAccountsServices(mapping, configuration).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makeD1OAuthSignInServices = <
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  F extends SQLiteTable,
  N,
>(
  mapping: OAuthSignInMapping<S, O, C, AC, F, N> & OAuthD1Mapping,
) =>
  makeTargetOAuthSignInServices(mapping, configuration).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makeD1OAuthRegistrationIntentServices = <
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  F extends SQLiteTable,
  T extends SQLiteTable,
  I extends SQLiteTable,
  N,
>(
  mapping: OAuthRegistrationIntentMapping<S, O, C, AC, F, T, I, N> & OAuthD1Mapping,
) =>
  makeTargetOAuthRegistrationIntentServices(mapping, configuration).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export const makeD1OAuthRegistrationServices = <
  Registration,
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  T extends SQLiteTable,
  I extends SQLiteTable,
  R extends SQLiteTable,
  N,
>(
  mapping: OAuthRegistrationMapping<Registration, S, O, C, AC, T, I, R, N> & OAuthD1Mapping,
) =>
  makeTargetOAuthRegistrationServices<Registration>(mapping, configuration).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export function coordinateD1OAuthSignIn<
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  F extends SQLiteTable,
  N,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: { readonly mapping: OAuthSignInMapping<S, O, C, AC, F, N> & OAuthD1Mapping },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  OAuthCoordinatorError<E> | DatabaseError,
  Exclude<R, OAuthSignInPersistence | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetOAuthSignIn<
      never,
      A,
      E | OAuthUnavailable,
      Exclude<R, OAuthSignInPersistence | D1BatchStatements>
    >(database, options.mapping, configuration, (_transaction, services, append) =>
      Effect.gen(function* () {
        const nativeCollector = D1BatchStatements.of({
          append: (statement) => Effect.sync(() => append(statement)),
        });

        const owner = yield* makeD1Owner(unavailable()).pipe(
          Effect.provideService(D1BatchStatements, nativeCollector),
        );

        const original = services.oauthSignInPersistence;

        const service: OAuthSignInPersistence["Service"] = {
          issue: (input, prepare) => owner.run(original.issue(input, prepare)),
          claim: (input, prepare) => owner.run(original.claim(input, prepare)),
          settle: (input, prepare) => owner.run(original.settle(input, prepare)),
          cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
        };

        const provided = Context.make(OAuthSignInPersistence, service).pipe(
          Context.add(D1BatchStatements, owner.collector),
        );

        return yield* owner.close(Effect.provideContext(body, provided));
      }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1OAuthRegistrationIntents<
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  F extends SQLiteTable,
  T extends SQLiteTable,
  I extends SQLiteTable,
  N,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: OAuthRegistrationIntentMapping<S, O, C, AC, F, T, I, N> & OAuthD1Mapping;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  OAuthCoordinatorError<E> | DatabaseError,
  Exclude<R, OAuthRegistrationIntents | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetOAuthRegistrationIntents<
      never,
      A,
      E | OAuthUnavailable,
      Exclude<R, OAuthRegistrationIntents | D1BatchStatements>
    >(database, options.mapping, configuration, (_transaction, services, append) =>
      Effect.gen(function* () {
        const nativeCollector = D1BatchStatements.of({
          append: (statement) => Effect.sync(() => append(statement)),
        });

        const owner = yield* makeD1Owner(unavailable()).pipe(
          Effect.provideService(D1BatchStatements, nativeCollector),
        );

        const original = services.oauthRegistrationIntents;

        const service: OAuthRegistrationIntents["Service"] = {
          settle: (input, prepare) => owner.run(original.settle(input, prepare)),
        };

        const provided = Context.make(OAuthRegistrationIntents, service).pipe(
          Context.add(D1BatchStatements, owner.collector),
        );

        return yield* owner.close(Effect.provideContext(body, provided));
      }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1OAuthAccounts<
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  F extends SQLiteTable,
  T extends SQLiteTable,
  U extends SQLiteTable,
  N,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: { readonly mapping: OAuthAccountsMapping<S, O, C, AC, F, T, U, N> & OAuthD1Mapping },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  OAuthCoordinatorError<E> | DatabaseError,
  Exclude<R, OAuthAccountsPersistence | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetOAuthAccounts<
      never,
      A,
      E | OAuthUnavailable,
      Exclude<R, OAuthAccountsPersistence | D1BatchStatements>
    >(database, options.mapping, configuration, (_transaction, services, append) =>
      Effect.gen(function* () {
        const nativeCollector = D1BatchStatements.of({
          append: (statement) => Effect.sync(() => append(statement)),
        });

        const owner = yield* makeD1Owner(unavailable()).pipe(
          Effect.provideService(D1BatchStatements, nativeCollector),
        );

        const original = services.oauthAccountsPersistence;

        const service: OAuthAccountsPersistence["Service"] = {
          capture: (input) => owner.run(original.capture(input)),
          issue: (input, prepare) => owner.run(original.issue(input, prepare)),
          preflight: (input) => owner.run(original.preflight(input)),
          claim: (input, prepare) => owner.run(original.claim(input, prepare)),
          settle: (input, prepare) => owner.run(original.settle(input, prepare)),
          inspectUnlink: (input) => owner.run(original.inspectUnlink(input)),
          unlink: (input, prepare) => owner.run(original.unlink(input, prepare)),
          cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
        };

        const provided = Context.make(OAuthAccountsPersistence, service).pipe(
          Context.add(D1BatchStatements, owner.collector),
        );

        return yield* owner.close(Effect.provideContext(body, provided));
      }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1OAuthRegistration<
  TargetId,
  Registration,
  S extends SQLiteTable,
  O extends SQLiteTable,
  C extends SQLiteTable,
  AC extends SQLiteTable,
  T extends SQLiteTable,
  I extends SQLiteTable,
  Rq extends SQLiteTable,
  N,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: OAuthRegistrationMapping<NoInfer<Registration>, S, O, C, AC, T, I, Rq, N> &
      OAuthD1Mapping;
    readonly target: SuppliedService<TargetId, OAuthRegistrationAuthority<Registration>>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  OAuthCoordinatorError<E> | DatabaseError,
  Exclude<R, TargetId | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetOAuthRegistration<
      Registration,
      never,
      A,
      E | OAuthUnavailable,
      Exclude<R, TargetId | D1BatchStatements>
    >(database, options.mapping, configuration, (_transaction, services, append) =>
      Effect.gen(function* () {
        const nativeCollector = D1BatchStatements.of({
          append: (statement) => Effect.sync(() => append(statement)),
        });

        const owner = yield* makeD1Owner(unavailable()).pipe(
          Effect.provideService(D1BatchStatements, nativeCollector),
        );

        const original = services.registrationAuthority;

        const service: OAuthRegistrationAuthority<Registration> = {
          read: (input) => owner.run(original.read(input)),
          inspect: (input) => owner.run(original.inspect(input)),
          register: (input, prepare) => owner.run(original.register(input, prepare)),
          cleanup: (input, prepare) => owner.run(original.cleanup(input, prepare)),
        };

        const provided = Context.make(options.target, service).pipe(
          Context.add(D1BatchStatements, owner.collector),
        );

        return yield* owner.close(Effect.provideContext(body, provided));
      }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}
