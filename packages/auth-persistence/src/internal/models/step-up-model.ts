import type { SecurityRevision, SessionStepUpIntent } from "@yielded/auth/Sessions";
import type { DateTime, Effect } from "effect";

import type { TableModel as Table, SqlExpression } from "../query-operations";
import type { PersistenceMappingError } from "./common";
import type {
  D1SessionClockMapping,
  SessionAuthorityTables,
  SessionConstraintClassifier,
  SessionIdCodec,
  SignedSessionValidityTables,
  StatefulSessionTables,
} from "./session-model";

type ColumnKey<T extends Table> = T["column"];

/** Distinct from login-pending storage. Snapshot is TEXT encoded by the core's
 * SessionStepUpIntent schema; it contains no Claims and needs no consumer decoder. */
export interface SessionStepUpIntentTables<Intent extends Table, NativeSubjectId> {
  readonly intent: {
    readonly table: Intent["table"];
    readonly digest: ColumnKey<Intent>;
    readonly version: ColumnKey<Intent>;
    readonly flowId: ColumnKey<Intent>;
    readonly subjectId: ColumnKey<Intent>;
    readonly bindingDigest: ColumnKey<Intent>;
    readonly snapshot: ColumnKey<Intent>;
    readonly expiresAt: ColumnKey<Intent>;
    readonly attemptLimit: ColumnKey<Intent>;
    readonly failedAttempts: ColumnKey<Intent>;
    readonly consumed: ColumnKey<Intent>;
    readonly encodeInstant: (instant: DateTime.Utc) => unknown;
    /** Consumer fields/defaults; the adapter sets all mapped security columns. */
    readonly encodeInsert: (
      intent: SessionStepUpIntent,
      input: {
        readonly subjectId: NativeSubjectId;
      },
    ) => Intent["insert"];
    readonly allocateVersion?: Effect.Effect<SecurityRevision, PersistenceMappingError>;
    readonly allocateVersionSync?: () => SecurityRevision;
  };
}

export interface RequiredSessionStepUpConstraints {
  readonly intentDigest: "unique(intent.digest)";
  readonly intentFlow: "unique(intent.flowId)";
}

export const requiredSessionStepUpConstraints: RequiredSessionStepUpConstraints = {
  intentDigest: "unique(intent.digest)",
  intentFlow: "unique(intent.flowId)",
};

/** Fixed source discriminator is checked against every stored intent. A minimal
 * pure-signed installation does not provide dummy session or tombstone tables. */
export type SessionStepUpSourceTables<
  Claims,
  Session extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> =
  | {
      readonly kind: "StatelessSigned";
    }
  | ({
      readonly kind: "StateAssistedSigned";
      readonly constraints: {
        readonly tombstoneOwner: "unique(tombstone.subjectId,tombstone.sessionId)";
      };
    } & SignedSessionValidityTables<Tombstone, NativeSubjectId, NativeSessionId>)
  | {
      readonly kind: "Stateful";
      readonly constraints: {
        readonly sessionDigest: "unique(session.digest)";
      };
      readonly sessionId: SessionIdCodec<NativeSessionId>;
      /** encodeRotation must replace Claims, provenance, and the queryable security
       * fields together; it must not retain the old proof payload. */
      readonly session: StatefulSessionTables<
        Claims,
        Session,
        Table,
        NativeSubjectId,
        NativeSessionId
      >["session"] & {
        readonly credentialVersion: ColumnKey<Session>;
        readonly authenticatedAt: ColumnKey<Session>;
      };
    };

export type SessionStepUpMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Intent extends Table,
  Session extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = SessionAuthorityTables<Subject, Credential, NativeSubjectId> &
  SessionStepUpIntentTables<Intent, NativeSubjectId> &
  SessionConstraintClassifier & {
    readonly source: SessionStepUpSourceTables<
      Claims,
      Session,
      Tombstone,
      NativeSubjectId,
      NativeSessionId
    >;
    readonly constraints: RequiredSessionStepUpConstraints;
  };

export type D1SessionStepUpMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Intent extends Table,
  Session extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
  Expression extends SqlExpression = SqlExpression,
> = SessionStepUpMapping<
  Claims,
  Subject,
  Credential,
  Intent,
  Session,
  Tombstone,
  NativeSubjectId,
  NativeSessionId
> &
  D1SessionClockMapping<Expression>;
