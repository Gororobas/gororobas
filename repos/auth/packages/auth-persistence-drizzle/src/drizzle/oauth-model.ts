import type {
  OAuthActionAuthorization,
  OAuthAccountRevision,
  OAuthRegistrationIntent,
  OAuthCredentialSnapshot,
  OAuthExternalIdentity,
} from "@yielded/auth/OAuth";
import type { AuthenticationFactor } from "@yielded/auth/Operations";
import type { AuthenticationRequirement, SecurityRevision } from "@yielded/auth/Sessions";
import type { InferInsertModel, InferSelectModel, SQL, Table } from "drizzle-orm";
import type { Effect } from "effect";

import type { PersistenceMappingError, SubjectIdCodec } from "./model";

type Column<T extends Table> = Extract<keyof T["_"]["columns"], string>;

export type OAuthFlowState =
  | "Pending"
  | "Claimed"
  | "Verified"
  | "RegistrationIssued"
  | "Linked"
  | "Cancelled"
  | "Rejected"
  | "Ambiguous"
  | "Conflict";

export type OAuthTupleState = "Unowned" | "Reserved" | "Owned";
export type OAuthRegistrationState = "Unbound" | "Registered" | "ProvisioningPending" | "Rejected";
export type OAuthAction = OAuthActionAuthorization["challenge"]["action"];

/** The engine writes every critical column explicitly after applying the pure
 * consumer encoder. Native instant values must roundtrip without precision loss. */
export interface OAuthClock {
  readonly encodeInstant: (millis: number) => unknown;
  readonly decodeInstant: (value: unknown) => number;
  /** Actual engine wall clock sampled after locks, not transaction-start time.
   * PostgreSQL uses clock_timestamp(), never now()/CURRENT_TIMESTAMP. D1 repeats
   * its primary-engine sample bounds in final guards. Return integer milliseconds. */
  readonly engineNowMillis: SQL;
}

export interface OAuthSubjectReadTable<S extends Table> {
  readonly table: S;
  readonly id: Column<S>;
  readonly status: Column<S>;
  readonly securityRevision: Column<S>;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: SQL;
}

export interface OAuthSubjectTable<S extends Table> extends OAuthSubjectReadTable<S> {
  readonly decodeActionRequirement: (
    row: InferSelectModel<S>,
    action: OAuthAction,
  ) => AuthenticationRequirement;
  readonly decodeAuthenticationRequirement: (row: InferSelectModel<S>) => AuthenticationRequirement;
  readonly nextSecurityRevision: (current: SecurityRevision) => SecurityRevision;
}

export interface OAuthOwnershipReadTable<O extends Table, N> {
  readonly table: O;
  readonly identityKey: Column<O>;
  readonly provider: Column<O>;
  readonly issuer: Column<O>;
  readonly externalSubject: Column<O>;
  readonly subjectId: Column<O>;
  /** Includes Owned state when authority and ownership share a physical table. */
  readonly ownedCondition: SQL;
  readonly decodeSubjectId: (row: InferSelectModel<O>) => N;
}

export interface OAuthOwnershipTable<O extends Table, N> extends OAuthOwnershipReadTable<O, N> {
  readonly encodeInsert: (input: {
    readonly identity: typeof OAuthExternalIdentity.Type;
    readonly identityKey: string;
    readonly subjectId: N;
  }) => InferInsertModel<O>;
}

export interface OAuthCredentialReadTable<C extends Table> {
  readonly table: C;
  readonly moduleId: Column<C>;
  readonly credentialId: Column<C>;
  readonly subjectId: Column<C>;
  readonly identityKey: Column<C>;
  readonly credentialRevision: Column<C>;
  readonly status: Column<C>;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: SQL;
}

export interface OAuthCredentialTable<C extends Table, N> extends OAuthCredentialReadTable<C> {
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly subjectId: N;
    readonly identityKey: string;
    readonly credentialId: string;
    readonly credentialRevision: SecurityRevision;
  }) => InferInsertModel<C>;
  /** This slice removes login rows. Historical records belong in separate audit storage. */
  readonly removal: "delete";
}

