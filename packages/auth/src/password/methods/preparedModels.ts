import { DateTime, Effect, Predicate, Redacted, Schema } from "effect";

import { LoginIdentifier } from "../../identity/models";
import { ProofBinding, ProofContinuationId } from "../../proofs/models";
import { SubjectId, TokenDigest } from "../../Schema";
import { snapshotAuthenticationEvidence } from "../../sessions/assurance";
import { SessionInvalidationWindow } from "../../sessions/invalidation";
import {
  AuthenticationEvidence,
  AuthenticationProof,
  AuthenticationRequirement,
  AssuranceAlternative,
  AuthenticationRevision,
  SecurityRevision,
} from "../../sessions/models";
import { PasswordMethodConfigurationError, PasswordUnavailable } from "./errors";
import {
  PasswordAction,
  PasswordActionChallenge,
  PasswordCommandId,
  PasswordCredentialSnapshot,
  PasswordReplacement,
} from "./models";
import { PasswordAttemptPolicy } from "./policy";
import {
  snapshotPasswordCredential,
  snapshotPasswordRequirement,
  snapshotPasswordRevision,
} from "./snapshot";

const Label = Schema.NonEmptyString.check(Schema.isMaxLength(256));
const Instant = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 8640000000000000 }));
const Opaque = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/));

export const PasswordPreparedIntentId = Opaque.pipe(
  Schema.brand("effect-auth/PasswordPreparedIntentId"),
);

export type PasswordPreparedIntentId = typeof PasswordPreparedIntentId.Type;
export const PasswordPreparedCredential = Schema.RedactedFromValue(Opaque);
export type PasswordPreparedCredential = typeof PasswordPreparedCredential.Type;

export const PasswordPreparedVersion = Label.pipe(
  Schema.brand("effect-auth/PasswordPreparedVersion"),
);

export type PasswordPreparedVersion = typeof PasswordPreparedVersion.Type;

export const PasswordPreparedConfiguration = Schema.Struct({
  generation: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  lifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 900000 })),
  preparationLifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300000 })),
  retentionMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 2592000000 })),
  maximumPendingPerSubject: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
  admission: Schema.Struct({
    identifier: PasswordAttemptPolicy.fields.identifier,
    subject: PasswordAttemptPolicy.fields.subject,
    action: PasswordAttemptPolicy.fields.action,
  }),
});

export type PasswordPreparedConfiguration = typeof PasswordPreparedConfiguration.Type;

export const validatePasswordPreparedConfiguration = Effect.fn(
  "validatePasswordPreparedConfiguration",
)(function* (input: PasswordPreparedConfiguration) {
  const p = yield* Schema.decodeEffect(PasswordPreparedConfiguration)(input).pipe(
    Effect.mapError(() => PasswordMethodConfigurationError.make({})),
  );

  if (
    p.retentionMillis <
    Math.max(
      p.preparationLifetimeMillis + p.lifetimeMillis,
      p.admission.identifier.windowMillis,
      p.admission.subject.windowMillis,
      p.admission.action.windowMillis,
    )
  )
    return yield* PasswordMethodConfigurationError.make({});

  return freezePlain(p);
});

export const PasswordPreparedRequirement = Schema.Struct({
  ...AuthenticationRequirement.fields,
  maximumAgeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 86400000 })),
  alternatives: Schema.NonEmptyArray(
    Schema.Struct({
      ...AssuranceAlternative.fields,
      factors: AssuranceAlternative.fields.factors.check(Schema.isMaxLength(3)),
      minimumCredentials: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
    }),
  ).check(Schema.isMaxLength(16)),
});

export type PasswordPreparedRequirement = typeof PasswordPreparedRequirement.Type;

const BoundedRevision = Schema.Struct({
  ...AuthenticationRevision.fields,
  subjectId: SubjectId.check(Schema.isMaxLength(256)),
  securityRevision: SecurityRevision.check(Schema.isMaxLength(256)),
  credentials: Schema.Array(
    Schema.Struct({
      credentialId: Label,
      revision: SecurityRevision.check(Schema.isMaxLength(256)),
    }),
  ).check(Schema.isMaxLength(64)),
});

const BoundedEvidence = Schema.Struct({
  ...AuthenticationEvidence.fields,
  revision: BoundedRevision,
  flowId: AuthenticationEvidence.fields.flowId.check(Schema.isMaxLength(256)),
  bindingDigest: TokenDigest.check(Schema.isMaxLength(256)),
  proofs: Schema.NonEmptyArray(
    Schema.Struct({
      ...AuthenticationProof.fields,
      method: Label,
      credentialId: Label,
      factors: AuthenticationProof.fields.factors.check(Schema.isMaxLength(3)),
    }),
  ).check(Schema.isMaxLength(64)),
});

