import {
  type PasskeyCeremony,
  type PasskeyCredential,
  type PasskeyMethodPolicy,
  PasskeyCredentials,
  PasskeyEnrollmentContext,
  PasskeyPersistence,
} from "@yielded/auth/Passkey";
import type { SubjectId } from "@yielded/auth/Schema";
import { Effect, Layer } from "effect";

import type { TableModel as Table, SqlExpression } from "../query-operations";
import type { PersistenceMappingError } from "./common";

export type PasskeyColumn<T extends Table> = T["column"];

export type PasskeyMappingSource<M, RSetup = never> =
  | M
  | Effect.Effect<M, PersistenceMappingError, RSetup>;

export interface PasskeyCredentialServices {
  readonly passkeyCredentials: PasskeyCredentials["Service"];
}

export interface PasskeyPersistenceServices {
  readonly passkeyPersistence: PasskeyPersistence["Service"];
}

export interface PasskeyEnrollmentContextServices {
  readonly passkeyEnrollmentContext: PasskeyEnrollmentContext["Service"];
}

export const passkeyCredentialsLayer = <E, R>(
  services: Effect.Effect<PasskeyCredentialServices, E, R>,
): Layer.Layer<PasskeyCredentials, E, R> =>
  Layer.effect(
    PasskeyCredentials,
    Effect.map(services, (value) => value.passkeyCredentials),
  );

export const passkeyPersistenceLayer = <E, R>(
  services: Effect.Effect<PasskeyPersistenceServices, E, R>,
): Layer.Layer<PasskeyPersistence, E, R> =>
  Layer.effect(
    PasskeyPersistence,
    Effect.map(services, (value) => value.passkeyPersistence),
  );

export const passkeyEnrollmentContextLayer = <E, R>(
  services: Effect.Effect<PasskeyEnrollmentContextServices, E, R>,
): Layer.Layer<PasskeyEnrollmentContext, E, R> =>
  Layer.effect(
    PasskeyEnrollmentContext,
    Effect.map(services, (value) => value.passkeyEnrollmentContext),
  );

/** Native IDs roundtrip exactly; protocol IDs and authentication references are
 * different identities. These callbacks never suspend inside an owner. */
export interface PasskeySubjectIdCodec<N> {
  readonly toNative: (id: SubjectId) => N;
  readonly toSubject: (id: N) => SubjectId;
  readonly equals: (left: N, right: N) => boolean;
}

export interface PasskeyClock<Expression extends SqlExpression = SqlExpression> {
  readonly encodeInstant: (millis: number) => unknown;
  readonly decodeInstant: (value: unknown) => number;
  readonly engineNowMillis: Expression;
  readonly toMillis: (expression: Expression) => Expression;
  readonly fromMillis: (expression: Expression) => Expression;
}

export interface PasskeySubjectReadTable<
  T extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: T["table"];
  readonly id: PasskeyColumn<T>;
  readonly status: PasskeyColumn<T>;
  readonly securityRevision: PasskeyColumn<T>;
  readonly decodeId: (row: Readonly<Partial<T["select"]>>) => N;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: Expression;
}

export interface PasskeyFactorReadTable<
  T extends Table,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: T["table"];
  readonly subjectId: PasskeyColumn<T>;
  readonly credentialId: PasskeyColumn<T>;
  readonly revision: PasskeyColumn<T>;
  readonly status: PasskeyColumn<T>;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: Expression;
}

/** decode uses only these declared columns. Counter columns are native integral
 * numbers; BS may use a consumer enum. Name/creation metadata is not required. */
export interface PasskeyCredentialReadTable<
  T extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: T["table"];
  readonly credentialId: PasskeyColumn<T>;
  readonly subjectId: PasskeyColumn<T>;
  readonly rpId: PasskeyColumn<T>;
  readonly protocolCredentialId: PasskeyColumn<T>;
  readonly credentialKey: PasskeyColumn<T>;
  readonly handleKey: PasskeyColumn<T>;
  readonly userHandle: PasskeyColumn<T>;
  readonly publicKey: PasskeyColumn<T>;
  readonly algorithm: PasskeyColumn<T>;
  readonly profile: PasskeyColumn<T>;
  readonly credentialRevision: PasskeyColumn<T>;
  readonly status: PasskeyColumn<T>;
  readonly primarySignIn: PasskeyColumn<T>;
  readonly enrollmentUserVerified: PasskeyColumn<T>;
  readonly backupEligible: PasskeyColumn<T>;
  readonly backupState: PasskeyColumn<T>;
  readonly counter: PasskeyColumn<T>;
  readonly maximumCounter: PasskeyColumn<T>;
  readonly decode: (
    row: Readonly<Partial<T["select"]>>,
  ) => Omit<PasskeyCredential, "revision" | "active">;
  readonly decodeSubjectId: (row: Readonly<Partial<T["select"]>>) => N;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: Expression;
}

