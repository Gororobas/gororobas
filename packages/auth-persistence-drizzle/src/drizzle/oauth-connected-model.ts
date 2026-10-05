import type { OAuthAccountRevision } from "@yielded/auth/OAuth";
import type * as M from "@yielded/auth/OAuth";
import type { AuthenticationRequirement } from "@yielded/auth/Sessions";
import type { InferInsertModel, InferSelectModel, SQL, Table } from "drizzle-orm";

import type { SubjectIdCodec } from "./model";
import type {
  OAuthAuthorityReadTable,
  OAuthClock,
  OAuthCredentialReadTable,
  OAuthFlowTable,
  OAuthOwnershipMutation,
  OAuthSubjectReadTable,
  requiredOAuthTupleConstraints,
} from "./oauth-model";

type Column<T extends Table> = Extract<keyof T["_"]["columns"], string>;
export type OAuthConnectedAction = M.OAuthConnectedActionChallenge["action"];

export interface OAuthConnectedSubjectTable<S extends Table> extends OAuthSubjectReadTable<S> {
  readonly decodeActionRequirement: (
    row: InferSelectModel<S>,
    action: OAuthConnectedAction,
  ) => AuthenticationRequirement;
}

/** All mapped order columns use exact SQL integer comparison through 2^53-1.
 * These codecs bridge driver representations, not alternative ordering rules. */
export interface OAuthConnectedOrderCodec {
  readonly encode: (order: number) => unknown;
  readonly decode: (value: unknown) => number;
}

export interface OAuthConnectedFlowTable<F extends Table, N> {
  readonly table: F;
  readonly moduleId: Column<F>;
  readonly flowId: Column<F>;
  readonly commandId: Column<F>;
  readonly subjectId: Column<F>;
  readonly clientKey: Column<F>;
  readonly cohortKey: Column<F>;
  readonly state: Column<F>;
  readonly version: Column<F>;
  readonly stateDigest: Column<F>;
  readonly snapshot: Column<F>;
  readonly claimId: Column<F>;
  readonly claimDigest: Column<F>;
  readonly claimOrder: Column<F>;
  readonly claimedAt: Column<F>;
  readonly claimExpiresAt: Column<F>;
  readonly expiresAt: Column<F>;
  readonly retentionUntil: Column<F>;
  /** None before claim, Unresolved after claim, Resolved only after definite
   * cancellation or atomic transfer to a grant/job. Never reset by cleanup. */
  readonly work: Column<F>;
  /** Exact sealed quarantine when no correctly sealed revocation job is available. */
  readonly custody: Column<F>;
  /** Required when retaining grants during sign-in. subjectId is NULL until
   * identity resolution; custom required columns are supplied by this encoder. */
  readonly encodeSignIn?: (reservation: M.OAuthSignInAccessClaim) => InferInsertModel<F>;
  readonly encodeInsert: (input: {
    readonly flow: M.OAuthConnectedPendingFlow;
    readonly subjectId: N;
  }) => InferInsertModel<F>;
}

export interface OAuthConnectedGrantTable<G extends Table, N> {
  readonly table: G;
  readonly moduleId: Column<G>;
  readonly grantId: Column<G>;
  readonly subjectId: Column<G>;
  readonly identityKey: Column<G>;
  /** Nullable unique active slot; historical/disconnected records use null. */
  readonly activeIdentityKey: Column<G>;
  readonly clientKey: Column<G>;
  readonly cohortKey: Column<G>;
  readonly profileKey: Column<G>;
  readonly grantVersion: Column<G>;
  readonly tokenVersion: Column<G>;
  readonly cohortGeneration: Column<G>;
  readonly state: Column<G>;
  readonly version: Column<G>;
  readonly context: Column<G>;
  readonly sealed: Column<G>;
  /** Canonical OAuthConnectedSummary only: list never loads token envelopes. */
  readonly summary: Column<G>;
  readonly revocationJobId: Column<G>;
  readonly refreshWork: Column<G>;
  readonly refreshClaim: Column<G>;
  readonly refreshClaimExpiresAt: Column<G>;
  readonly retentionUntil: Column<G>;
  readonly encodeInsert: (input: {
    readonly grant: M.OAuthConnectedStoredGrant;
    readonly subjectId: N;
  }) => InferInsertModel<G>;
}

