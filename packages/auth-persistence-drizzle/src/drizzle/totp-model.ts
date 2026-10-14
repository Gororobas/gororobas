import type * as Shared from "@yielded/auth-persistence/Adapter";
import { TotpPersistence } from "@yielded/auth/Totp";
import type { SQL, Table } from "drizzle-orm";
import { Effect, Layer } from "effect";

import type { DrizzleTableModel } from "./table-model";
export { requiredTotpConstraints, type TotpMappingSource } from "@yielded/auth-persistence/Adapter";
export type TotpColumn<T extends Table> = DrizzleTableModel<T>["column"];

export type TotpMapping<
  S extends Table,
  F extends Table,
  C extends Table,
  N,
  P extends Table = Table,
> = Shared.TotpMapping<
  DrizzleTableModel<S>,
  DrizzleTableModel<F>,
  DrizzleTableModel<C>,
  N,
  DrizzleTableModel<P>,
  SQL
>;

export interface TotpPersistenceServices {
  readonly totpPersistence: TotpPersistence["Service"];
}

export const totpPersistenceLayer = <E, R>(
  services: Effect.Effect<TotpPersistenceServices, E, R>,
) =>
  Layer.effect(
    TotpPersistence,
    Effect.map(services, (value) => value.totpPersistence),
  );