const BoundedIdentifier = Schema.Struct({
  namespace: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  value: Schema.NonEmptyString.check(Schema.isMaxLength(1024)),
}).pipe(Schema.decodeTo(LoginIdentifier));

const BoundedCredential = Schema.Struct({
  ...PasswordCredentialSnapshot.fields,
  moduleId: Label,
  revision: BoundedRevision,
  credentialId: Label,
  credentialRevision: SecurityRevision.check(Schema.isMaxLength(256)),
  verifierVersion: SecurityRevision.check(Schema.isMaxLength(256)),
  identifier: BoundedIdentifier,
  identifierBindingRevision: SecurityRevision.check(Schema.isMaxLength(256)),
});

const BoundedChallenge = Schema.Struct({
  ...PasswordActionChallenge.fields,
  moduleId: Label,
  revision: BoundedRevision,
  targetCredentialId: Schema.optionalKey(Label),
  bindingDigest: TokenDigest.check(Schema.isMaxLength(256)),
});

export const PasswordPreparedReset = Schema.Struct({
  continuationId: ProofContinuationId,
  binding: ProofBinding,
});

export type PasswordPreparedReset = typeof PasswordPreparedReset.Type;

const ReservationFields = {
  moduleId: Label,
  generation: PasswordPreparedConfiguration.fields.generation,
  intentId: PasswordPreparedIntentId,
  version: PasswordPreparedVersion,
  commandId: PasswordCommandId,
  action: PasswordAction,
  revision: BoundedRevision,
  credential: Schema.optionalKey(BoundedCredential),
  capturedRequirement: PasswordPreparedRequirement,
  reset: Schema.optionalKey(PasswordPreparedReset),
  invalidation: SessionInvalidationWindow,
  createdAtMillis: Instant,
  preparationExpiresAtMillis: Instant,
  retainUntilMillis: Instant,
};

export const PasswordPreparedReservation = Schema.TaggedStruct("Preparing", ReservationFields);
export type PasswordPreparedReservation = typeof PasswordPreparedReservation.Type;

export const PasswordPreparedReady = Schema.TaggedStruct("Ready", {
  ...ReservationFields,
  replacement: PasswordReplacement,
  challenge: BoundedChallenge,
  baseEvidence: Schema.optionalKey(BoundedEvidence),
  digest: TokenDigest.check(Schema.isMaxLength(256)),
  issuedAtMillis: Instant,
  expiresAtMillis: Instant,
});

export type PasswordPreparedReady = typeof PasswordPreparedReady.Type;

export const PasswordPreparedResult = Schema.Union([
  Schema.TaggedStruct("Prepared", { intentId: PasswordPreparedIntentId, expiresAtMillis: Instant }),
  Schema.TaggedStruct("AlreadyExists", {}),
]);

export type PasswordPreparedResult = typeof PasswordPreparedResult.Type;

export interface PasswordPreparedContext {
  readonly intentId: PasswordPreparedIntentId;
  readonly action: PasswordAction;
  readonly challenge: typeof BoundedChallenge.Type;
  readonly capturedRequirement: PasswordPreparedRequirement;
  readonly baseEvidence?: AuthenticationEvidence;
  readonly expiresAtMillis: number;
}

/** Explicit private persistence codec: encodes the Redacted PHC verifier, never a
 * plaintext password. Do not log this value or expose it through an operation. */
export const PasswordPreparedReadyJson = Schema.fromJsonString(PasswordPreparedReady);
const BoundedRecord = Schema.String.check(Schema.isMaxLength(131072));

export const encodePasswordPreparedReady = Effect.fn("encodePasswordPreparedReady")(function* (
  value: PasswordPreparedReady,
) {
  if (
    !bounded(value) ||
    !Schema.is(Schema.toType(PasswordPreparedReady))(value) ||
    !relationships(value)
  )
    return yield* PasswordUnavailable.make({});

  return yield* Schema.encodeEffect(PasswordPreparedReadyJson)(value).pipe(
    Effect.flatMap(Schema.decodeEffect(BoundedRecord)),
    Effect.mapError(() => PasswordUnavailable.make({})),
  );
});