export interface OAuthAuthorityReadTable<C extends Table> {
  readonly table: C;
  readonly subjectId: Column<C>;
  readonly credentialId: Column<C>;
  readonly revision: Column<C>;
  readonly status: Column<C>;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly activeCondition: SQL;
}

export interface OAuthAuthorityTable<C extends Table, N> extends OAuthAuthorityReadTable<C> {
  readonly encodeInsert: (input: {
    readonly subjectId: N;
    readonly credentialId: string;
    readonly revision: SecurityRevision;
  }) => InferInsertModel<C>;
}

/** Both purposes may use the same physical table. Shared tables share module/flow
 * and module/command uniqueness. The snapshot has the exact purpose-specific core
 * codec; terminal writes erase it, while identity, claim and retention columns remain. */
export interface OAuthFlowTable<F extends Table> {
  readonly table: F;
  readonly moduleId: Column<F>;
  readonly flowId: Column<F>;
  readonly commandId: Column<F>;
  readonly purpose: Column<F>;
  readonly generation: Column<F>;
  readonly state: Column<F>;
  readonly version: Column<F>;
  readonly stateDigest: Column<F>;
  readonly binderVerifier: Column<F>;
  readonly binderExpiresAt: Column<F>;
  readonly snapshot: Column<F>;
  readonly issuedAt: Column<F>;
  readonly expiresAt: Column<F>;
  readonly claimId: Column<F>;
  readonly claimedAt: Column<F>;
  readonly claimExpiresAt: Column<F>;
  readonly retentionUntil: Column<F>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly flowId: string;
    readonly purpose: "sign-in" | "link";
  }) => InferInsertModel<F>;
}

export interface OAuthTupleAuthorityTable<T extends Table, N> {
  readonly table: T;
  readonly identityKey: Column<T>;
  readonly provider: Column<T>;
  readonly issuer: Column<T>;
  readonly externalSubject: Column<T>;
  readonly state: Column<T>;
  readonly version: Column<T>;
  readonly subjectId: Column<T>;
  /** Exact reservation identity; no application payload or bearer. */
  readonly reservation: Column<T>;
  readonly encodeInsert: (input: {
    readonly identityKey: string;
    readonly identity: typeof OAuthExternalIdentity.Type;
    readonly subjectId?: N;
  }) => InferInsertModel<T>;
}

export interface OAuthRegistrationIntentTable<I extends Table> {
  readonly table: I;
  readonly moduleId: Column<I>;
  readonly reference: Column<I>;
  readonly flowId: Column<I>;
  readonly claimId: Column<I>;
  readonly identityKey: Column<I>;
  readonly version: Column<I>;
  readonly state: Column<I>;
  readonly snapshot: Column<I>;
  readonly commandId: Column<I>;
  readonly fingerprint: Column<I>;
  readonly pendingReference: Column<I>;
  readonly expiresAt: Column<I>;
  readonly retentionUntil: Column<I>;
  readonly encodeInsert: (intent: OAuthRegistrationIntent) => InferInsertModel<I>;
}

export interface OAuthRegistrationCommandTable<R extends Table, Registration> {
  readonly table: R;
  readonly moduleId: Column<R>;
  readonly commandId: Column<R>;
  readonly reference: Column<R>;
  readonly identityKey: Column<R>;
  readonly fingerprint: Column<R>;
  readonly intentSnapshot: Column<R>;
  readonly applicationSnapshot: Column<R>;
  readonly provisioningIdentity: Column<R>;
  readonly decision: Column<R>;
  readonly retentionUntil: Column<R>;
  /** Persists exact detached Type before protected pending work can start. */
  readonly encodeInsert: (input: {
    readonly intent: OAuthRegistrationIntent;
    readonly commandId: string;
    readonly fingerprint: string;
    readonly registration: Registration;
    readonly provisioningIdentity: string;
  }) => InferInsertModel<R>;
}

