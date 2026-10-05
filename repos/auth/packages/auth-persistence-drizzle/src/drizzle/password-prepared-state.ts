import {
  PasswordUnavailable,
  PasswordAction,
  PasswordCommandId,
  PasswordCredentialSnapshot,
  PasswordPreparedConfiguration,
  PasswordPreparedIntentId,
  PasswordPreparedReservation,
  PasswordPreparedReset,
  PasswordPreparedRequirement,
  snapshotPasswordPreparedReservation,
  snapshotPasswordPreparedReady,
  encodePasswordPreparedReady,
  type PasswordPreparedReady,
  type PasswordPreparedMutation,
  type PasswordPreparedPersistence,
} from "@yielded/auth/Password";
import { ProofBinding, ProofContinuationId, ProofPurpose } from "@yielded/auth/Proofs";
import { SubjectId, TokenDigest } from "@yielded/auth/Schema";
import {
  SessionInvalidationWindow,
  AuthenticationProof,
  AuthenticationRequirement,
  type AuthenticationRevision,
} from "@yielded/auth/Sessions";
import { DateTime, Effect, Redacted, Schema } from "effect";

import { passwordSqlKernel } from "./password-sql";

export const unavailable = () => PasswordUnavailable.make({});
const Instant = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 8640000000000000 }));
const Label = Schema.NonEmptyString.check(Schema.isMaxLength(256));

export const CompletionInput = Schema.Struct({
  moduleId: Label,
  purpose: ProofPurpose,
  continuationId: ProofContinuationId,
  continuationDigest: TokenDigest.check(Schema.isMaxLength(256)),
  binding: ProofBinding,
  nowMillis: Instant,
});

export const ContextInput = Schema.Struct({
  moduleId: Label,
  generation: PasswordPreparedConfiguration.fields.generation,
  digest: TokenDigest.check(Schema.isMaxLength(256)),
  nowMillis: Instant,
});

const ReserveInput = Schema.Struct({
  moduleId: Label,
  generation: PasswordPreparedConfiguration.fields.generation,
  intentId: PasswordPreparedIntentId,
  commandId: PasswordCommandId,
  action: PasswordAction,
  subjectId: SubjectId.check(Schema.isMaxLength(256)),
  nowMillis: Instant,
  policy: PasswordPreparedConfiguration,
  invalidation: SessionInvalidationWindow,
  reset: Schema.optionalKey(PasswordPreparedReset),
  completion: Schema.optionalKey(CompletionInput),
});

const reserveCodec = Schema.fromJsonString(ReserveInput);

export const snapshotReserve = (input: Parameters<PasswordPreparedPersistence["reserve"]>[0]) =>
  Schema.encodeEffect(reserveCodec)(input).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.String.check(Schema.isMaxLength(131072)))),
    Effect.flatMap(Schema.decodeEffect(reserveCodec)),
    Effect.mapError(unavailable),
  );

const reservationCodec = Schema.fromJsonString(PasswordPreparedReservation);

export const encodeReservation = (input: PasswordPreparedReservation) =>
  snapshotPasswordPreparedReservation(input).pipe(
    Effect.flatMap(Schema.encodeEffect(reservationCodec)),
    Effect.mapError(unavailable),
  );

export const decodeReservation = (input: string) =>
  Schema.decodeEffect(Schema.String.check(Schema.isMaxLength(131072)))(input).pipe(
    Effect.flatMap(Schema.decodeEffect(reservationCodec)),
    Effect.flatMap(snapshotPasswordPreparedReservation),
    Effect.mapError(unavailable),
  );

export const reservationOf = (ready: PasswordPreparedReady): PasswordPreparedReservation => {
  const {
    replacement: _replacement,
    challenge: _challenge,
    baseEvidence: _evidence,
    digest: _digest,
    issuedAtMillis: _issued,
    expiresAtMillis: _expires,
    ...reservation
  } = ready;

  return { ...reservation, _tag: "Preparing" };
};

export const sameRevision = (a: AuthenticationRevision, b: AuthenticationRevision) =>
  a.subjectId === b.subjectId &&
  a.securityRevision === b.securityRevision &&
  a.credentials.length === b.credentials.length &&
  a.credentials.every((c) =>
    b.credentials.some((d) => c.credentialId === d.credentialId && c.revision === d.revision),
  );

const scopeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));
const invalidationJson = Schema.encodeSync(Schema.fromJsonString(SessionInvalidationWindow));
const proofJson = Schema.encodeSync(Schema.fromJsonString(AuthenticationProof));

