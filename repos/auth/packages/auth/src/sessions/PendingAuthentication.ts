import { DateTime, Effect, Schema } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import { TokenDigest } from "../Schema";
import type { PrepareSessionCommit } from "./commit";
import {
  PendingAuthenticationInvalid,
  type SessionConflict,
  type SessionUnavailable,
  type StaleAuthentication,
} from "./errors";
import {
  AuthenticationFlowId,
  AuthenticationRevision,
  type AuthenticationEvidence,
  type SecurityRevision,
} from "./models";

export interface PendingAuthenticationState {
  readonly digest: TokenDigest;
  readonly version: SecurityRevision;
  readonly evidence: AuthenticationEvidence;
  readonly expiresAt: DateTime.Utc;
  readonly attemptLimit: number;
}

export interface PendingAuthenticationRecord<Claims> extends PendingAuthenticationState {
  readonly claims: Claims;
}

/** Internal correlation for an independently verified additional factor. This is
 * neither a session nor reusable authorization; final completion rechecks it. */
export const PendingAuthenticationContext = Schema.Struct({
  flowId: AuthenticationFlowId,
  bindingDigest: TokenDigest,
  revision: AuthenticationRevision,
  expiresAtMillis: Schema.Int,
});

export type PendingAuthenticationContext = typeof PendingAuthenticationContext.Type;

const decodePendingAuthenticationContext = Schema.decodeEffect(PendingAuthenticationContext);

/** Detaches the entire graph and projects away storage/private fields. */
export const snapshotPendingAuthenticationContext = Effect.fn(
  "snapshotPendingAuthenticationContext",
)(function* (input: PendingAuthenticationContext) {
  const value = yield* decodePendingAuthenticationContext(input).pipe(
    Effect.mapError(() => PendingAuthenticationInvalid.make({})),
  );

  // A decoder that returns its input unchanged still needs the copy:
  // the caller's object must stay unfrozen.
  if (value !== input) {
    for (const credential of value.revision.credentials) {
      Object.freeze(credential);
    }
    Object.freeze(value.revision.credentials);
    Object.freeze(value.revision);

    return Object.freeze(value);
  }

  return Object.freeze({
    flowId: value.flowId,
    bindingDigest: value.bindingDigest,
    expiresAtMillis: value.expiresAtMillis,
    revision: Object.freeze({
      subjectId: value.revision.subjectId,
      securityRevision: value.revision.securityRevision,
      credentials: Object.freeze(
        value.revision.credentials.map((item) =>
          Object.freeze({
            credentialId: item.credentialId,
            revision: item.revision,
          }),
        ),
      ),
    }),
  });
});

export const pendingAuthenticationContext = (record: PendingAuthenticationState) =>
  snapshotPendingAuthenticationContext({
    flowId: record.evidence.flowId,
    bindingDigest: record.evidence.bindingDigest,
    revision: record.evidence.revision,
    expiresAtMillis: DateTime.toEpochMillis(record.expiresAt),
  });

/** Optional MFA persistence; minimal single-factor sessions do not require this capability. */
export interface PendingAuthentication<Claims> {
  /** Authoritative non-consuming private-bearer lookup. Reject expired, consumed,
   * exhausted, stale or inactive subject/credential state. Do not decode Claims.
   * Locks end at this read; final completion must recheck after factor verification.
   */
  readonly context: (input: {
    readonly digest: TokenDigest;
    readonly now: DateTime.Utc;
  }) => Effect.Effect<
    PendingAuthenticationContext,
    PendingAuthenticationInvalid | SessionUnavailable
  >;

  /** Conditional on active subject and original revisions, unique by initiating flow.
   * Duplicate flow MUST fail SessionConflict. Interactive owners reject before
   * prepare. Ordered-batch owners may prepare speculatively during a concurrent
   * race, but MUST discard the losing receipt and events. Never return an existing
   * record paired with this attempt's newly generated secret.
   */
  readonly create: <A>(
    input: Omit<PendingAuthenticationRecord<Claims>, "version">,
    now: DateTime.Utc,
    prepare: PrepareSessionCommit<PendingAuthenticationRecord<Claims>, A>,
  ) => Effect.Effect<PreparedCommit<A>, StaleAuthentication | SessionConflict | SessionUnavailable>;
  /** Authoritative expiry, binding, revision, consumed status, and budget checks. */
  readonly read: (input: {
    readonly digest: TokenDigest;
    readonly bindingDigest: TokenDigest;
    readonly now: DateTime.Utc;
  }) => Effect.Effect<
    PendingAuthenticationRecord<Claims>,
    PendingAuthenticationInvalid | SessionUnavailable
  >;
  /** Prepare a rejection VALUE; translate it to a public failure only after the root
   * receipt commits, so outer rollback/error translation cannot erase attempts. */
  readonly reject: <A>(
    input: {
      readonly digest: TokenDigest;
      readonly bindingDigest: TokenDigest;
      readonly now: DateTime.Utc;
    },
    prepare: PrepareSessionCommit<{ readonly _tag: "Rejected" }, A>,
  ) => Effect.Effect<PreparedCommit<A>, SessionUnavailable>;
}