/** Also stores a permanent provider/issuer scope anchor. clientKey must fit 52
 * ASCII characters. Empty clientRegistrationId is reserved for that anchor;
 * actual profile registrations are nonempty. Scope counter stays zero. */
export interface OAuthConnectedClientRegistrationTable<C extends Table> {
  readonly table: C;
  readonly clientKey: Column<C>;
  readonly provider: Column<C>;
  readonly issuer: Column<C>;
  readonly clientRegistrationId: Column<C>;
  readonly counter: Column<C>;
  readonly version: Column<C>;
  readonly encodeInsert: (configuration: M.OAuthConnectedConfiguration) => InferInsertModel<C>;
}

/** Remote authority: no local-subject column or subject-scoped key. Retain this
 * anchor/cutoff when a legitimately released tuple gains a different local owner. */
export interface OAuthConnectedCohortTable<C extends Table> {
  readonly table: C;
  readonly cohortKey: Column<C>;
  readonly clientKey: Column<C>;
  readonly identityKey: Column<C>;
  readonly generation: Column<C>;
  readonly cutoff: Column<C>;
  readonly state: Column<C>;
  readonly version: Column<C>;
  readonly encodeInsert: (input: {
    readonly clientKey: string;
    readonly identityKey: string;
  }) => InferInsertModel<C>;
}

export interface OAuthConnectedAdmissionTable<A extends Table, N> {
  readonly table: A;
  readonly admissionId: Column<A>;
  readonly moduleId: Column<A>;
  readonly grantId: Column<A>;
  readonly subjectId: Column<A>;
  readonly identityKey: Column<A>;
  readonly clientKey: Column<A>;
  readonly cohortKey: Column<A>;
  readonly snapshot: Column<A>;
  readonly admittedAt: Column<A>;
  readonly expiresAt: Column<A>;
  readonly version: Column<A>;
  readonly encodeInsert: (input: {
    readonly admissionId: string;
    readonly grant: M.OAuthConnectedStoredGrant;
    readonly authorization: M.OAuthConnectedUseAuthorization;
    readonly subjectId: N;
  }) => InferInsertModel<A>;
}

export interface OAuthConnectedCommandTable<C extends Table, N> {
  readonly table: C;
  readonly moduleId: Column<C>;
  readonly commandId: Column<C>;
  readonly subjectId: Column<C>;
  readonly grantId: Column<C>;
  readonly intent: Column<C>;
  readonly decision: Column<C>;
  readonly retentionUntil: Column<C>;
  readonly version: Column<C>;
  readonly encodeInsert: (input: {
    readonly commandId: string;
    readonly grant: M.OAuthConnectedDisconnectGrant;
    readonly subjectId: N;
  }) => InferInsertModel<C>;
}

export interface OAuthConnectedRevocationJobTable<J extends Table, N> {
  readonly table: J;
  readonly jobId: Column<J>;
  readonly moduleId: Column<J>;
  readonly subjectId: Column<J>;
  readonly identityKey: Column<J>;
  readonly clientKey: Column<J>;
  readonly cohortKey: Column<J>;
  readonly grantId: Column<J>;
  readonly snapshot: Column<J>;
  readonly state: Column<J>;
  readonly claimId: Column<J>;
  readonly claimedAt: Column<J>;
  readonly claimExpiresAt: Column<J>;
  readonly retentionUntil: Column<J>;
  readonly version: Column<J>;
  readonly encodeInsert: (input: {
    readonly job: M.OAuthConnectedRevocationJob;
    readonly subjectId: N;
  }) => InferInsertModel<J>;
}

