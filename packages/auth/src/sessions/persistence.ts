import type { DateTime, Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { SubjectId, TokenDigest } from "../Schema";
import type { PrepareSessionCommit } from "./commit";
import type {
  PendingAuthenticationInvalid,
  SessionConflict,
  SessionInvalid,
  SessionUnavailable,
  StaleAuthentication,
} from "./errors";
import type {
  AuthenticationEvidence,
  PendingConsumption,
  SecurityRevision,
  SessionId,
  SessionMetadata,
  SessionAuthenticationProvenance,
  SessionCredentialVersion,
} from "./models";

export interface StatefulSessionRecord<Claims> extends SessionMetadata {
  readonly claims: Claims;
  readonly digest: TokenDigest;
  readonly version: SecurityRevision;
  readonly provenance: SessionAuthenticationProvenance;
  readonly credentialVersion: SessionCredentialVersion;
}

/** Consumer mapping owns IDs, digest uniqueness, native timestamps, and each atomic commit. */
export interface StatefulSessionPersistence<Claims> {
  /**
   * Insert only if the subject is active and the SAME revision captured before
   * credential verification still matches. Duplicate evidence.flowId before absoluteExpiresAt MUST fail SessionConflict.
   * Interactive owners reject it before prepare. Ordered-batch owners may prepare
   * a speculative value during a concurrent race, but MUST discard its receipt
   * and events when the guarded batch loses. Never return an existing row: its digest cannot
   * recover the original bearer and does not match this attempt's new secret. Pending consumption and insertion
   * are one commit. Recheck current factor policy, proof freshness and both expiry
   * bounds against the clock at the conditional commit. Never replace evidence with a newly read revision.
   */
  readonly establish: <A>(
    input: {
      readonly session: Omit<StatefulSessionRecord<Claims>, "sessionId" | "version">;
      readonly evidence: AuthenticationEvidence;
      /** Trusted handoff: allocate a distinct session ID and preserve the supplied
       * session.assurance exactly, including authenticatedAt. Still assess current
       * requirements/freshness at commit. The initial expiry already caps source
       * liveness; do not extend it or couple subsequent renewal/revocation. */
      readonly handoffSourceSessionId?: SessionId;
      readonly pending?: PendingConsumption;
      readonly now: DateTime.Utc;
    },
    prepare: PrepareSessionCommit<StatefulSessionRecord<Claims>, A>,
  ) => Effect.Effect<
    PreparedCommit<A>,
    StaleAuthentication | PendingAuthenticationInvalid | SessionConflict | SessionUnavailable
  >;
  /** Check current digest, active subject/revision, revocation, and expiry authoritatively. */
  readonly verify: (input: {
    readonly digest: TokenDigest;
    readonly now: DateTime.Utc;
  }) => Effect.Effect<StatefulSessionRecord<Claims>, SessionInvalid | SessionUnavailable>;
  /** One CAS winner; check live digest/version/revision and both expiry bounds against a fresh clock at the actual commit. Set issuedAt to that clock; preserve authenticatedAt/absoluteExpiresAt and exact private provenance. Rotate credentialVersion from the prepared input independently of the authority-allocated row version. No upsert. */
  readonly rotate: <A>(
    input: {
      readonly sessionId: SessionId;
      readonly expectedDigest: TokenDigest;
      readonly expectedVersion: SecurityRevision;
      readonly expectedSecurityRevision: SecurityRevision;
      readonly nextDigest: TokenDigest;
      readonly nextCredentialVersion: SessionCredentialVersion;
      readonly nextExpiresAt: DateTime.Utc;
      readonly now: DateTime.Utc;
    },
    prepare: PrepareSessionCommit<StatefulSessionRecord<Claims>, A>,
  ) => Effect.Effect<PreparedCommit<A>, SessionConflict | SessionInvalid | SessionUnavailable>;
  readonly revokeDigest: <A>(
    digest: TokenDigest,
    prepare: PrepareSessionCommit<boolean, A>,
  ) => Effect.Effect<PreparedCommit<A>, SessionUnavailable>;
  readonly revoke: <A>(
    input: {
      readonly subjectId: SubjectId;
      readonly sessionId: SessionId;
      readonly expectedSecurityRevision: SecurityRevision;
    },
    prepare: PrepareSessionCommit<void, A>,
  ) => Effect.Effect<PreparedCommit<A>, StaleAuthentication | SessionUnavailable>;
  /** Bump subject security revision in the SAME authority as revocation and establishment. */
  readonly revokeAll: <A>(
    input: {
      readonly subjectId: SubjectId;
      readonly expectedSecurityRevision: SecurityRevision;
    },
    prepare: PrepareSessionCommit<void, A>,
  ) => Effect.Effect<PreparedCommit<A>, StaleAuthentication | SessionUnavailable>;
}

export interface SessionRepository {
  /** Stable owner-scoped pagination; never return bearer digests or application rows. */
  readonly list: (input: {
    readonly subjectId: SubjectId;
    readonly cursor?: string;
    readonly limit: number;
    readonly now: DateTime.Utc;
  }) => Effect.Effect<
    { readonly sessions: ReadonlyArray<SessionMetadata>; readonly nextCursor?: string },
    SessionUnavailable
  >;
}

/** Explicitly state-assisted signed sessions. No positive validity cache is permitted.
 * Tombstones MUST be keyed by (subjectId, sessionId), or the authority must prove
 * target ownership before any global sessionId mutation. The caller session alone
 * does not prove ownership of an arbitrary management target.
 */
export interface SignedSessionValidity {
  readonly verify: (
    session: SessionMetadata,
    now: DateTime.Utc,
  ) => Effect.Effect<void, SessionInvalid | SessionUnavailable>;
  readonly revoke: <A>(
    input: {
      readonly subjectId: SubjectId;
      readonly sessionId: SessionId;
      readonly absoluteExpiresAt: DateTime.Utc;
      readonly expectedSecurityRevision: SecurityRevision;
    },
    prepare: PrepareSessionCommit<void, A>,
  ) => Effect.Effect<PreparedCommit<A>, StaleAuthentication | SessionUnavailable>;
  readonly revokeAll: <A>(
    input: {
      readonly subjectId: SubjectId;
      readonly expectedSecurityRevision: SecurityRevision;
    },
    prepare: PrepareSessionCommit<void, A>,
  ) => Effect.Effect<PreparedCommit<A>, StaleAuthentication | SessionUnavailable>;
}
