import type {
  PasswordPreparedReady,
  PasswordPreparedReservation,
  PasswordPreparedVersion,
} from "@yielded/auth/Password";
import type { InferInsertModel, InferSelectModel, SQL, Table } from "drizzle-orm";
import type { Effect } from "effect";

import type { PersistenceMappingError } from "./model";
import type { D1PasswordPersistenceMapping, PasswordPersistenceMapping } from "./password-model";
import type {
  D1ProofPersistenceMapping,
  ProofPersistenceMapping,
  RequiredProofConstraints,
} from "./proof-model";

type ColumnKey<T extends Table> = Extract<keyof T["_"]["columns"], string>;
export type PasswordPreparedState = "Preparing" | "Ready" | "Consumed" | "Cancelled" | "Expired";

/** The retained intent is also its nonrefundable admission charge. Scalar identity,
 * scope and timing columns survive sensitive snapshot/digest erasure. */
export interface PasswordPreparedIntentTable<Intent extends Table, NativeSubjectId> {
  readonly table: Intent;
  readonly moduleId: ColumnKey<Intent>;
  readonly intentId: ColumnKey<Intent>;
  readonly commandId: ColumnKey<Intent>;
  readonly subjectId: ColumnKey<Intent>;
  readonly action: ColumnKey<Intent>;
  readonly generation: ColumnKey<Intent>;
  readonly version: ColumnKey<Intent>;
  readonly state: ColumnKey<Intent>;
  readonly digest: ColumnKey<Intent>;
  readonly snapshot: ColumnKey<Intent>;
  readonly identifierScope: ColumnKey<Intent>;
  readonly createdAt: ColumnKey<Intent>;
  readonly admittedAt: ColumnKey<Intent>;
  readonly admissionRetainUntil: ColumnKey<Intent>;
  readonly preparationExpiresAt: ColumnKey<Intent>;
  readonly expiresAt: ColumnKey<Intent>;
  readonly retainUntil: ColumnKey<Intent>;
  readonly states: Readonly<
    Record<PasswordPreparedState, InferSelectModel<Intent>[ColumnKey<Intent>]>
  >;
  readonly encodeInsert: (input: {
    readonly reservation: PasswordPreparedReservation;
    readonly nativeSubjectId: NativeSubjectId;
    readonly identifierScope: string;
    readonly admittedAtMillis: number;
    readonly admissionRetainUntilMillis: number;
    /** Bounded private core codec output; contains a salted verifier for Change/Reset. */
    readonly snapshot: string;
  }) => InferInsertModel<Intent>;
  readonly encodeReady: (input: {
    readonly ready: PasswordPreparedReady;
    readonly snapshot: string;
  }) => Partial<InferInsertModel<Intent>>;
  /** Erase snapshot and digest, preserving every identity/scope/time column. */
  readonly encodeTerminal: (
    state: Exclude<PasswordPreparedState, "Preparing" | "Ready">,
  ) => Partial<InferInsertModel<Intent>>;
}

/** One permanent row per configured module; never one row per attacker input.
 * Native owners lock this before subject → identifier → sorted credentials → intent.
 * It serializes admission and maintenance without process-local locks. */
export interface PasswordPreparedAdmissionTable<Admission extends Table> {
  readonly table: Admission;
  readonly moduleId: ColumnKey<Admission>;
  readonly intentId: ColumnKey<Admission>;
  readonly admittedAt: ColumnKey<Admission>;
  readonly admissionRetainUntil: ColumnKey<Admission>;
  readonly encodeInsert: (moduleId: string) => InferInsertModel<Admission>;
}

export const requiredPasswordPreparedConstraints = {
  admission: "unique(admission.moduleId)",
  intent: "unique(intent.moduleId,intent.intentId)",
  command: "unique(intent.moduleId,intent.commandId)",
  digest: "unique(intent.digest)",
} as const;

export type RequiredPasswordPreparedConstraints = typeof requiredPasswordPreparedConstraints;

export interface PasswordPreparedPersistenceMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Attempt extends Table,
  RateScope extends Table,
  Charge extends Table,
  Command extends Table,
  Intent extends Table,
  Admission extends Table,
  NativeSubjectId,
> {
  readonly password: PasswordPersistenceMapping<
    Subject,
    Identifier,
    Credential,
    AuthorityCredential,
    Attempt,
    RateScope,
    Charge,
    Command,
    NativeSubjectId
  >;
  readonly intent: PasswordPreparedIntentTable<Intent, NativeSubjectId>;
  readonly admission: PasswordPreparedAdmissionTable<Admission>;
  readonly constraints: RequiredPasswordPreparedConstraints;
  readonly allocateVersion?: Effect.Effect<PasswordPreparedVersion, PersistenceMappingError>;
  /** Required by synchronous owners, invoked inside their actual transactionSync. */
  readonly allocateVersionSync?: () => PasswordPreparedVersion;
}

export type D1PasswordPreparedPersistenceMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Attempt extends Table,
  RateScope extends Table,
  Charge extends Table,
  Command extends Table,
  Intent extends Table,
  Admission extends Table,
  NativeSubjectId,
> = PasswordPreparedPersistenceMapping<
  Subject,
  Identifier,
  Credential,
  AuthorityCredential,
  Attempt,
  RateScope,
  Charge,
  Command,
  Intent,
  Admission,
  NativeSubjectId
> & {
  /** Convert a stored native instant to epoch milliseconds in the same SQL engine. */
  readonly admissionClock: { readonly toMillis: (instant: SQL) => SQL };
  readonly password: D1PasswordPersistenceMapping<
    Subject,
    Identifier,
    Credential,
    AuthorityCredential,
    Attempt,
    RateScope,
    Charge,
    Command,
    NativeSubjectId
  >;
};

/** Optional real proof completion authority. Request/delivery/abuse capabilities
 * are not required to complete the original continuation. */
export type PasswordPreparedProofMapping<
  Series extends Table,
  Continuation extends Table,
  Command extends Table,
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  NativeSubjectId,
> = Pick<
  ProofPersistenceMapping<
    Table,
    Series,
    Table,
    Continuation,
    Table,
    Table,
    Table,
    Command,
    Subject,
    Identifier,
    Credential,
    NativeSubjectId
  >,
  | "series"
  | "continuation"
  | "command"
  | "authority"
  | "scopeKeys"
  | "encodeInstant"
  | "decodeInstant"
  | "allocateVersion"
  | "allocateVersionSync"
  | "isSeriesConflict"
  | "isCommandConflict"
  | "d1"
> & {
  readonly constraints: Pick<
    RequiredProofConstraints,
    "series" | "continuationId" | "continuationDigest" | "command"
  >;
};

export type D1PasswordPreparedProofMapping<
  Series extends Table,
  Continuation extends Table,
  Command extends Table,
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  NativeSubjectId,
> = Pick<
  D1ProofPersistenceMapping<
    Table,
    Series,
    Table,
    Continuation,
    Table,
    Table,
    Table,
    Command,
    Subject,
    Identifier,
    Credential,
    NativeSubjectId
  >,
  Exclude<
    keyof PasswordPreparedProofMapping<
      Series,
      Continuation,
      Command,
      Subject,
      Identifier,
      Credential,
      NativeSubjectId
    >,
    "constraints"
  >
> & {
  readonly constraints: PasswordPreparedProofMapping<
    Series,
    Continuation,
    Command,
    Subject,
    Identifier,
    Credential,
    NativeSubjectId
  >["constraints"];
};

export type AnyPasswordPreparedPersistenceMapping = PasswordPreparedPersistenceMapping<
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  unknown
>;
