import type * as Shared from "@yielded/auth-persistence/Adapter";
import { hooksLayer } from "@yielded/auth/Persistence";
import { PhonePersistence, PhoneSignInTargets } from "@yielded/auth/PhoneOtp";
import type { SQL, Table } from "drizzle-orm";
import { Effect, Layer } from "effect";

import type { PersistenceMappingError } from "./model";
import type { ProofPersistenceMapping } from "./proof-model";
import type { DrizzleTableModel } from "./table-model";

export { requiredPhoneConstraints } from "@yielded/auth-persistence/Adapter";
export type PhoneMappingSource<M, R = never> = M | Effect.Effect<M, PersistenceMappingError, R>;

export type PhoneMapping<
  S extends Table,
  I extends Table,
  C extends Table,
  P extends Table,
  N,
> = Omit<
  Shared.PhoneMapping<
    DrizzleTableModel<S>,
    DrizzleTableModel<I>,
    DrizzleTableModel<C>,
    DrizzleTableModel<P>,
    N,
    SQL
  >,
  "proofs"
> & { readonly proofs: ProofPersistenceMapping<P, S, N> };

export type AnyPhoneMapping = PhoneMapping<Table, Table, Table, Table, unknown>;

export interface PhonePersistenceServices {
  readonly phonePersistence: PhonePersistence["Service"];
  readonly phoneSignInTargets: PhoneSignInTargets["Service"];
}

/** Bundle phone storage and lookup with empty hook defaults. */
export const phonePersistenceLayer = <E, R>(
  services: Effect.Effect<PhonePersistenceServices, E, R>,
) =>
  Layer.unwrap(
    Effect.map(services, (value) =>
      Layer.mergeAll(
        Layer.succeed(PhonePersistence, value.phonePersistence),
        Layer.succeed(PhoneSignInTargets, value.phoneSignInTargets),
      ),
    ),
  ).pipe(Layer.provide(hooksLayer));
