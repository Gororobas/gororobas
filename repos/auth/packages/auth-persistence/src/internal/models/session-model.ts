import type { TokenDigest } from "@yielded/auth/Schema";
import {
  type AuthenticationRequirement,
  type AuthenticationEvidence,
  type SecurityRevision,
  type SessionId,
  type PendingAuthenticationRecord,
  type PendingAuthenticationState,
  type StatefulSessionRecord,
} from "@yielded/auth/Sessions";
import type { DateTime, Effect } from "effect";

import type { TableModel as Table, SqlExpression } from "../query-operations";
import type { PersistenceMappingError, SubjectIdCodec } from "./common";

type ColumnKey<T extends Table> = T["column"];

export interface SessionIdCodec<NativeId> {
  readonly toNative: (id: SessionId) => Effect.Effect<NativeId, PersistenceMappingError>;
  readonly toSession: (id: NativeId) => Effect.Effect<SessionId, PersistenceMappingError>;
  readonly equals: (left: NativeId, right: NativeId) => boolean;
}

export interface SessionSubjectTables<Subject extends Table, NativeId> {
  readonly subject: {
    readonly table: Subject["table"];
    readonly id: ColumnKey<Subject>;
    readonly status: ColumnKey<Subject>;
    readonly securityRevision: ColumnKey<Subject>;
    readonly isActiveStatus: (value: unknown) => boolean;
    readonly decodeRequirement: (
      row: Subject["select"],
    ) => Effect.Effect<AuthenticationRequirement, PersistenceMappingError>;
    readonly nextSecurityRevision?: (
      current: SecurityRevision,
    ) => Effect.Effect<SecurityRevision, PersistenceMappingError>;
    readonly nextSecurityRevisionSync?: (current: SecurityRevision) => SecurityRevision;
  };
  readonly subjectId: SubjectIdCodec<NativeId>;
}

export interface SessionAuthorityTables<
  Subject extends Table,
  Credential extends Table,
  NativeId,
> extends SessionSubjectTables<Subject, NativeId> {
  readonly credential: {
    readonly table: Credential["table"];
    readonly subjectId: ColumnKey<Credential>;
    readonly credentialId: ColumnKey<Credential>;
    readonly revision: ColumnKey<Credential>;
    /** Optional consumer status predicate; omitted means every stored credential row is active. */
    readonly status?: ColumnKey<Credential>;
    readonly isActiveStatus?: (value: unknown) => boolean;
  };
}

export interface SessionFlowTables<Flow extends Table, NativeSubjectId> {
  readonly flow: {
    readonly table: Flow["table"];
    readonly flowId: ColumnKey<Flow>;
    readonly subjectId: ColumnKey<Flow>;
    readonly state: ColumnKey<Flow>;
    readonly pendingDigest: ColumnKey<Flow>;
    readonly dedupUntil: ColumnKey<Flow>;
    readonly pendingStateValue: unknown;
    readonly establishedStateValue: unknown;
    readonly encodeInstant: (instant: DateTime.Utc) => unknown;
    readonly decodeInstant: (
      native: unknown,
    ) => Effect.Effect<DateTime.Utc, PersistenceMappingError>;
    readonly encodePendingInsert: (input: {
      readonly evidence: AuthenticationEvidence;
      readonly subjectId: NativeSubjectId;
      readonly pendingDigest: TokenDigest;
      readonly dedupUntil: DateTime.Utc;
    }) => Flow["insert"];
    readonly encodeEstablishedInsert: (input: {
      readonly evidence: AuthenticationEvidence;
      readonly subjectId: NativeSubjectId;
      readonly dedupUntil: DateTime.Utc;
    }) => Flow["insert"];
  };
}

export interface StatefulSessionTables<
  Claims,
  Session extends Table,
  Flow extends Table,
  NativeSubjectId,
  NativeSessionId,