export const decodePasswordPreparedReady = (value: string) =>
  Schema.decodeEffect(BoundedRecord)(value).pipe(
    Effect.flatMap(Schema.decodeEffect(PasswordPreparedReadyJson)),
    Effect.flatMap(snapshotPasswordPreparedReady),
    Effect.mapError(() => PasswordUnavailable.make({})),
  );

const freezePlain = <A>(value: A): A => {
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);

    if (Schema.is(LoginIdentifier)(value)) Object.freeze(value);
    if (Array.isArray(value) || prototype === Object.prototype) {
      for (const item of Object.values(value)) freezePlain(item);
      Object.freeze(value);
    }
  }

  return value;
};

/** Conservative JSON upper bound before codec traversal/allocation: each UTF-16
 * unit may need six escaped bytes. Count keys, delimiters and numeric instants;
 * bounded iteration stops without first allocating Object.keys/JSON text. */
const withinRecordBudget = (input: unknown) => {
  let remaining = 131072,
    nodes = 0;

  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > 4096 || depth > 16) return false;
    if (Redacted.isRedacted(value)) return visit(Redacted.value(value), depth + 1);
    if (DateTime.isDateTime(value)) {
      remaining -= 24;

      return remaining >= 0;
    }
    if (typeof value === "string") {
      remaining -= value.length * 6 + 2;

      return remaining >= 0;
    }
    if (value === null || typeof value !== "object") {
      remaining -= 24;

      return remaining >= 0;
    }
    remaining -= 2;
    if (remaining < 0) return false;
    if (Array.isArray(value)) {
      if (value.length > 256) return false;
      for (const item of value) {
        remaining--;
        if (!visit(item, depth + 1)) return false;
      }

      return remaining >= 0;
    }
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      remaining -= key.length * 6 + 4;
      if (remaining < 0 || !visit(Reflect.get(value, key), depth + 1)) return false;
    }

    return remaining >= 0;
  };

  return visit(input, 0);
};

const bounded = (input: unknown) => {
  if (!withinRecordBudget(input) || !Predicate.isObject(input)) return false;

  const revision = (value: unknown) =>
    Predicate.isObject(value) &&
    Array.isArray(value.credentials) &&
    value.credentials.length <= 64 &&
    Schema.is(Schema.toType(BoundedRevision))(value) &&
    new Set(value.credentials.map((c) => c.credentialId)).size === value.credentials.length;

  const requirement = input.capturedRequirement;

  if (
    !revision(input.revision) ||
    !Predicate.isObject(requirement) ||
    !Array.isArray(requirement.alternatives) ||
    requirement.alternatives.length > 16 ||
    requirement.alternatives.some(
      (a) => !Predicate.isObject(a) || !Array.isArray(a.factors) || a.factors.length > 3,
    )
  )
    return false;
  if (
    input.credential !== undefined &&
    (!Predicate.isObject(input.credential) || !revision(input.credential.revision))
  )
    return false;
  if (
    input.challenge !== undefined &&
    (!Predicate.isObject(input.challenge) || !revision(input.challenge.revision))
  )
    return false;
  if (input.baseEvidence !== undefined) {
    const e = input.baseEvidence;

    if (
      !Predicate.isObject(e) ||
      !revision(e.revision) ||
      !Array.isArray(e.proofs) ||
      e.proofs.length > 64
    )
      return false;
  }
  if (input.reset !== undefined) {
    if (!Predicate.isObject(input.reset) || !Predicate.isObject(input.reset.binding)) return false;
    const b = input.reset.binding;

    if (b.revision !== undefined && !revision(b.revision)) return false;
    if (b.initiatorRevision !== undefined && !revision(b.initiatorRevision)) return false;
    if (
      !Predicate.isObject(b.identifier) ||
      !Schema.is(Schema.String.check(Schema.isMaxLength(1024)))(b.identifier.value) ||
      !Schema.is(Label)(b.flowId) ||
      !Schema.is(Label)(b.contextDigest)
    )
      return false;
  }

  return true;
};

const sameRevision = (a: AuthenticationRevision, b: AuthenticationRevision) =>
  a.subjectId === b.subjectId &&
  a.securityRevision === b.securityRevision &&
  a.credentials.length === b.credentials.length &&
  a.credentials.every((c) =>
    b.credentials.some((d) => c.credentialId === d.credentialId && c.revision === d.revision),
  );