export interface OAuthUnlinkCommandTable<U extends Table> {
  readonly table: U;
  readonly moduleId: Column<U>;
  readonly commandId: Column<U>;
  readonly subjectId: Column<U>;
  readonly credentialId: Column<U>;
  readonly intentSnapshot: Column<U>;
  readonly decision: Column<U>;
  readonly retentionUntil: Column<U>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly commandId: string;
    readonly credential: OAuthCredentialSnapshot;
  }) => InferInsertModel<U>;
}

export interface OAuthEligibilityFact {
  readonly credentialId: string;
  readonly revision: SecurityRevision;
  readonly usablePrimary: boolean;
  readonly factors: ReadonlyArray<AuthenticationFactor>;
  readonly userVerified: boolean;
  readonly phishingResistant: boolean;
}

/** Each descriptor reads only its own subject-scoped method rows. The native row
 * projector and SQL condition must express the same installed method eligibility.
 * All source/identifier/policy mutations advance subject securityRevision. D1 also
 * guards exact selected IDs/versions and absence/count assumptions, never just a
 * stale boolean. An over-limit graph fails closed rather than truncating. */
export interface OAuthEligibilityTable<T extends Table, N> {
  readonly table: T;
  readonly subjectId: Column<T>;
  readonly credentialId: Column<T>;
  readonly revision: Column<T>;
  readonly scope: string;
  readonly condition: (subjectId: N) => SQL;
  readonly decode: (row: InferSelectModel<T>) => OAuthEligibilityFact | undefined;
}

/** Authenticated command replay uses current subject status and this additional
 * nonconsuming SQL policy. It never consumes a fresh action factor. */
export interface OAuthMetadataPolicy<N> {
  readonly condition: (subjectId: N) => SQL;
}

export interface OAuthCleanupTable<T extends Table, N> {
  readonly table: T;
  readonly subjectId: Column<T>;
  /** Bound to this subject's old revision; no opaque independently committing service. */
  readonly condition: (input: {
    readonly subjectId: N;
    readonly revision: OAuthAccountRevision;
    readonly removedCredentialId?: string;
  }) => SQL;
  readonly disposition: "delete";
}

export interface OAuthRegistrationEligibility<N> {
  /** Pure SQL guards for mutable app policy; evaluated again after app writes. */
  readonly condition: (input: {
    readonly intent: OAuthRegistrationIntent;
    readonly nativeSubjectId?: N;
  }) => SQL;
}

export interface OAuthD1Mapping {
  readonly d1: { readonly primary: true };
}

export const requiredOAuthSignInConstraints = {
  flow: "unique(flow.moduleId,flow.flowId)",
  command: "unique(flow.moduleId,flow.commandId)",
  stateDigest: "unique(flow.stateDigest)",
  ownership: "unique(ownership.identityKey)",
  credentialId: "unique(credential.credentialId)",
  credentialIdentity: "unique(credential.identityKey)",
  authorityCredential: "unique(authority.subjectId,authority.credentialId)",
} as const;

export const requiredOAuthTupleConstraints = { identityKey: "unique(tuple.identityKey)" } as const;

export const requiredOAuthRegistrationConstraints = {
  intentReference: "unique(intent.moduleId,intent.reference)",
  intentFlow: "unique(intent.moduleId,intent.flowId)",
  command: "unique(registrationCommand.moduleId,registrationCommand.commandId)",
} as const;

export const requiredOAuthAccountsConstraints = {
  unlinkCommand: "unique(unlinkCommand.moduleId,unlinkCommand.commandId)",
} as const;

export interface OAuthSignInMapping<
  S extends Table,
  O extends Table,
  C extends Table,
  AC extends Table,
  F extends Table,
  N,
> {
  readonly subject: OAuthSubjectReadTable<S>;
  readonly ownership: OAuthOwnershipReadTable<O, N>;
  readonly credential: OAuthCredentialReadTable<C>;
  readonly authority: OAuthAuthorityReadTable<AC>;
  readonly flow: OAuthFlowTable<F>;
  readonly subjectId: SubjectIdCodec<N>;
  readonly clock: OAuthClock;
  readonly constraints: typeof requiredOAuthSignInConstraints;
}

