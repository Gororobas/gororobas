import type { PreparedCommit } from "@yielded/auth/Hooks";
import type {
  PasskeyUnavailable,
  PasskeyActionAuthorization,
  PasskeyCeremony,
  PasskeyClaim,
  PasskeyCredential,
  PasskeyCredentialSummary,
  PasskeyIssueDecision,
  PasskeyRegistrationResult,
  PasskeyRegistrationVerified,
  PasskeyRequirement,
  PasskeyRevision,
  PasskeyManagementPersistence,
  PreparePasskeyCommit,
  PasskeyManagementPolicy,
  PasskeyMethodPolicy,
} from "@yielded/auth/Passkey";
import type { TokenDigest } from "@yielded/auth/Schema";
import type { SessionInvalidationWindow } from "@yielded/auth/Sessions";
import type { Effect, Schema } from "effect";

import type { TableModel as Table, SqlExpression } from "../query-operations";
import type { PersistenceMappingError } from "./common";
import type {
  PasskeyColumn,
  PasskeyCredentialMapping,
  PasskeyFlowTable,
  PasskeyHandleReservationTable,
  PasskeyPersistenceMapping,
  PasskeyPersistenceServices,
} from "./passkey-model";
import type { PasskeyRegistrationIntentReadTable } from "./passkey-registration-ceremony-model";

export interface PasskeyCredentialInsert<N> {
  readonly subjectId: N;
  readonly credential: PasskeyCredential;
  readonly summary: PasskeyCredentialSummary;
  readonly marker: string;
}

export interface PasskeyWriteTables<
  S extends Table,
  C extends Table,
  F extends Table,
  O extends Table,
  H extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly credential: {
    readonly name: PasskeyColumn<C>;
    readonly createdAt: PasskeyColumn<C>;
    readonly encodeInsert: (input: PasskeyCredentialInsert<N>) => C["insert"];
    readonly encodePrimarySignIn: (value: boolean) => unknown;
    readonly encodeEnrollmentUserVerified: (value: boolean) => unknown;
    readonly encodeBackupEligible: (value: boolean) => unknown;
    readonly activeStatus: unknown;
    readonly removedStatus: unknown;
  };
  readonly authority: {
    readonly encodeInsert: (input: PasskeyCredentialInsert<N>) => F["insert"];
    readonly activeStatus: unknown;
    readonly removedStatus: unknown;
  };
  readonly credentialOwnership: {
    readonly encodeInsert: (input: PasskeyCredentialInsert<N>) => O["insert"];
    readonly ownedState: unknown;
    readonly removedState: unknown;
  };
  readonly handleOwnership: {
    readonly encodeInsert: (input: {
      readonly subjectId: N;
      readonly rpId: string;
      readonly userHandle: string;
      readonly marker: string;
    }) => H["insert"];
    readonly ownedState: unknown;
  };
  /** All mutable policy dependencies must be subject columns or declared module guards. */
  readonly policy: {
    readonly subjectColumns: ReadonlyArray<PasskeyColumn<S>>;
    readonly management: (row: Readonly<Partial<S["select"]>>) => PasskeyManagementPolicy;
    readonly requirement: (
      row: Readonly<Partial<S["select"]>>,
      action: PasskeyActionAuthorization["challenge"]["action"],
    ) => Effect.Effect<typeof PasskeyRequirement.Type, PersistenceMappingError>;
    readonly metadata: (subjectId: N) => Expression;
    readonly action: (subjectId: N, authorization: PasskeyActionAuthorization) => Expression;
    /** Usable primary/recovery path AND required remaining factors. Evaluated with the target excluded, before and after removal. Connected grants/factor-only credentials are not primary paths. */
    readonly remainingSignIn: (
      subjectId: N,
      removedCredentialId: string,
      row: Readonly<Partial<S["select"]>>,
    ) => Effect.Effect<Expression, PersistenceMappingError>;
  };
}

export interface PasskeyInvalidationInput<N> {
  readonly subjectId: N;
  readonly previousRevision: typeof PasskeyRevision.Type.securityRevision;
  readonly securityRevision: typeof PasskeyRevision.Type.securityRevision;
  readonly invalidation: SessionInvalidationWindow;
}

export interface PasskeyInvalidationMutation<N, Expression extends SqlExpression = SqlExpression> {
  readonly table: object;
  readonly where: (input: PasskeyInvalidationInput<N>) => Expression;
  readonly values: (input: PasskeyInvalidationInput<N>) => Readonly<Record<string, unknown>>;
  readonly postcondition: (input: PasskeyInvalidationInput<N>) => Expression;
}

/** Same-owner updates for consumer session/pending tables. No external effects or callbacks after commit. */
export const passkeyInvalidationMutation = <
  T extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
>(input: {
  readonly table: T["table"];
  readonly where: (input: PasskeyInvalidationInput<N>) => Expression;
  readonly values: (input: PasskeyInvalidationInput<N>) => Partial<T["insert"]>;
  readonly postcondition: (input: PasskeyInvalidationInput<N>) => Expression;
}): PasskeyInvalidationMutation<N, Expression> => input;

export interface PasskeyCommandTable<T extends Table, N> {
  readonly table: T["table"];
  readonly moduleId: PasskeyColumn<T>;
  readonly commandId: PasskeyColumn<T>;
  readonly subjectId: PasskeyColumn<T>;
  readonly credentialId: PasskeyColumn<T>;
  readonly intent: PasskeyColumn<T>;
  readonly decision: PasskeyColumn<T>;
  readonly retentionUntil: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly commandId: string;
    readonly subjectId: N;
    readonly credentialId: string;
  }) => T["insert"];
}

