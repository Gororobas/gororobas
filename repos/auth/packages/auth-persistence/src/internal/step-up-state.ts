import {
  SessionStepUpInvalid,
  SessionUnavailable,
  AuthenticationEvidence,
  type AuthenticationRevision,
  SessionMetadata,
  SessionStepUpIntent,
  SessionStepUpRequirement,
  type SessionStepUpCompletionPlan,
  type StatefulSessionRecord,
} from "@yielded/auth/Sessions";
import { DateTime, Effect, Schema } from "effect";

export const stepUpIntentCodec = Schema.fromJsonString(SessionStepUpIntent);
const BoundedSnapshot = Schema.String.check(Schema.isMaxLength(131072));

export const encodeStepUpIntent = (intent: SessionStepUpIntent) =>
  Schema.encodeEffect(stepUpIntentCodec)(intent).pipe(
    Effect.flatMap(Schema.decodeEffect(BoundedSnapshot)),
    Effect.mapError(() => SessionUnavailable.make({})),
  );

export const decodeStepUpIntent = (snapshot: string) =>
  Schema.decodeEffect(BoundedSnapshot)(snapshot).pipe(
    Effect.flatMap(Schema.decodeEffect(stepUpIntentCodec)),
    Effect.mapError(() => SessionUnavailable.make({})),
  );

export const sameStepUpRevision = (left: AuthenticationRevision, right: AuthenticationRevision) =>
  left.subjectId === right.subjectId &&
  left.securityRevision === right.securityRevision &&
  left.credentials.length === right.credentials.length &&
  new Set(left.credentials.map((c) => c.credentialId)).size === left.credentials.length &&
  left.credentials.every((item) =>
    right.credentials.some(
      (other) => item.credentialId === other.credentialId && item.revision === other.revision,
    ),
  );

export const stepUpIntentLive = (
  intent: SessionStepUpIntent,
  kind: SessionStepUpIntent["sourceKind"],
  now: DateTime.Utc,
) => {
  const n = DateTime.toEpochMillis(now),
    authenticated = DateTime.toEpochMillis(intent.sourceAuthenticatedAt),
    idle = DateTime.toEpochMillis(intent.sourceExpiresAt),
    absolute = DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt),
    expires = DateTime.toEpochMillis(intent.expiresAt);

  return (
    intent.sourceKind === kind &&
    authenticated <= n &&
    n < expires &&
    expires <= idle &&
    idle <= absolute
  );
};

const evidenceEncoding = Schema.encodeSync(Schema.fromJsonString(AuthenticationEvidence));
const requirementEncoding = Schema.encodeSync(Schema.fromJsonString(SessionStepUpRequirement));
const metadataEncoding = Schema.encodeSync(Schema.fromJsonString(SessionMetadata));

/** Validate core-owned plans before driver allocation/SQL expansion. No bearer or Claims decoding. */
export const validateStepUpPlan = Effect.fn("DrizzleStepUp.validatePlan")(function* <Claims>(
  plan: SessionStepUpCompletionPlan<Claims>,
) {
  const { intent, source, replacement, evidence } = plan;
  const original = source.inspection;

  if (
    requirementEncoding(plan.profileRequirement) !== requirementEncoding(intent.requirement) ||
    replacement.inspection.session.subjectId !== evidence.revision.subjectId ||
    replacement.inspection.session.securityRevision !== evidence.revision.securityRevision ||
    intent.revision.credentials.some(
      (item) =>
        !evidence.revision.credentials.some(
          (actual) =>
            actual.credentialId === item.credentialId && actual.revision === item.revision,
        ),
    )
  )
    return yield* SessionStepUpInvalid.make({});
  if (
    intent.sourceKind !== source.guard._tag ||
    intent.sourceKind !== replacement._tag ||
    intent.sourceSessionId !== original.session.sessionId ||
    intent.sourceCredentialVersion !== original.credentialVersion ||
    !sameStepUpRevision(intent.revision, original.provenance.evidence.revision) ||
    intent.revision.subjectId !== evidence.revision.subjectId ||
    intent.revision.securityRevision !== evidence.revision.securityRevision ||
    intent.flowId !== evidence.flowId ||
    intent.bindingDigest !== evidence.bindingDigest ||
    DateTime.toEpochMillis(intent.sourceAuthenticatedAt) !==
      DateTime.toEpochMillis(original.session.assurance.authenticatedAt) ||
    DateTime.toEpochMillis(intent.sourceExpiresAt) !==
      DateTime.toEpochMillis(original.session.expiresAt) ||
    DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt) !==
      DateTime.toEpochMillis(original.session.absoluteExpiresAt) ||
    DateTime.toEpochMillis(intent.sourceAuthenticatedAt) !==
      DateTime.toEpochMillis(replacement.inspection.session.assurance.authenticatedAt) ||
    DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt) !==
      DateTime.toEpochMillis(replacement.inspection.session.absoluteExpiresAt) ||
    evidenceEncoding(replacement.inspection.provenance.evidence) !== evidenceEncoding(evidence)
  )
    return yield* SessionStepUpInvalid.make({});
  if (
    replacement._tag === "Stateful" &&
    (source.guard._tag !== "Stateful" ||
      source.guard.digest !== replacement.expectedDigest ||
      source.guard.rowVersion !== replacement.expectedRowVersion ||
      replacement.inspection.session.sessionId !== intent.sourceSessionId)
  )
    return yield* SessionStepUpInvalid.make({});
  if (
    replacement._tag === "StateAssistedSigned" &&
    (replacement.tombstoneSessionId !== intent.sourceSessionId ||
      DateTime.toEpochMillis(replacement.tombstoneUntil) !==
        DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt))
  )
    return yield* SessionStepUpInvalid.make({});
  if (
    replacement._tag !== "Stateful" &&
    replacement.inspection.session.sessionId === intent.sourceSessionId
  )
    return yield* SessionStepUpInvalid.make({});
});

/** Compare a consumer-decoded encoded update/readback with the intended rotation.
 * Claims are consumer-owned; their lossless round trip remains the codec contract. */
export const stepUpRotationMatches = <Claims>(
  plan: SessionStepUpCompletionPlan<Claims>,
  record: StatefulSessionRecord<Claims>,
) =>
  plan.replacement._tag === "Stateful" &&
  record.digest === plan.replacement.nextDigest &&
  record.credentialVersion === plan.replacement.inspection.credentialVersion &&
  metadataEncoding(record) === metadataEncoding(plan.replacement.inspection.session) &&
  evidenceEncoding(record.provenance.evidence) === evidenceEncoding(plan.evidence);
