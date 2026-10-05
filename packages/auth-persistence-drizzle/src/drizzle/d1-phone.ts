import type { D1Client } from "@effect/sql-d1/D1Client";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  PhoneOtpUnavailable as PhoneUnavailable,
  PhoneAdmission,
  PhonePersistence,
  PhoneSignInTargets,
} from "@yielded/auth/PhoneOtp";
import type { AnyRelations } from "drizzle-orm";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect } from "effect";

import { Database as DatabaseService } from "./d1-database";
import { makeD1Owner } from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { nativeDatabase } from "./native-database";
import type { D1PhoneMapping, PhoneMapping, PhoneMappingSource } from "./phone-model";
import { coordinateTargetPhone, makePhoneTarget, type PhoneCoordinatorError } from "./phone-target";
type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
type Table = AnySQLiteTable;

const configuration = {
  mode: "batch" as const,
  dialect: "sqlite" as const,
  locking: false,
  standaloneGuard: () => Effect.void,
};

/** Reads use a primary D1 session; observations and expiry are asserted in the same batch. */
const target = makePhoneTarget<DatabaseService, Database, Table, D1PhoneMapping>(
  DatabaseService,
  configuration,
);

export const { makePhonePersistenceServices } = target;

export const coordinatePhonePersistence = <
  D extends Database,
  S extends Table,
  I extends Table,
  F extends Table,
  C extends Table,
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
    readonly mapping: PhoneMappingSource<PhoneMapping<S, I, C, F, N> & D1PhoneMapping, RSetup>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  PhoneCoordinatorError<E> | DatabaseError,
  | Exclude<R, PhonePersistence | PhoneAdmission | PhoneSignInTargets | D1BatchStatements>
  | LifecycleHooks
  | RSetup
  | DatabaseRequirements
> =>
  Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPhone(
      database,
      options.mapping,
      configuration,
      (_transaction, services, append) =>
        Effect.gen(function* () {
          const original = services.phonePersistence;

          const nativeCollector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(PhoneUnavailable.make({})).pipe(
            Effect.provideService(D1BatchStatements, nativeCollector),
          );

          const service: PhonePersistence["Service"] = {
            target: (input) => owner.run(original.target(input)),
            mutate: (input, prepare) => owner.run(original.mutate(input, prepare)),
          };

          const provided = Context.make(PhonePersistence, service).pipe(
            Context.add(D1BatchStatements, owner.collector),
            Context.add(PhoneAdmission, {
              admit: (input) => owner.run(services.phoneAdmission.admit(input)),
              cleanup: (input) => owner.run(services.phoneAdmission.cleanup(input)),
            }),
            Context.add(PhoneSignInTargets, {
              lookup: (input) => owner.run(services.phoneSignInTargets.lookup(input)),
            }),
          );

          return yield* owner.close(Effect.provideContext(body, provided));
        }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