> extends SessionFlowTables<Flow, NativeSubjectId> {
  readonly session: {
    readonly table: Session["table"];
    readonly sessionId: ColumnKey<Session>;
    readonly subjectId: ColumnKey<Session>;
    readonly digest: ColumnKey<Session>;
    readonly version: ColumnKey<Session>;
    readonly securityRevision: ColumnKey<Session>;
    readonly issuedAt: ColumnKey<Session>;
    readonly expiresAt: ColumnKey<Session>;
    readonly absoluteExpiresAt: ColumnKey<Session>;
    readonly encodeInstant: (instant: DateTime.Utc) => unknown;
    readonly encodeInsert: (
      record: StatefulSessionRecord<Claims>,
      ids: {
        readonly subjectId: NativeSubjectId;
        readonly sessionId: NativeSessionId;
      },
    ) => Session["insert"];
    /** Persist the prepared credentialVersion and retain exact private provenance. */
    readonly encodeRotation: (record: StatefulSessionRecord<Claims>) => Partial<Session["insert"]>;
    readonly decode: (
      row: Session["select"],
    ) => Effect.Effect<StatefulSessionRecord<Claims>, PersistenceMappingError>;
    readonly allocateId?: Effect.Effect<NativeSessionId, PersistenceMappingError>;
    readonly allocateIdSync?: () => NativeSessionId;
    readonly allocateVersion?: Effect.Effect<SecurityRevision, PersistenceMappingError>;
    readonly allocateVersionSync?: () => SecurityRevision;
  };
  readonly sessionId: SessionIdCodec<NativeSessionId>;
}

export interface PendingAuthenticationTables<
  Claims,
  Pending extends Table,
  Flow extends Table,
  NativeSubjectId,
> extends SessionFlowTables<Flow, NativeSubjectId> {
  readonly pending: {
    readonly table: Pending["table"];
    readonly digest: ColumnKey<Pending>;
    readonly version: ColumnKey<Pending>;
    readonly flowId: ColumnKey<Pending>;
    readonly subjectId: ColumnKey<Pending>;
    readonly bindingDigest: ColumnKey<Pending>;
    readonly expiresAt: ColumnKey<Pending>;
    readonly attemptLimit: ColumnKey<Pending>;
    readonly failedAttempts: ColumnKey<Pending>;
    readonly consumed: ColumnKey<Pending>;
    readonly encodeInstant: (instant: DateTime.Utc) => unknown;
    readonly encodeInsert: (
      record: PendingAuthenticationRecord<Claims>,
      input: {
        readonly subjectId: NativeSubjectId;
        readonly failedAttempts: 0;
        readonly consumed: false;
      },
    ) => Pending["insert"];
    readonly decode: (
      row: Pending["select"],
    ) => Effect.Effect<PendingAuthenticationRecord<Claims>, PersistenceMappingError>;
    /** Decodes original evidence and storage guards only. The internal pending
     * context lookup must not execute unrelated consumer Claims transforms. */
    readonly decodeContext: (
      row: Pending["select"],
    ) => Effect.Effect<PendingAuthenticationState, PersistenceMappingError>;
    readonly allocateVersion?: Effect.Effect<SecurityRevision, PersistenceMappingError>;
    readonly allocateVersionSync?: () => SecurityRevision;
  };
}

export interface SignedSessionValidityTables<
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> {
  readonly tombstone: {
    readonly table: Tombstone["table"];
    readonly subjectId: ColumnKey<Tombstone>;
    readonly sessionId: ColumnKey<Tombstone>;
    readonly absoluteExpiresAt: ColumnKey<Tombstone>;
    readonly encodeInstant: (instant: DateTime.Utc) => unknown;
    readonly decodeInstant: (
      native: unknown,
    ) => Effect.Effect<DateTime.Utc, PersistenceMappingError>;
    readonly encodeInsert: (input: {
      readonly subjectId: NativeSubjectId;
      readonly sessionId: NativeSessionId;
      readonly absoluteExpiresAt: DateTime.Utc;
    }) => Tombstone["insert"];
  };
  readonly sessionId: SessionIdCodec<NativeSessionId>;
}

export interface RequiredSessionConstraints {
  readonly sessionDigest: "unique(session.digest)";
  readonly flowId: "unique(flow.flowId)";
}

export interface RequiredPendingAuthenticationConstraints {
  readonly pendingDigest: "unique(pending.digest)";
  readonly pendingFlow: "unique(pending.flowId)";
  readonly flowId: "unique(flow.flowId)";
}

export interface RequiredStatefulPendingConstraints
  extends RequiredSessionConstraints, RequiredPendingAuthenticationConstraints {}

export interface RequiredSignedValidityConstraints {
  readonly tombstoneOwner: "unique(tombstone.subjectId,tombstone.sessionId)";
}

export const requiredSessionConstraints: RequiredSessionConstraints = {
  sessionDigest: "unique(session.digest)",
  flowId: "unique(flow.flowId)",
};

export const requiredPendingAuthenticationConstraints: RequiredPendingAuthenticationConstraints = {
  pendingDigest: "unique(pending.digest)",
  pendingFlow: "unique(pending.flowId)",
  flowId: "unique(flow.flowId)",
};