export type OAuthOwnershipMutation<T extends Table, O extends Table, N> =
  | { readonly mode: "integrated"; readonly tuple: OAuthTupleAuthorityTable<T, N> }
  | {
      readonly mode: "separate";
      readonly tuple: OAuthTupleAuthorityTable<T, N>;
      readonly external: OAuthOwnershipTable<O, N>;
    };

export interface OAuthRegistrationIntentMapping<
  S extends Table,
  O extends Table,
  C extends Table,
  AC extends Table,
  F extends Table,
  T extends Table,
  I extends Table,
  N,
> {
  readonly signIn: OAuthSignInMapping<S, O, C, AC, F, N>;
  readonly ownership: OAuthOwnershipMutation<T, O, N>;
  readonly intent: OAuthRegistrationIntentTable<I>;
  readonly tupleConstraints: typeof requiredOAuthTupleConstraints;
  readonly registrationConstraints: Pick<
    typeof requiredOAuthRegistrationConstraints,
    "intentReference" | "intentFlow"
  >;
  readonly eligibility: OAuthRegistrationEligibility<N>;
}

export interface OAuthRegistrationBase<
  Registration,
  T extends Table,
  O extends Table,
  I extends Table,
  R extends Table,
  N,
> {
  readonly ownership: OAuthOwnershipMutation<T, O, N>;
  readonly intent: OAuthRegistrationIntentTable<I>;
  readonly command: OAuthRegistrationCommandTable<R, Registration>;
  readonly clock: OAuthClock;
  readonly tupleConstraints: typeof requiredOAuthTupleConstraints;
  readonly constraints: typeof requiredOAuthRegistrationConstraints;
  readonly inspect: (input: {
    readonly intent: OAuthRegistrationIntent;
    readonly registration: Registration;
  }) => Effect.Effect<
    { readonly fingerprint: string; readonly eligible: boolean },
    PersistenceMappingError
  >;
  /** Required for an explicitly bound native/DO command: no asynchronous callback
   * is evaluated inside the physical owner. Standalone inspection is pre-owner. */
  readonly inspectSync?: (input: {
    readonly intent: OAuthRegistrationIntent;
    readonly registration: Registration;
  }) => { readonly fingerprint: string; readonly eligible: boolean };
  /** Type projection, never the original wire transformation. */
  readonly snapshot: (
    registration: Registration,
  ) => Effect.Effect<Registration, PersistenceMappingError>;
  readonly snapshotSync?: (registration: Registration) => Registration;
  /** Canonical bounded storage of Registration.Type. These are Type codecs, not
   * the original wire decoder/encoder; decode(encode(value)) must encode identically.
   * The engine writes and roundtrip-checks this exact string (maximum 1 MiB). */
  readonly application: {
    readonly encode: (registration: Registration) => string;
    readonly decode: (stored: string) => Registration;
  };
  readonly eligibility: {
    /** Stable application authority anchors, in one configured global order.
     * Omit only for immutable/tuple-local policy or an equivalent explicit outer
     * owner lock. Each scope must match 1..64 rows, never an absent quota row.
     * Locks precede tuple/intent/command locks; postcondition owns changed state. */
    readonly guards?: ReadonlyArray<OAuthRegistrationGuardDescriptor<Registration, N>>;
    readonly admission: (input: {
      readonly intent: OAuthRegistrationIntent;
      readonly registration: Registration;
      readonly nativeSubjectId?: N;
    }) => SQL;
    /** Evaluated after subject/application writes, including appended coordinator
     * writes. May assert consumption of the admission invitation/quota. */
    readonly postcondition: (input: {
      readonly intent: OAuthRegistrationIntent;
      readonly registration: Registration;
      readonly nativeSubjectId?: N;
    }) => SQL;
  };
  readonly allocateProvisioningIdentity: Effect.Effect<string, PersistenceMappingError>;
  readonly retentionMillis: number;
}

export interface OAuthRegistrationGuardTable<T extends Table, Registration, N> {
  readonly table: T;
  readonly orderBy: Column<T>;
  readonly condition: (input: {
    readonly intent: OAuthRegistrationIntent;
    readonly registration: Registration;
    readonly nativeSubjectId?: N;
  }) => SQL;
}

