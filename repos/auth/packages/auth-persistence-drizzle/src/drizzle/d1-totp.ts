import type { D1Client } from "@effect/sql-d1/D1Client";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { TotpUnavailable, TotpPersistence } from "@yielded/auth/Totp";
import type { AnyRelations } from "drizzle-orm";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect } from "effect";

import { Database as DatabaseService } from "./d1-database";
import { makeD1Owner } from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { nativeDatabase } from "./native-database";
import type { D1TotpMapping, TotpMapping, TotpMappingSource } from "./totp-model";
import { coordinateTargetTotp, makeTotpTarget, type TotpCoordinatorError } from "./totp-target";
type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
type Table = AnySQLiteTable;

const configuration = {
  mode: "batch" as const,
  dialect: "sqlite" as const,
  locking: false,
  standaloneGuard: () => Effect.void,
};

/** Reads use a primary D1 session; observations and expiry are asserted in the same batch. */
const target = makeTotpTarget<DatabaseService, Database, Table, D1TotpMapping>(
  DatabaseService,
  configuration,
);

export const { makeTotpPersistenceServices } = target;

export const coordinateTotpPersistence = <
  D extends Database,
  S extends Table,
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
  options: { readonly mapping: TotpMappingSource<TotpMapping<S, F, C, N> & D1TotpMapping, RSetup> },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  TotpCoordinatorError<E> | DatabaseError,
  Exclude<R, TotpPersistence | D1BatchStatements> | LifecycleHooks | RSetup | DatabaseRequirements
> =>
  Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetTotp(
      database,
      options.mapping,
      configuration,
      (_transaction, services, append) =>
        Effect.gen(function* () {
          const original = services.totpPersistence;

          const nativeCollector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => append(statement)),
          });

          const owner = yield* makeD1Owner(TotpUnavailable.make({})).pipe(
            Effect.provideService(D1BatchStatements, nativeCollector),
          );

          const service: TotpPersistence["Service"] = {
            snapshot: (input) => owner.run(original.snapshot(input)),
            mutate: (input, prepare) => owner.run(original.mutate(input, prepare)),
          };

          const provided = Context.make(TotpPersistence, service).pipe(
            Context.add(D1BatchStatements, owner.collector),
          );

          return yield* owner.close(Effect.provideContext(body, provided));
        }),
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
