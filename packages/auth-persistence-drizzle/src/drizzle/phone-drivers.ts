import type { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  PhonePersistence,
  PhoneSignInTargets,
  type PhoneConfigurationError,
  type PhoneOtpUnavailable,
} from "@yielded/auth/PhoneOtp";
import type { Table } from "drizzle-orm";
import type * as Context from "effect/Context";
import type * as Digest from "effect/crypto/Digest";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";

import type { NativeDriverDatabase, NativeDriverTransaction } from "./driver-types";
import { NativeDatabase, nativeDatabase } from "./native-database";
import type { NativeTargetConfiguration } from "./native-target";
import type { AnyPhoneMapping, PhoneMapping } from "./phone-model";
import {
  coordinateTargetPhonePersistence,
  makeTargetPhonePersistenceServices,
} from "./phone-target";
import type { SuppliedService } from "./SuppliedService";

/** Physical driver selection; the phone workflow has one implementation.
 * Erase only foreign table/ID callback variance at the validated mapping boundary;
 * decoded phone and subject values still pass through their owning codecs. */
export const makePhoneTarget = <DatabaseId, D extends NativeDriverDatabase>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration: NativeTargetConfiguration,
) => {
  function coordinatePhonePersistence<
    Database extends D,
    Subject extends Table,
    Identifier extends Table,
    Credential extends Table,
    Proof extends Table,
    NativeId,
    A,
    E,
    R,
    DE,
    DR,
  >(
    acquire: Effect.Effect<Database, DE, DR>,
    options: {
      readonly mapping: PhoneMapping<Subject, Identifier, Credential, Proof, NativeId>;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DE | PhoneOtpUnavailable | PhoneConfigurationError,
    | Exclude<R, PhonePersistence | PhoneSignInTargets>
    | DR
    | LifecycleHooks
    | (SecureRandom.SecureRandom | Digest.Digest)
  >;
  function coordinatePhonePersistence<
    Database extends D,
    Subject extends Table,
    Identifier extends Table,
    Credential extends Table,
    Proof extends Table,
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
      readonly mapping: PhoneMapping<Subject, Identifier, Credential, Proof, NativeId>;
      readonly transaction: SuppliedService<
        TxId,
        NoInfer<NativeDriverTransaction<Database>>,
        TxShape
      >;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | DE | PhoneOtpUnavailable | PhoneConfigurationError,
    | Exclude<R, PhonePersistence | PhoneSignInTargets | TxId>
    | DR
    | LifecycleHooks
    | (SecureRandom.SecureRandom | Digest.Digest)
  >;
  function coordinatePhonePersistence<
    Database extends D,
    Subject extends Table,
    Identifier extends Table,
    Credential extends Table,
    Proof extends Table,
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
      readonly mapping: PhoneMapping<Subject, Identifier, Credential, Proof, NativeId>;
      readonly transaction?: SuppliedService<
        TxId,
        NoInfer<NativeDriverTransaction<Database>>,
        TxShape
      >;
    },
    body: Effect.Effect<A, E, R>,
  ) {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPhonePersistence(
        database,
        options.mapping as unknown as AnyPhoneMapping,
        configuration,
        (
          transaction: NativeDriverTransaction<Database>,
          services,
        ): Effect.Effect<A, E, Exclude<Exclude<R, PhonePersistence>, PhoneSignInTargets>> => {
          const work = body.pipe(
            Effect.provideService(PhonePersistence, services.phonePersistence),
            Effect.provideService(PhoneSignInTargets, services.phoneSignInTargets),
          );

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ),
    );
  }

  return {
    makePhonePersistenceServices: <
      Subject extends Table,
      Identifier extends Table,
      Credential extends Table,
      Proof extends Table,
      NativeId,
    >(
      mapping: PhoneMapping<Subject, Identifier, Credential, Proof, NativeId>,
    ) =>
      makeTargetPhonePersistenceServices(mapping as unknown as AnyPhoneMapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinatePhonePersistence,
  };
};