export type OAuthConnectedPolicyInput<N> = {
  readonly subjectId: N;
  readonly revision: OAuthAccountRevision;
} & (
  | {
      readonly kind: "action";
      readonly operation: "issue" | "claim" | "settle" | "disconnect";
      readonly authorization: M.OAuthConnectedActionAuthorization;
      readonly configuration: M.OAuthConnectedConfiguration;
      readonly grant?: M.OAuthConnectedTokenContext;
    }
  | {
      readonly kind: "sign-in";
      readonly credential: M.OAuthCredentialSnapshot;
      readonly configuration: M.OAuthConnectedConfiguration;
      readonly grant?: M.OAuthConnectedTokenContext;
    }
  | {
      readonly kind: "metadata" | "use";
      readonly authorization: M.OAuthConnectedUseAuthorization;
      readonly grant?: M.OAuthConnectedTokenContext;
    }
);

export interface OAuthConnectedPolicyGuardTable<T extends Table, N> {
  readonly table: T;
  readonly orderBy: Column<T>;
  readonly condition: (input: OAuthConnectedPolicyInput<N>) => SQL;
}

export interface OAuthConnectedPolicyGuard<N> {
  readonly table: Table;
  readonly orderBy: string;
  readonly condition: (input: OAuthConnectedPolicyInput<N>) => SQL;
}

export const oauthConnectedPolicyGuard = <T extends Table, N>(
  input: OAuthConnectedPolicyGuardTable<T, N>,
): OAuthConnectedPolicyGuard<N> =>
  Object.freeze({
    table: input.table,
    orderBy: input.orderBy,
    condition: input.condition,
  });

export interface OAuthConnectedSqlPolicy<N> {
  /** Up to 32 scopes, each selecting 1..64 stable rows in global lock order.
   * Omit only when subject/shared authority locks already serialize every mutable
   * policy dependency or policy is immutable. All writers follow that order. */
  readonly guards?: ReadonlyArray<OAuthConnectedPolicyGuard<N>>;
  /** Recheck exact policy revision, purpose, optional grant/profile restrictions
   * and current profile/permissions; joins and absence assumptions are authority.
   * The engine checks this before and after every owner/application write. */
  readonly condition: (input: OAuthConnectedPolicyInput<N>) => SQL;
}

export const requiredOAuthConnectedConstraints = {
  flow: "unique(connectedFlow.moduleId,connectedFlow.flowId)",
  flowCommand: "unique(connectedFlow.moduleId,connectedFlow.commandId)",
  stateDigest: "unique(connectedFlow.stateDigest)",
  client: "unique(connectedClient.clientKey)",
  cohort: "unique(connectedCohort.cohortKey)",
  grant: "unique(connectedGrant.moduleId,connectedGrant.grantId)",
  grantIdentity:
    "unique(connectedGrant.moduleId,connectedGrant.subjectId,connectedGrant.profileKey,connectedGrant.activeIdentityKey)",
  admission: "unique(connectedAdmission.admissionId)",
  command: "unique(connectedCommand.moduleId,connectedCommand.commandId)",
} as const;

export const requiredOAuthConnectedRevocationConstraints = {
  job: "unique(connectedRevocation.jobId)",
} as const;

/** Existing ownership only; workers never allocate or acquire a tuple. */
export type OAuthConnectedOwnershipRead<T extends Table, O extends Table, N> =
  | {
      readonly mode: "integrated";
      readonly tuple: Omit<OAuthOwnershipMutation<T, O, N>["tuple"], "encodeInsert">;
    }
  | {
      readonly mode: "separate";
      readonly tuple: Omit<OAuthOwnershipMutation<T, O, N>["tuple"], "encodeInsert">;
      readonly external: Omit<
        Extract<OAuthOwnershipMutation<T, O, N>, { readonly mode: "separate" }>["external"],
        "encodeInsert"
      >;
    };