export interface PasskeyCredentialOwnershipTable<
  T extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: T["table"];
  readonly credentialKey: PasskeyColumn<T>;
  readonly rpId: PasskeyColumn<T>;
  readonly protocolCredentialId: PasskeyColumn<T>;
  readonly subjectId: PasskeyColumn<T>;
  readonly credentialId: PasskeyColumn<T>;
  readonly state: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly reservationId: PasskeyColumn<T>;
  readonly ownedCondition: Expression;
  readonly isOwnedState: (value: unknown) => boolean;
  readonly decodeSubjectId: (row: Readonly<Partial<T["select"]>>) => N;
}

/** Reservations do not manufacture a subject; bound handles are RP-global. */
export interface PasskeyHandleReadTable<T extends Table> {
  readonly table: T["table"];
  readonly handleKey: PasskeyColumn<T>;
  readonly rpId: PasskeyColumn<T>;
  readonly userHandle: PasskeyColumn<T>;
  readonly state: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly reservationId: PasskeyColumn<T>;
}

export interface PasskeyHandleReservationTable<
  T extends Table,
  Expression extends SqlExpression = SqlExpression,
> extends PasskeyHandleReadTable<T> {
  readonly reservedCondition: Expression;
  readonly isReservedState: (value: unknown) => boolean;
}

export interface PasskeyHandleOwnershipTable<
  T extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> extends PasskeyHandleReadTable<T> {
  readonly subjectId: PasskeyColumn<T>;
  readonly ownedCondition: Expression;
  readonly isOwnedState: (value: unknown) => boolean;
  readonly decodeSubjectId: (row: Readonly<Partial<T["select"]>>) => N;
}

export const requiredPasskeyCredentialConstraints = {
  credentialId: ["credentialId"],
  factor: ["subjectId", "credentialId"],
  credentialOwnership: ["credentialKey"],
  handleOwnership: ["handleKey"],
  boundSubjectHandle: ["rpId", "subjectId"],
} as const;

export interface PasskeyCredentialMapping<
  S extends Table,
  C extends Table,
  F extends Table,
  Ownership extends Table,
  Handle extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly subject: PasskeySubjectReadTable<S, N, Expression>;
  readonly credential: PasskeyCredentialReadTable<C, N, Expression>;
  readonly authority: PasskeyFactorReadTable<F, Expression>;
  readonly credentialOwnership: PasskeyCredentialOwnershipTable<Ownership, N, Expression>;
  readonly handleOwnership: PasskeyHandleOwnershipTable<Handle, N, Expression>;
  readonly subjectIds: PasskeySubjectIdCodec<N>;
  readonly constraints: typeof requiredPasskeyCredentialConstraints;
}

/** A stable additional policy row, acquired before RP/credential locks. The
 * factory checks column names without erasing the consumer table at its input. */
const PasskeyPolicyGuardTypeId: unique symbol = Symbol("effect-auth/drizzle/PasskeyPolicyGuard");

export interface PasskeyPolicyGuard<Expression extends SqlExpression = SqlExpression> {
  readonly [PasskeyPolicyGuardTypeId]: true;
  readonly scope: string;
  readonly table: object;
  readonly columns: ReadonlyArray<string>;
  readonly where: (moduleId: string) => Expression;
  readonly condition: (moduleId: string) => Expression;
}

export const passkeyPolicyGuard = <
  T extends Table,
  Expression extends SqlExpression = SqlExpression,
>(input: {
  readonly scope: string;
  readonly table: T["table"];
  readonly columns: ReadonlyArray<PasskeyColumn<T>>;
  readonly where: (moduleId: string) => Expression;
  readonly condition: (moduleId: string) => Expression;
}): PasskeyPolicyGuard<Expression> => ({ ...input, [PasskeyPolicyGuardTypeId]: true });

export interface PasskeyModuleTable<
  T extends Table,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: T["table"];
  readonly moduleId: PasskeyColumn<T>;
  readonly status: PasskeyColumn<T>;
  readonly policyRevision: PasskeyColumn<T>;
  /** All physical fields used by decodeMethodPolicy, including policyRevision. */
  readonly policyColumns: ReadonlyArray<PasskeyColumn<T>>;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: Expression;
  readonly decodeMethodPolicy: (row: Readonly<Partial<T["select"]>>) => PasskeyMethodPolicy;
  readonly guards?: ReadonlyArray<PasskeyPolicyGuard<Expression>>;
}

export type PasskeyFlowState =
  | "Pending"
  | "Claimed"
  | "Verified"
  | "Rejected"
  | "Ambiguous"
  | "RegistrationAccepted"
  | "ProvisioningPending";