export interface OAuthRegistrationGuardDescriptor<Registration, N> {
  readonly table: Table;
  readonly orderBy: string;
  readonly condition: OAuthRegistrationGuardTable<Table, Registration, N>["condition"];
}

export const oauthRegistrationGuardTable = <T extends Table, Registration, N>(
  input: OAuthRegistrationGuardTable<T, Registration, N>,
): OAuthRegistrationGuardDescriptor<Registration, N> =>
  Object.freeze({
    table: input.table,
    orderBy: input.orderBy,
    condition: input.condition,
  });

export type OAuthRegistrationMapping<
  Registration,
  S extends Table,
  O extends Table,
  C extends Table,
  AC extends Table,
  T extends Table,
  I extends Table,
  R extends Table,
  N,
> = OAuthRegistrationBase<Registration, T, O, I, R, N> &
  (
    | {
        readonly mode: "pending";
        readonly allocatePendingReference: Effect.Effect<string, PersistenceMappingError>;
      }
    | {
        readonly mode: "atomic";
        readonly subjectId: SubjectIdCodec<N>;
        readonly subject: OAuthSubjectReadTable<S>;
        readonly credential: OAuthCredentialTable<C, N>;
        readonly authority: OAuthAuthorityTable<AC, N>;
        readonly allocateSubjectId: Effect.Effect<N, PersistenceMappingError>;
        readonly allocateCredentialId: Effect.Effect<string, PersistenceMappingError>;
        readonly allocateRevision: Effect.Effect<SecurityRevision, PersistenceMappingError>;
        readonly encodeSubjectInsert: (
          input: { readonly intent: OAuthRegistrationIntent; readonly registration: Registration },
          ids: { readonly subjectId: N; readonly securityRevision: SecurityRevision },
        ) => InferInsertModel<S>;
      }
  );

/** Heterogeneous descriptors are made by typed factories and projected privately. */
export interface OAuthEligibilityDescriptor<N> {
  readonly _tag: "OAuthEligibilityDescriptor";
  readonly scope: string;
  readonly table: Table;
  readonly subjectId: string;
  readonly credentialId: string;
  readonly revision: string;
  readonly condition: (subjectId: N) => SQL;
  readonly decode: (row: unknown) => OAuthEligibilityFact | undefined;
}

export const oauthEligibilityTable = <T extends Table, N>(
  input: OAuthEligibilityTable<T, N>,
): OAuthEligibilityDescriptor<N> => {
  const { table, subjectId, credentialId, revision, scope, condition, decode } = input;

  return Object.freeze({
    _tag: "OAuthEligibilityDescriptor",
    table,
    subjectId,
    credentialId,
    revision,
    scope,
    condition,
    decode: (row: unknown) => decode(row as InferSelectModel<T>),
  });
};

export interface OAuthCleanupDescriptor<N> {
  readonly table: Table;
  readonly subjectId: string;
  readonly condition: OAuthCleanupTable<Table, N>["condition"];
}

export const oauthCleanupTable = <T extends Table, N>(
  input: OAuthCleanupTable<T, N>,
): OAuthCleanupDescriptor<N> =>
  Object.freeze({ table: input.table, subjectId: input.subjectId, condition: input.condition });

/** A stable application/reference lock acquired before an ownership target.
 * Missing rows retain ownership. Conditions are synchronous and use detached
 * native IDs; every writer of the guarded reference follows the same order. */
export interface OAuthReferenceGuardTable<T extends Table, N> {
  readonly table: T;
  readonly orderBy: Column<T>;
  readonly condition: (input: {
    readonly identity: typeof OAuthExternalIdentity.Type;
    readonly identityKey: string;
    readonly subjectId: N;
  }) => SQL;
}

export interface OAuthReferenceGuardDescriptor<N> {
  readonly table: Table;
  readonly orderBy: string;
  readonly condition: OAuthReferenceGuardTable<Table, N>["condition"];
}

