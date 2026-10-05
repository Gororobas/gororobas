import { type DateTime, type Effect, Schema } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import { TokenDigest } from "../Schema";
import type { PrepareSessionCommit } from "./commit";
import type {
  SessionConflict,
  SessionStepUpInvalid,
  SessionUnavailable,
  StaleAuthentication,
} from "./errors";
import {
  AuthenticationFlowId,
  AuthenticationRequirement,
  AuthenticationRevision,
  AssuranceAlternative,
  SecurityRevision,
  SessionCredentialVersion,
  SessionId,
  type AuthenticationEvidence,
  type SessionInspection,
} from "./models";
import type { PendingAuthenticationContext } from "./PendingAuthentication";

export const SessionStepUpProfileId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9._-]{1,128}$/),
).pipe(Schema.brand("effect-auth/SessionStepUpProfileId"));

export type SessionStepUpProfileId = typeof SessionStepUpProfileId.Type;

export const SessionStepUpRequirement = Schema.Struct({
  ...AuthenticationRequirement.fields,
  alternatives: Schema.NonEmptyArray(
    Schema.Struct({
      ...AssuranceAlternative.fields,
      factors: AssuranceAlternative.fields.factors.check(Schema.isMaxLength(3)),
      minimumCredentials: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
    }),
  ).check(Schema.isMaxLength(16)),
});

export const SessionStepUpProfile = Schema.Struct({
  profileId: SessionStepUpProfileId,
  generation: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
  requirement: SessionStepUpRequirement,
  lifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 900000 })),
  attemptLimit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
});

export type SessionStepUpProfile = typeof SessionStepUpProfile.Type;

export const StepUpPending = Schema.TaggedStruct("StepUpPending", {
  profileId: SessionStepUpProfileId,
  expiresAt: Schema.DateTimeUtcFromMillis,
});

export type StepUpPending = typeof StepUpPending.Type;

export const SessionStepUpIntent = Schema.TaggedStruct("SessionStepUpIntent", {
  digest: TokenDigest,
  version: SecurityRevision,
  flowId: AuthenticationFlowId,
  bindingDigest: TokenDigest,
  revision: AuthenticationRevision,
  sourceKind: Schema.Literals(["Stateful", "StateAssistedSigned", "StatelessSigned"]),
  sourceSessionId: SessionId,
  sourceCredentialVersion: SessionCredentialVersion,
  sourceAuthenticatedAt: Schema.DateTimeUtcFromMillis,
  sourceExpiresAt: Schema.DateTimeUtcFromMillis,
  sourceAbsoluteExpiresAt: Schema.DateTimeUtcFromMillis,
  profileId: SessionStepUpProfileId,
  profileGeneration: SessionStepUpProfile.fields.generation,
  profileDigest: TokenDigest,
  requirement: SessionStepUpProfile.fields.requirement,
  expiresAt: Schema.DateTimeUtcFromMillis,
  attemptLimit: SessionStepUpProfile.fields.attemptLimit,
});

export type SessionStepUpIntent = typeof SessionStepUpIntent.Type;

/** Private guard from the SAME authoritative read as inspection. */
export interface SessionStepUpSource<Claims> {
  readonly inspection: SessionInspection<Claims>;
  readonly guard:
    | {
        readonly _tag: "Stateful";
        readonly digest: TokenDigest;
        readonly rowVersion: SecurityRevision;
      }
    | { readonly _tag: "StateAssistedSigned" }
    | { readonly _tag: "StatelessSigned" };
}

export type SessionStepUpReplacement<Claims> =
  | {
      readonly _tag: "Stateful";
      readonly inspection: SessionInspection<Claims>;
      readonly expectedDigest: TokenDigest;
      readonly expectedRowVersion: SecurityRevision;
      readonly nextDigest: TokenDigest;
    }
  | {
      readonly _tag: "StateAssistedSigned";
      readonly inspection: SessionInspection<Claims>;
      readonly tombstoneSessionId: SessionId;
      readonly tombstoneUntil: DateTime.Utc;
    }
  | { readonly _tag: "StatelessSigned"; readonly inspection: SessionInspection<Claims> };

/** No bearer, callback or crypto work. All fields are preplanned under the core's
 * trusted snapshots. Native owners must preserve the exact replacement metadata. */
export interface SessionStepUpCompletionPlan<Claims> {
  readonly intent: SessionStepUpIntent;
  readonly source: SessionStepUpSource<Claims>;
  readonly evidence: AuthenticationEvidence;
  readonly baseRequirement: AuthenticationRequirement;
  readonly profileRequirement: AuthenticationRequirement;
  readonly now: DateTime.Utc;
  readonly replacement: SessionStepUpReplacement<Claims>;
}

/** Optional, distinct from login pending. No implementation may compose standalone
 * rotate/revoke/pending commits to approximate the one-owner complete transition. */
export interface SessionStepUpPersistence<Claims> {
  /** Check active exact revisions and all source/time bounds; unique flow/digest.
   * Prepare BEFORE the actual commit. Ambient owners must join or reject before writes. */
  readonly create: <A>(
    input: Omit<SessionStepUpIntent, "version">,
    now: DateTime.Utc,
    prepare: PrepareSessionCommit<SessionStepUpIntent, A>,
  ) => Effect.Effect<PreparedCommit<A>, StaleAuthentication | SessionConflict | SessionUnavailable>;
  /** Claims-free authoritative kind/source/revision/expiry/consumed/budget checks. */
  readonly context: (input: {
    readonly digest: TokenDigest;
    readonly now: DateTime.Utc;
  }) => Effect.Effect<PendingAuthenticationContext, SessionStepUpInvalid | SessionUnavailable>;
  readonly read: (input: {
    readonly digest: TokenDigest;
    readonly bindingDigest: TokenDigest;
    readonly now: DateTime.Utc;
  }) => Effect.Effect<SessionStepUpIntent, SessionStepUpInvalid | SessionUnavailable>;
  /** Authenticate binding internally, atomically cap/increment attempts, return a
   * decision VALUE. Unknown commits are unavailable, never automatically retried. */
  readonly reject: <A>(
    input: { readonly digest: TokenDigest; readonly now: DateTime.Utc },
    prepare: PrepareSessionCommit<{ readonly _tag: "Rejected" }, A>,
  ) => Effect.Effect<PreparedCommit<A>, SessionUnavailable>;
  /** Recheck intent version/status/budget, exact source/profile/revisions and BOTH
   * requirements at the actual commit clock. Stateful: guard source digest/row and
   * credential versions, update in place + consume. Stored sourceKind must match
   * both the inspected guard and replacement tag, including after deployment changes. Assisted: insert absent source
   * lineage tombstone + consume. Pure signed: consume only; old source remains live.
   * Preserve source authenticatedAt/absolute expiry and exact prepared metadata.
   * A guard loss discards prepared bearer/events, including under an outer owner.
   * The callback is synchronous and must run before physical commit, including D1.
   */
  readonly complete: <A>(
    plan: SessionStepUpCompletionPlan<Claims>,
    prepare: PrepareSessionCommit<SessionInspection<Claims>, A>,
  ) => Effect.Effect<
    PreparedCommit<A>,
    SessionStepUpInvalid | StaleAuthentication | SessionConflict | SessionUnavailable
  >;
}