export interface PasskeyFlowInsert {
  readonly ceremony: PasskeyCeremony;
  readonly policy: PasskeyMethodPolicy;
  readonly marker: string;
}

export interface PasskeyFlowTable<T extends Table> {
  readonly table: T["table"];
  readonly moduleId: PasskeyColumn<T>;
  readonly flowId: PasskeyColumn<T>;
  readonly commandId: PasskeyColumn<T>;
  readonly purpose: PasskeyColumn<T>;
  readonly state: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly generation: PasskeyColumn<T>;
  readonly snapshot: PasskeyColumn<T>;
  readonly policySnapshot: PasskeyColumn<T>;
  readonly requestBindingVerifier: PasskeyColumn<T>;
  readonly requestBindingExpiresAt: PasskeyColumn<T>;
  readonly issuedAt: PasskeyColumn<T>;
  readonly expiresAt: PasskeyColumn<T>;
  readonly retentionUntil: PasskeyColumn<T>;
  readonly claimId: PasskeyColumn<T>;
  readonly claimedAt: PasskeyColumn<T>;
  readonly claimExpiresAt: PasskeyColumn<T>;
  readonly credentialSnapshot: PasskeyColumn<T>;
  /** Core SubjectId scope text, not a consumer's native subject ID. */
  readonly subjectScope: PasskeyColumn<T>;
  readonly targetScope: PasskeyColumn<T>;
  readonly states: Readonly<Record<PasskeyFlowState, unknown>>;
  readonly encodeInsert: (input: PasskeyFlowInsert) => T["insert"];
}

export interface PasskeyAdmissionTable<T extends Table> {
  readonly table: T["table"];
  readonly authorityScope: PasskeyColumn<T>;
  readonly moduleId: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly ownerMarker: PasskeyColumn<T>;
  /** One physical clock sample, reused by every charge of this decision. */
  readonly admittedAt: PasskeyColumn<T>;
}

export type PasskeyChargeKind = "global" | "subject" | "target";

export interface PasskeyChargeInsert {
  readonly moduleId: string;
  readonly flowId: string;
  readonly purpose: PasskeyCeremony["purpose"];
  readonly kind: PasskeyChargeKind;
  readonly scope: string;
  readonly originalWindowMillis: number;
  readonly marker: string;
}

/** Charge scope is canonical core identity text; this subject-free descriptor
 * can count all purposes without decoding any unrelated native subject. */
export interface PasskeyChargeTable<T extends Table> {
  readonly table: T["table"];
  readonly moduleId: PasskeyColumn<T>;
  readonly flowId: PasskeyColumn<T>;
  readonly purpose: PasskeyColumn<T>;
  readonly kind: PasskeyColumn<T>;
  readonly scope: PasskeyColumn<T>;
  readonly originalWindowMillis: PasskeyColumn<T>;
  readonly admittedAt: PasskeyColumn<T>;
  readonly retainUntil: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly ownerMarker: PasskeyColumn<T>;
  readonly encodeInsert: (input: PasskeyChargeInsert) => T["insert"];
}

export const requiredPasskeyPersistenceConstraints = {
  flow: ["moduleId", "flowId"],
  command: ["moduleId", "commandId"],
  admission: ["authorityScope", "moduleId"],
  charge: ["moduleId", "flowId", "kind"],
} as const;

export interface PasskeyCeremonyMapping<
  Module extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly moduleId: string;
  readonly authorityScope: string;
  readonly module: PasskeyModuleTable<Module, Expression>;
  readonly flow: PasskeyFlowTable<Flow>;
  readonly admission: PasskeyAdmissionTable<Admission>;
  readonly charge: PasskeyChargeTable<Charge>;
  readonly clock: PasskeyClock<Expression>;
  readonly constraints: typeof requiredPasskeyPersistenceConstraints;
}

export interface PasskeyPersistenceMapping<
  Read,
  Module extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
  Credential extends Table = Table,
> extends PasskeyCeremonyMapping<Module, Flow, Admission, Charge, Expression> {
  readonly read: Read & {
    readonly subjectIds: PasskeySubjectIdCodec<N>;
  };
  readonly telemetry: {
    readonly lastUsedAt: PasskeyColumn<Credential>;
    readonly encodeBackupState: (value: boolean) => unknown;
  };
}

export interface PasskeyEnrollmentContextMapping<
  Read,
  Module extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly moduleId: string;
  readonly read: Read & {
    readonly subjectIds: PasskeySubjectIdCodec<N>;
  };
  readonly module: PasskeyModuleTable<Module, Expression>;
}

export interface D1PasskeyMapping {
  readonly d1: {
    readonly primary: true;
  };
}