export const identifierScope = (
  record: Pick<PasswordPreparedReservation, "credential" | "revision">,
) =>
  record.credential === undefined
    ? scopeJson(["prepared-subject", record.revision.subjectId])
    : scopeJson([
        "prepared-identifier",
        record.credential.identifier.namespace,
        record.credential.identifier.value,
      ]);

const credentialCodec = Schema.fromJsonString(PasswordCredentialSnapshot);

const sameCredential = Effect.fn("DrizzlePasswordPrepared.sameCredential")(function* (
  a: PasswordPreparedReservation["credential"],
  b: PasswordPreparedReservation["credential"],
) {
  if (a === undefined || b === undefined) return a === b;

  return (
    (yield* Schema.encodeEffect(credentialCodec)(a).pipe(Effect.mapError(unavailable))) ===
    (yield* Schema.encodeEffect(credentialCodec)(b).pipe(Effect.mapError(unavailable)))
  );
});

const requirementJson = Schema.encodeSync(
  Schema.fromJsonString(AuthenticationRequirement.fields.alternatives),
);

const requirementShape = (value: AuthenticationRequirement) => requirementJson(value.alternatives);

export const snapshotMutation = Effect.fn("DrizzlePasswordPrepared.snapshotMutation")(function* (
  input: PasswordPreparedMutation,
) {
  const intent = yield* snapshotPasswordPreparedReady(input.intent);
  const mutation = yield* passwordSqlKernel.snapshotMutationInput(input.mutation);

  const capturedRequirement = yield* Schema.decodeEffect(PasswordPreparedRequirement)(
    input.capturedRequirement,
  ).pipe(Effect.mapError(unavailable));

  const currentRequirement = yield* Schema.decodeEffect(PasswordPreparedRequirement)(
    input.currentRequirement,
  ).pipe(Effect.mapError(unavailable));

  const original = intent.challenge,
    actual = mutation.authorization.challenge;

  if (
    mutation.moduleId !== intent.moduleId ||
    mutation.commandId !== intent.commandId ||
    !sameRevision(mutation.expectedRevision, intent.revision) ||
    !(yield* sameCredential(mutation.credential, intent.credential)) ||
    Redacted.value(mutation.replacement.verifier) !== Redacted.value(intent.replacement.verifier) ||
    mutation.replacement.normalization !== intent.replacement.normalization ||
    actual.moduleId !== original.moduleId ||
    actual.action !== original.action ||
    actual.commandId !== original.commandId ||
    actual.bindingDigest !== original.bindingDigest ||
    actual.targetCredentialId !== original.targetCredentialId ||
    !sameRevision(actual.revision, original.revision) ||
    invalidationJson(mutation.invalidation) !== invalidationJson(intent.invalidation) ||
    requirementShape(capturedRequirement) !== requirementShape(intent.capturedRequirement) ||
    capturedRequirement.maximumAgeMillis > intent.capturedRequirement.maximumAgeMillis
  )
    return yield* unavailable();

  return { intent, mutation, capturedRequirement, currentRequirement, nowMillis: input.nowMillis };
});

export const evidenceCurrent = (
  input: PasswordPreparedMutation,
  current: AuthenticationRequirement,
  now: number,
) => {
  const requirements = [
    input.mutation.authorization.requirement,
    input.intent.capturedRequirement,
    input.capturedRequirement,
    current,
    input.currentRequirement,
  ];

  if (
    requirementShape(input.currentRequirement) !== requirementShape(current) ||
    input.currentRequirement.maximumAgeMillis > current.maximumAgeMillis ||
    now < input.intent.issuedAtMillis ||
    now >= input.intent.expiresAtMillis ||
    !requirements.every((requirement) =>
      passwordSqlKernel.evidenceSatisfiedAt(
        input.mutation.authorization.evidence,
        requirement,
        now,
      ),
    )
  )
    return false;
  const age = Math.min(...requirements.map((requirement) => requirement.maximumAgeMillis));

  return (input.intent.baseEvidence?.proofs ?? []).every((proof) => {
    const verified = DateTime.toEpochMillis(proof.verifiedAt);

    return (
      verified <= now &&
      now - verified < age &&
      input.mutation.authorization.evidence.proofs.some(
        (actual) => proofJson(actual) === proofJson(proof),
      )
    );
  });
};

export const sameReady = Effect.fn("DrizzlePasswordPrepared.sameReady")(function* (
  a: PasswordPreparedReady,
  b: PasswordPreparedReady,
) {
  return (yield* encodePasswordPreparedReady(a)) === (yield* encodePasswordPreparedReady(b));
});