export interface PasskeyManagementMapping<
  S extends Table,
  C extends Table,
  F extends Table,
  O extends Table,
  H extends Table,
  M extends Table,
  Flow extends Table,
  A extends Table,
  Charge extends Table,
  Command extends Table,
  N,
  Expression extends SqlExpression = SqlExpression,
> extends PasskeyPersistenceMapping<
  PasskeyCredentialMapping<S, C, F, O, H, N, Expression>,
  M,
  Flow,
  A,
  Charge,
  N,
  Expression,
  C
> {
  readonly write: PasskeyWriteTables<S, C, F, O, H, N, Expression>;
  readonly command: PasskeyCommandTable<Command, N>;
  readonly managementConstraints: typeof requiredPasskeyManagementConstraints;
  /** Removal must match the installed session strategy and change the subject revision; immediate sessions must consult that authority or be updated here. Enrollment preserves existing authentication. */
  readonly invalidation: {
    readonly window: SessionInvalidationWindow;
    readonly mutations: ReadonlyArray<PasskeyInvalidationMutation<N, Expression>>;
    readonly postcondition: (input: PasskeyInvalidationInput<N>) => Expression;
  };
}

export const requiredPasskeyManagementConstraints = { command: ["moduleId", "commandId"] } as const;

export interface PasskeyManagementServices extends PasskeyPersistenceServices {
  readonly passkeyManagementPersistence: PasskeyManagementPersistence["Service"];
}

export interface PasskeyRegistrationWriter<R> {
  readonly inspect: (registration: R) => Effect.Effect<
    {
      readonly fingerprint: TokenDigest;
      readonly eligible: boolean;
      readonly name: string;
      readonly displayName: string;
    },
    PasskeyUnavailable
  >;
  readonly issueRegistration: <A>(
    input: {
      readonly ceremony: PasskeyCeremony;
      readonly policy: PasskeyMethodPolicy;
      readonly registration: R;
    },
    prepare: PreparePasskeyCommit<PasskeyIssueDecision, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
  readonly completeRegistration: <A>(
    input: {
      readonly claim: PasskeyClaim;
      readonly verified: PasskeyRegistrationVerified;
      readonly nowMillis: number;
    },
    prepare: PreparePasskeyCommit<
      | PasskeyRegistrationResult
      | {
          readonly _tag: "Rejected";
        },
      A
    >,
  ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
}

export interface PasskeyRegistrationServices<R> extends PasskeyPersistenceServices {
  readonly passkeyRegistrationAuthority: PasskeyRegistrationWriter<R>;
}

export interface PasskeyRegistrationMapping<
  S extends Table,
  C extends Table,
  F extends Table,
  O extends Table,
  H extends Table,
  M extends Table,
  Flow extends Table,
  A extends Table,
  Charge extends Table,
  Intent extends Table,
  N,
  R,
  Expression extends SqlExpression = SqlExpression,
> extends PasskeyPersistenceMapping<
  PasskeyCredentialMapping<S, C, F, O, H, N, Expression>,
  M,
  Flow,
  A,
  Charge,
  N,
  Expression,
  C
> {
  readonly write: PasskeyWriteTables<S, C, F, O, H, N, Expression>;
  readonly flow: PasskeyFlowTable<Flow>;
  readonly handle: PasskeyHandleReservationTable<H, Expression> & {
    readonly reservedState: unknown;
    readonly encodeInsert: (input: {
      readonly ceremony: PasskeyCeremony;
      readonly reservationId: string;
    }) => H["insert"];
  };
  readonly intent: PasskeyRegistrationIntentReadTable<Intent, Expression> & {
    readonly pendingState: unknown;
    readonly acceptedState: unknown;
    readonly rejectedState: unknown;
    readonly encodeInsert: (input: {
      readonly ceremony: PasskeyCeremony;
      readonly registration: R;
      readonly reservationId: string;
    }) => Intent["insert"];
  };
  /** Consumer-owned data and identity, synchronously encoded inside the owner. A SQL-local registration creates no session and needs no email address. */
  readonly registration: {
    readonly schema: Schema.Codec<R, unknown, never, never>;
    readonly describe: (registration: R) => {
      readonly name: string;
      readonly displayName: string;
    };
    readonly eligible: (registration: R) => Expression;
    /** Commit-time application policy after provisioning. Unlike `eligible`, this
     * must permit the newly created subject and retain every mutable prerequisite.
     * Declare mutable external policy rows in module.guards so native locking
     * owners serialize revocation through commit; this predicate alone is not a lock. */
    readonly finalEligibility: (input: {
      readonly registration: R;
      readonly subjectId: N;
    }) => Expression;
    readonly subject: (input: {
      readonly registration: R;
      readonly ceremony: PasskeyCeremony;
      readonly marker: string;
    }) => {
      readonly subjectId: N;
      readonly values: S["insert"];
    };
    readonly activeStatus: unknown;
  };
  readonly registrationConstraints: typeof requiredPasskeyRegistrationWriteConstraints;
}

export const requiredPasskeyRegistrationWriteConstraints = {
  intentFlow: ["moduleId", "flowId"],
  intentCommand: ["moduleId", "commandId"],
  handle: ["handleKey"],
} as const;
