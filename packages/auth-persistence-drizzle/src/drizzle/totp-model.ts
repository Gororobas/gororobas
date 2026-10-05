import type { SubjectId } from "@yielded/auth/Schema";
import type {
  AuthenticationRequirement,
  PendingAuthenticationContext,
} from "@yielded/auth/Sessions";
import { type TotpPolicy, TotpPersistence } from "@yielded/auth/Totp";
import type { InferInsertModel, InferSelectModel, SQL, Table } from "drizzle-orm";
import { Effect, Layer } from "effect";

import type { PersistenceMappingError } from "./model";
export type TotpColumn<T extends Table> = Extract<keyof T["_"]["columns"], string>;
export type TotpMappingSource<M, R = never> = M | Effect.Effect<M, PersistenceMappingError, R>;

export const requiredTotpConstraints = {
  factor: "unique(scope)",
  credential: "unique(credentialId)",
  subject: "unique(id)",
} as const;

/** A dedicated encrypted factor row plus the shared authentication credential authority.
 * factorEnabled is the consumer's TOTP requirement bit; central primary methods must
 * read it when choosing their AuthenticationRequirement. Other factor policy is untouched.
 * State JSON stores ciphertext and recovery digests only. The same table retains
 * domain-separated management command tombstones; retain them while command IDs
 * can be replayed. Encoders and current requirement decoding cannot suspend.
 */
export interface TotpMapping<S extends Table, F extends Table, C extends Table, N> {
  readonly moduleId: string;
  readonly policy: TotpPolicy;
  readonly constraints: typeof requiredTotpConstraints;
  readonly subjectIds: {
    readonly toNative: (id: SubjectId) => N;
    readonly toSubject: (id: N) => SubjectId;
  };
  readonly subject: {
    readonly table: S;
    readonly id: TotpColumn<S>;
    readonly securityRevision: TotpColumn<S>;
    readonly factorEnabled: TotpColumn<S>;
    readonly activeCondition: SQL;
    readonly encodeEnabled: (enabled: boolean) => unknown;
    readonly decodeRequirement: (row: InferSelectModel<S>) => AuthenticationRequirement;
  };
  readonly factor: {
    readonly table: F;
    readonly scope: TotpColumn<F>;
    readonly state: TotpColumn<F>;
    readonly version: TotpColumn<F>;
    readonly encodeInsert: (value: {
      readonly scope: string;
      readonly state: string;
      readonly version: string;
    }) => InferInsertModel<F>;
  };
  readonly credential: {
    readonly table: C;
    readonly id: TotpColumn<C>;
    readonly subjectId: TotpColumn<C>;
    readonly revision: TotpColumn<C>;
    readonly status: TotpColumn<C>;
    readonly activeCondition: SQL;
    readonly encodeStatus: (active: boolean) => unknown;
    readonly encodeInsert: (value: {
      readonly credentialId: string;
      readonly subjectId: N;
      readonly revision: string;
      readonly active: boolean;
    }) => InferInsertModel<C>;
  };
  /** Unix epoch milliseconds, evaluated again at the final conditional write. */
  readonly engineNowMillis: SQL;
  /** Required for reset-with-recovery-code. Must assert the exact unconsumed,
   * unexpired, unexhausted pending flow, binding digest and original credential
   * revisions. No request-supplied SQL or external I/O is accepted. */
  readonly pendingCondition?: (target: PendingAuthenticationContext, subjectId: N) => SQL;
}

export interface D1TotpMapping {
  readonly d1: { readonly primary: true };
}

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