export const oauthReferenceGuardTable = <T extends Table, N>(
  input: OAuthReferenceGuardTable<T, N>,
): OAuthReferenceGuardDescriptor<N> =>
  Object.freeze({
    table: input.table,
    orderBy: input.orderBy,
    condition: input.condition,
  });

export interface OAuthAccountsMapping<
  S extends Table,
  O extends Table,
  C extends Table,
  AC extends Table,
  F extends Table,
  T extends Table,
  U extends Table,
  N,
> {
  readonly subject: OAuthSubjectTable<S>;
  readonly ownership: OAuthOwnershipMutation<T, O, N>;
  readonly credential: OAuthCredentialTable<C, N>;
  readonly authority: OAuthAuthorityTable<AC, N>;
  readonly flow: OAuthFlowTable<F>;
  readonly command: OAuthUnlinkCommandTable<U>;
  readonly subjectId: SubjectIdCodec<N>;
  readonly clock: OAuthClock;
  readonly constraints: typeof requiredOAuthSignInConstraints &
    typeof requiredOAuthAccountsConstraints;
  readonly tupleConstraints: typeof requiredOAuthTupleConstraints;
  readonly eligibility: ReadonlyArray<OAuthEligibilityDescriptor<N>>;
  readonly cleanup: ReadonlyArray<OAuthCleanupDescriptor<N>>;
  readonly metadata: OAuthMetadataPolicy<N>;
  readonly sessionInvalidation: "same-authority-immediate" | "original-absolute-expiry";
  /** Omit only when connected access is absent. A predicate alone conservatively
   * retains ownership; release also needs all configured guard rows below. */
  readonly connectedReference?: (input: {
    readonly identityKey: string;
    readonly subjectId: N;
  }) => SQL;
  /** At most 32 descriptors, each locking 1..64 stable rows in supplied order.
   * Missing/empty guards retain Owned, even when the reference predicate is false. */
  readonly connectedReferenceGuards?: ReadonlyArray<OAuthReferenceGuardDescriptor<N>>;
  readonly allocateCredentialId: Effect.Effect<string, PersistenceMappingError>;
  readonly allocateRevision: Effect.Effect<SecurityRevision, PersistenceMappingError>;
}

export interface OAuthRegistrationAuthority<Registration> {
  readonly read: (
    access: import("@yielded/auth/OAuth").OAuthRegistrationAccess,
  ) => Effect.Effect<
    import("@yielded/auth/OAuth").OAuthRegistrationInspection | undefined,
    import("@yielded/auth/OAuth").OAuthUnavailable
  >;
  readonly inspect: (input: {
    readonly intent: OAuthRegistrationIntent;
    readonly registration: Registration;
  }) => Effect.Effect<
    {
      readonly fingerprint: import("@yielded/auth/Schema").TokenDigest;
      readonly eligible: boolean;
    },
    import("@yielded/auth/OAuth").OAuthUnavailable
  >;
  readonly register: <A>(
    input: {
      readonly access: import("@yielded/auth/OAuth").OAuthRegistrationAccess;
      readonly intent: OAuthRegistrationIntent;
      readonly commandId: typeof import("@yielded/auth/OAuth").OAuthCommandId.Type;
      readonly registration: Registration;
      readonly fingerprint: import("@yielded/auth/Schema").TokenDigest;
    },
    prepare: import("@yielded/auth/OAuth").PrepareOAuthCommit<
      import("@yielded/auth/OAuth").OAuthRegistrationDecision,
      A
    >,
  ) => Effect.Effect<
    import("@yielded/auth/Hooks").PreparedCommit<A>,
    import("@yielded/auth/OAuth").OAuthUnavailable
  >;
  readonly cleanup: <A>(
    input: import("@yielded/auth/OAuth").OAuthCleanupInput,
    prepare: import("@yielded/auth/OAuth").PrepareOAuthCommit<
      { readonly removed: number; readonly hasMore: boolean },
      A
    >,
  ) => Effect.Effect<
    import("@yielded/auth/Hooks").PreparedCommit<A>,
    import("@yielded/auth/OAuth").OAuthUnavailable
  >;
}