export interface OAuthConnectedAuthorityMapping<
  T extends Table,
  O extends Table,
  F extends Table,
  G extends Table,
  C extends Table,
  H extends Table,
  N,
> {
  readonly ownership: OAuthConnectedOwnershipRead<T, O, N>;
  readonly subjectId: SubjectIdCodec<N>;
  readonly flow: Omit<OAuthConnectedFlowTable<F, N>, "encodeInsert">;
  readonly grant: Omit<OAuthConnectedGrantTable<G, N>, "encodeInsert">;
  readonly client: Omit<OAuthConnectedClientRegistrationTable<C>, "encodeInsert">;
  readonly cohort: Omit<OAuthConnectedCohortTable<H>, "encodeInsert">;
  readonly clock: OAuthClock;
  readonly order: OAuthConnectedOrderCodec;
  readonly tupleConstraints: typeof requiredOAuthTupleConstraints;
  /** Safe metadata retention, never an expiry/quiescence proof for unresolved work. */
  readonly retentionMillis: number;
}

export interface OAuthConnectedMapping<
  S extends Table,
  AC extends Table,
  T extends Table,
  O extends Table,
  F extends Table,
  G extends Table,
  C extends Table,
  H extends Table,
  A extends Table,
  D extends Table,
  N,
  J extends Table = never,
> extends OAuthConnectedAuthorityMapping<T, O, F, G, C, H, N> {
  readonly ownership: OAuthOwnershipMutation<T, O, N>;
  readonly flow: OAuthConnectedFlowTable<F, N>;
  readonly grant: OAuthConnectedGrantTable<G, N>;
  readonly client: OAuthConnectedClientRegistrationTable<C>;
  readonly cohort: OAuthConnectedCohortTable<H>;
  readonly subject: OAuthConnectedSubjectTable<S>;
  readonly authority: OAuthAuthorityReadTable<AC>;
  readonly admission: OAuthConnectedAdmissionTable<A, N>;
  /** Same shared sign-in tables used by OAuthSignInPersistence. Enable only
   * alongside a nullable connected-flow subjectId and flow.encodeSignIn. */
  readonly signIn?: {
    readonly credential: OAuthCredentialReadTable<Table>;
    readonly flow: OAuthFlowTable<Table>;
  };
  readonly command: OAuthConnectedCommandTable<D, N>;
  readonly policy: OAuthConnectedSqlPolicy<N>;
  readonly constraints: typeof requiredOAuthConnectedConstraints;
  readonly revocation:
    | { readonly mode: "unsupported" }
    | {
        readonly mode: "cohort";
        readonly job: OAuthConnectedRevocationJobTable<J, N>;
        readonly constraints: typeof requiredOAuthConnectedRevocationConstraints;
      };
  /** Without an authoritative same-owner predicate, conservatively retain Owned.
   * Include login/other installed references; never filter away former-subject
   * work. This pure SQL constructor supports both bound values and correlated
   * column expressions with identical semantics; it performs no I/O.
   * Compare through the reference table's typed columns (for example, eq) so
   * native values use their encoders. Back the same-owner lookup with an index:
   * discovery applies this predicate before its candidate limit.
   * Connected references are checked separately. */
  readonly externalReference?: (
    input:
      | { readonly identityKey: string; readonly subjectId: N }
      | { readonly identityKey: SQL; readonly subjectId: SQL },
  ) => SQL;
}

export interface OAuthConnectedRevocationMapping<
  T extends Table,
  O extends Table,
  F extends Table,
  G extends Table,
  C extends Table,
  H extends Table,
  J extends Table,
  N,
> extends OAuthConnectedAuthorityMapping<T, O, F, G, C, H, N> {
  readonly job: Omit<OAuthConnectedRevocationJobTable<J, N>, "encodeInsert">;
  readonly constraints: typeof requiredOAuthConnectedRevocationConstraints;
}
