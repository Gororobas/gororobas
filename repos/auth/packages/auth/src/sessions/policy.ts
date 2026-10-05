import { DateTime, Effect, Schema } from "effect";

import { SessionConfigurationError, SessionInvalid } from "./errors";
import type { SessionCapabilities, SessionMetadata } from "./models";

const PositiveMillis = Schema.Int.check(Schema.isGreaterThan(0));

export const SessionPolicy = Schema.Struct({
  issuer: Schema.NonEmptyString,
  audience: Schema.NonEmptyString,
  generation: Schema.Natural,
  idleLifetimeMillis: PositiveMillis,
  absoluteLifetimeMillis: PositiveMillis,
  renewalIntervalMillis: PositiveMillis,
  /** Deployment-wide upper bound including tokens issued under older policy versions. */
  maximumIssuedAbsoluteLifetimeMillis: PositiveMillis,
  maximumTokenBytes: Schema.Int.check(Schema.isBetween({ minimum: 256, maximum: 1048576 })),
  requireImmediateInvalidation: Schema.Boolean,
});

export type SessionPolicy = typeof SessionPolicy.Type;

export const validateSessionPolicy = Effect.fn("validateSessionPolicy")(function* (
  input: SessionPolicy,
  capabilities: SessionCapabilities,
) {
  const policy = yield* Schema.decodeEffect(SessionPolicy)(input).pipe(
    Effect.mapError(() => SessionConfigurationError.make({ reason: "policy" })),
  );

  if (
    policy.renewalIntervalMillis >= policy.idleLifetimeMillis ||
    policy.idleLifetimeMillis > policy.absoluteLifetimeMillis ||
    policy.absoluteLifetimeMillis > policy.maximumIssuedAbsoluteLifetimeMillis
  )
    return yield* SessionConfigurationError.make({ reason: "policy" });
  if (policy.requireImmediateInvalidation && capabilities.subjectInvalidation !== "immediate") {
    return yield* SessionConfigurationError.make({ reason: "capability" });
  }

  return Object.freeze(policy);
});

export const validateSessionTimeline = Effect.fn("validateSessionTimeline")(function* (
  session: Pick<SessionMetadata, "assurance" | "issuedAt" | "expiresAt" | "absoluteExpiresAt">,
  policy: SessionPolicy,
) {
  const now = DateTime.toEpochMillis(yield* DateTime.now);
  const authenticatedAt = DateTime.toEpochMillis(session.assurance.authenticatedAt);
  const issuedAt = DateTime.toEpochMillis(session.issuedAt);
  const expiresAt = DateTime.toEpochMillis(session.expiresAt);
  const absoluteExpiresAt = DateTime.toEpochMillis(session.absoluteExpiresAt);
  const evidence = session.assurance.evidence;

  if (
    evidence === undefined ||
    !evidence.some((proof) => DateTime.toEpochMillis(proof.verifiedAt) === authenticatedAt) ||
    evidence.some((proof) => {
      const verifiedAt = DateTime.toEpochMillis(proof.verifiedAt);

      return verifiedAt > issuedAt;
    })
  )
    return yield* SessionInvalid.make({});
  if (
    authenticatedAt > issuedAt ||
    issuedAt > now ||
    now >= expiresAt ||
    expiresAt > absoluteExpiresAt ||
    expiresAt <= issuedAt ||
    absoluteExpiresAt - authenticatedAt > policy.maximumIssuedAbsoluteLifetimeMillis
  )
    return yield* SessionInvalid.make({});

  return session;
});

export const statefulCapabilities: SessionCapabilities = Object.freeze({
  mode: "stateful",
  listing: true,
  perSessionRevocation: true,
  subjectInvalidation: "immediate",
  renewal: "single-winner",
  positiveCacheMillis: 0,
});

export const statelessCapabilities: SessionCapabilities = Object.freeze({
  mode: "stateless",
  listing: false,
  perSessionRevocation: false,
  subjectInvalidation: "absolute-expiry",
  renewal: "replayable",
  positiveCacheMillis: 0,
});

export const stateAssistedCapabilities: SessionCapabilities = Object.freeze({
  mode: "state-assisted",
  listing: false,
  perSessionRevocation: true,
  subjectInvalidation: "immediate",
  renewal: "replayable",
  positiveCacheMillis: 0,
});
