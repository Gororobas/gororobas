import { Effect, Schema } from "effect";

import { ProofConfigurationError } from "./errors";

const Positive = Schema.Int.check(Schema.isGreaterThan(0));
const Millis = Positive.check(Schema.isLessThanOrEqualTo(2592000000));

export const ProofBudget = Schema.Struct({
  limit: Positive.check(Schema.isLessThanOrEqualTo(1000000)),
  windowMillis: Millis,
});

export type ProofBudget = typeof ProofBudget.Type;

export const ProofAbusePolicy = Schema.Struct({
  /** Count newly issued proofs only; suppression and exact replay do not charge issuance. */
  issues: ProofBudget,
  attempts: ProofBudget,
  /** These windows survive consumption, failure, and every resend/flow/request ID. */
  subjectIssues: ProofBudget,
  subjectAttempts: ProofBudget,
  /** Global issuance limit; host ingress separately covers every request and network. */
  actionIssues: ProofBudget,
  /** Attempt limits also cover unknown subjects and rotating identifiers. */
  actionAttempts: ProofBudget,
  resendCooldownMillis: Schema.Natural,
});

export type ProofAbusePolicy = typeof ProofAbusePolicy.Type;

export const ProofPolicy = Schema.Struct({
  lifetimeMillis: Millis,
  continuationLifetimeMillis: Millis,
  maximumFailedAttempts: Positive.check(Schema.isLessThanOrEqualTo(100)),
  maximumDeliveryAttempts: Positive.check(Schema.isLessThanOrEqualTo(5)),
  deliveryClaimMillis: Millis,
  deliveryRetryMillis: Millis,
  /** Retain request fingerprints and terminal generations through this retry horizon. */
  requestRetentionMillis: Millis,
  abuse: ProofAbusePolicy,
});

export type ProofPolicy = typeof ProofPolicy.Type;

export const validateProofPolicy = Effect.fn("validateProofPolicy")(function* (input: ProofPolicy) {
  const policy = yield* Schema.decodeEffect(ProofPolicy)(input).pipe(
    Effect.mapError(() => ProofConfigurationError.make({ reason: "policy" })),
  );

  if (
    policy.requestRetentionMillis <
      Math.max(
        policy.lifetimeMillis,
        policy.continuationLifetimeMillis,
        policy.abuse.issues.windowMillis,
        policy.abuse.attempts.windowMillis,
        policy.abuse.subjectIssues.windowMillis,
        policy.abuse.subjectAttempts.windowMillis,
        policy.abuse.actionIssues.windowMillis,
        policy.abuse.actionAttempts.windowMillis,
      ) ||
    policy.deliveryClaimMillis >= policy.lifetimeMillis ||
    policy.abuse.resendCooldownMillis >= policy.lifetimeMillis
  )
    return yield* ProofConfigurationError.make({ reason: "policy" });

  return Object.freeze({
    ...policy,
    abuse: Object.freeze({
      ...policy.abuse,
      issues: Object.freeze(policy.abuse.issues),
      attempts: Object.freeze(policy.abuse.attempts),
      subjectIssues: Object.freeze(policy.abuse.subjectIssues),
      subjectAttempts: Object.freeze(policy.abuse.subjectAttempts),
      actionIssues: Object.freeze(policy.abuse.actionIssues),
      actionAttempts: Object.freeze(policy.abuse.actionAttempts),
    }),
  });
});

/** Default proof lifetimes and abuse limits. Enforcement remains server-side. */
export const defaultProofPolicy: ProofPolicy = {
  lifetimeMillis: 300_000,
  continuationLifetimeMillis: 30_000,
  maximumFailedAttempts: 5,
  maximumDeliveryAttempts: 1,
  deliveryClaimMillis: 10_000,
  deliveryRetryMillis: 30_000,
  requestRetentionMillis: 3_600_000,
  abuse: {
    issues: { limit: 5, windowMillis: 3_600_000 },
    attempts: { limit: 10, windowMillis: 300_000 },
    subjectIssues: { limit: 5, windowMillis: 3_600_000 },
    subjectAttempts: { limit: 10, windowMillis: 300_000 },
    actionIssues: { limit: 1000, windowMillis: 3_600_000 },
    actionAttempts: { limit: 1000, windowMillis: 300_000 },
    resendCooldownMillis: 30_000,
  },
};