const relationships = (value: PasswordPreparedReservation | PasswordPreparedReady) => {
  if (
    value.preparationExpiresAtMillis <= value.createdAtMillis ||
    value.retainUntilMillis < value.preparationExpiresAtMillis
  )
    return false;
  if (
    value.action === "add-password"
      ? value.credential !== undefined || value.reset !== undefined
      : value.credential === undefined
  )
    return false;
  if ((value.action === "reset-password") !== (value.reset !== undefined)) return false;
  if (value.credential !== undefined) {
    const c = value.credential;

    if (
      c.moduleId !== value.moduleId ||
      !sameRevision(c.revision, value.revision) ||
      !value.revision.credentials.some(
        (r) => r.credentialId === c.credentialId && r.revision === c.credentialRevision,
      )
    )
      return false;
  }
  if (
    value.reset !== undefined &&
    (value.reset.binding._tag !== "Subject" ||
      !sameRevision(value.reset.binding.revision, value.revision) ||
      value.reset.binding.identifier.namespace !== value.credential?.identifier.namespace ||
      value.reset.binding.identifier.value !== value.credential?.identifier.value)
  )
    return false;
  if (value._tag === "Ready") {
    const c = value.challenge;

    if (
      c.moduleId !== value.moduleId ||
      c.commandId !== value.commandId ||
      c.action !== value.action ||
      c.targetCredentialId !== value.credential?.credentialId ||
      !sameRevision(c.revision, value.revision)
    )
      return false;
    if (
      value.issuedAtMillis < value.createdAtMillis ||
      value.issuedAtMillis >= value.preparationExpiresAtMillis ||
      value.expiresAtMillis <= value.issuedAtMillis ||
      value.expiresAtMillis > value.retainUntilMillis
    )
      return false;
    if ((value.action === "change-password") !== (value.baseEvidence !== undefined)) return false;
    if (value.baseEvidence !== undefined) {
      const e = value.baseEvidence;

      if (
        !sameRevision(e.revision, value.revision) ||
        String(e.flowId) !== String(value.commandId) ||
        e.bindingDigest !== c.bindingDigest ||
        e.proofs.some((p) => !e.revision.credentials.some((r) => r.credentialId === p.credentialId))
      )
        return false;
    }
  }

  return true;
};

export const snapshotPasswordPreparedReservation = Effect.fn("snapshotPasswordPreparedReservation")(
  function* (input: PasswordPreparedReservation) {
    if (
      !bounded(input) ||
      !Schema.is(Schema.toType(PasswordPreparedReservation))(input) ||
      !relationships(input)
    )
      return yield* PasswordUnavailable.make({});
    const codec = Schema.fromJsonString(PasswordPreparedReservation);

    const value = yield* Schema.encodeEffect(codec)(input).pipe(
      Effect.flatMap(Schema.decodeEffect(BoundedRecord)),
      Effect.flatMap(Schema.decodeEffect(codec)),
      Effect.mapError(() => PasswordUnavailable.make({})),
    );

    return freezePlain({
      ...value,
      revision: snapshotPasswordRevision(value.revision),
      capturedRequirement: yield* snapshotPasswordRequirement(value.capturedRequirement),
      ...(value.credential === undefined
        ? {}
        : { credential: yield* snapshotPasswordCredential(value.credential) }),
    });
  },
);

export const snapshotPasswordPreparedReady = Effect.fn("snapshotPasswordPreparedReady")(function* (
  input: PasswordPreparedReady,
) {
  if (
    !bounded(input) ||
    !Schema.is(Schema.toType(PasswordPreparedReady))(input) ||
    !relationships(input)
  )
    return yield* PasswordUnavailable.make({});

  const value = yield* encodePasswordPreparedReady(input).pipe(
    Effect.flatMap(Schema.decodeEffect(PasswordPreparedReadyJson)),
    Effect.mapError(() => PasswordUnavailable.make({})),
  );

  const baseEvidence =
    value.baseEvidence === undefined
      ? undefined
      : yield* snapshotAuthenticationEvidence(value.baseEvidence).pipe(
          Effect.mapError(() => PasswordUnavailable.make({})),
        );

  const now = DateTime.toEpochMillis(yield* DateTime.now);

  if (baseEvidence?.proofs.some((p) => DateTime.toEpochMillis(p.verifiedAt) > now))
    return yield* PasswordUnavailable.make({});

  return freezePlain({
    ...value,
    revision: snapshotPasswordRevision(value.revision),
    challenge: { ...value.challenge, revision: snapshotPasswordRevision(value.challenge.revision) },
    capturedRequirement: yield* snapshotPasswordRequirement(value.capturedRequirement),
    ...(value.credential === undefined
      ? {}
      : { credential: yield* snapshotPasswordCredential(value.credential) }),
    ...(baseEvidence === undefined ? {} : { baseEvidence }),
  });
});
