import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { ProofPersistence, type ProofUnavailable } from "@yielded/auth/Proofs";
import type { Table } from "drizzle-orm";
import type * as Context from "effect/Context";
import type * as Digest from "effect/crypto/Digest";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";

import type { NativeDriverDatabase, NativeDriverTransaction } from "./driver-types";
import { NativeDatabase, nativeDatabase } from "./native-database";
import type { NativeTargetConfiguration } from "./native-target";
import type { AnyProofPersistenceMapping, ProofPersistenceMapping } from "./proof-model";
import {
  coordinateTargetProofPersistence,
  makeTargetProofPersistenceServices,
} from "./proof-target";
import type { SuppliedService } from "./SuppliedService";

/** Physical driver selection; the proof workflow has one implementation.
 * Erase only foreign table/ID callback variance at the validated mapping boundary;
 * decoded proof and subject values still pass through their owning codecs. */
export const makeProofTarget = <DatabaseId, D extends NativeDriverDatabase>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration: NativeTargetConfiguration,
) => {
  function coordinateProofPersistence<
    Database extends D,
    Proof extends Table,
    Subject extends Table,
    NativeId,
    A,
    E,
    R,
    DE,
    DR,
  >(
    acquire: Effect.Effect<Database, DE, DR>,
    options: {
      readonly mapping: ProofPersistenceMapping<Proof, Subject, NativeId>;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DE | ProofUnavailable,
    Exclude<R, ProofPersistence> | DR | LifecycleHooks | (SecureRandom.SecureRandom | Digest.Digest)
  >;
  function coordinateProofPersistence<
    Database extends D,
    Proof extends Table,
    Subject extends Table,
    NativeId,
    A,
    E,
    R,
    DE,
    DR,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DE, DR>,
    options: {
      readonly mapping: ProofPersistenceMapping<Proof, Subject, NativeId>;
      readonly transaction: SuppliedService<
        TxId,
        NoInfer<NativeDriverTransaction<Database>>,
        TxShape
      >;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DE | ProofUnavailable,
    | Exclude<R, ProofPersistence | TxId>
    | DR
    | LifecycleHooks
    | (SecureRandom.SecureRandom | Digest.Digest)
  >;
  function coordinateProofPersistence<
    Database extends D,
    Proof extends Table,
    Subject extends Table,
    NativeId,
    A,
    E,
    R,
    DE,
    DR,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DE, DR>,
    options: {
      readonly mapping: ProofPersistenceMapping<Proof, Subject, NativeId>;
      readonly transaction?: SuppliedService<
        TxId,
        NoInfer<NativeDriverTransaction<Database>>,
        TxShape
      >;
    },
    body: Effect.Effect<A, E, R>,
  ) {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetProofPersistence(
        database,
        options.mapping as unknown as AnyProofPersistenceMapping,
        configuration,
        (
          transaction: NativeDriverTransaction<Database>,
          services,
        ): Effect.Effect<A, E, Exclude<R, ProofPersistence>> => {
          const work = Effect.provideService(body, ProofPersistence, services.proofPersistence);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ),
    );
  }

  return {
    makeProofPersistenceServices: <Proof extends Table, Subject extends Table, NativeId>(
      mapping: ProofPersistenceMapping<Proof, Subject, NativeId>,
    ) =>
      makeTargetProofPersistenceServices(
        mapping as unknown as AnyProofPersistenceMapping,
        configuration,
      ).pipe(Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService))),
    coordinateProofPersistence,
  };
};