export const requiredStatefulPendingConstraints: RequiredStatefulPendingConstraints = {
  ...requiredSessionConstraints,
  ...requiredPendingAuthenticationConstraints,
};

export const requiredSignedValidityConstraints: RequiredSignedValidityConstraints = {
  tombstoneOwner: "unique(tombstone.subjectId,tombstone.sessionId)",
};

export interface SessionConstraintClassifier {
  /**
   * Match only the named unique constraints declared by this mapping. Broad
   * SQL/constraint classifiers can relabel application or NOT NULL failures as
   * a domain conflict.
   */
  readonly isConstraintConflict: (cause: unknown) => boolean;
}

export type AuthenticationAuthorityMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
> = SessionAuthorityTables<Subject, Credential, NativeSubjectId> &
  SessionConstraintClassifier &
  (
    | {
        /** Omit for single-factor authority installations. Pending input then fails closed. */
        readonly pending?: undefined;
      }
    | {
        readonly pending: PendingAuthenticationTables<Claims, Pending, Flow, NativeSubjectId>;
        readonly constraints: RequiredPendingAuthenticationConstraints;
      }
  );

export type StatefulSessionMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Session extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
  NativeSessionId,
> = SessionAuthorityTables<Subject, Credential, NativeSubjectId> &
  StatefulSessionTables<Claims, Session, Flow, NativeSubjectId, NativeSessionId> &
  SessionConstraintClassifier &
  (
    | {
        /** Omit when this session module does not support pending MFA completion. */
        readonly pending?: undefined;
        readonly constraints: RequiredSessionConstraints;
      }
    | {
        readonly pending: PendingAuthenticationTables<
          Claims,
          Pending,
          Flow,
          NativeSubjectId
        >["pending"];
        readonly constraints: RequiredStatefulPendingConstraints;
      }
  );

export type PendingAuthenticationMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Pending extends Table,
  Flow extends Table,
  NativeSubjectId,
> = SessionAuthorityTables<Subject, Credential, NativeSubjectId> &
  PendingAuthenticationTables<Claims, Pending, Flow, NativeSubjectId> &
  SessionConstraintClassifier & {
    readonly constraints: RequiredPendingAuthenticationConstraints;
  };

export type SignedSessionValidityMapping<
  Subject extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = SessionSubjectTables<Subject, NativeSubjectId> &
  SignedSessionValidityTables<Tombstone, NativeSubjectId, NativeSessionId> &
  SessionConstraintClassifier & {
    readonly constraints: RequiredSignedValidityConstraints;
  };

/** D1 evaluates these expressions inside the atomic batch, after queueing delay.
 * `engineNow` must use the exact native representation of every mapped instant
 * column. `engineNowMillis` is Unix epoch milliseconds for proof freshness.
 * Changes to the consumer's factor policy MUST bump subject.securityRevision.
 * Supply the authoritative primary D1 database, never a replica-affined
 * `withSession` handle, because verification and security revision reads must
 * observe completed revocation writes across clients.
 */
export interface D1SessionClockMapping<Expression extends SqlExpression = SqlExpression> {
  readonly d1: {
    readonly engineNow: Expression;
    readonly engineNowMillis: Expression;
    readonly activeSubjectStatusValue: unknown;
    /** Required when `credential.status` is mapped. */
    readonly activeCredentialStatusValue?: unknown;
  };
}

export type D1AuthenticationAuthorityMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
  Expression extends SqlExpression = SqlExpression,
> = AuthenticationAuthorityMapping<Claims, Subject, Credential, Flow, Pending, NativeSubjectId> &
  D1SessionClockMapping<Expression>;

export type D1PendingAuthenticationMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Pending extends Table,
  Flow extends Table,
  NativeSubjectId,
  Expression extends SqlExpression = SqlExpression,
> = PendingAuthenticationMapping<Claims, Subject, Credential, Pending, Flow, NativeSubjectId> &
  D1SessionClockMapping<Expression>;

export type D1StatefulSessionMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Session extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
  NativeSessionId,
  Expression extends SqlExpression = SqlExpression,
> = StatefulSessionMapping<
  Claims,
  Subject,
  Credential,
  Session,
  Flow,
  Pending,
  NativeSubjectId,
  NativeSessionId
> &
  D1SessionClockMapping<Expression>;

export type D1SignedSessionValidityMapping<
  Subject extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
  Expression extends SqlExpression = SqlExpression,
> = SignedSessionValidityMapping<Subject, Tombstone, NativeSubjectId, NativeSessionId> &
  D1SessionClockMapping<Expression>;
