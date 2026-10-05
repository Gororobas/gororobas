import { Schema } from "effect";

import { LoginIdentifier } from "../identity/models";
import { TokenDigest } from "../Schema";
import { AuthenticationRevision, CredentialRevision } from "../sessions/models";

const BoundedId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));

export const ProofId = BoundedId.pipe(Schema.brand("effect-auth/ProofId"));
export type ProofId = typeof ProofId.Type;
export const ProofRequestId = BoundedId.pipe(Schema.brand("effect-auth/ProofRequestId"));
export type ProofRequestId = typeof ProofRequestId.Type;
export const ProofDeliveryId = BoundedId.pipe(Schema.brand("effect-auth/ProofDeliveryId"));
export type ProofDeliveryId = typeof ProofDeliveryId.Type;
export const ProofContinuationId = BoundedId.pipe(Schema.brand("effect-auth/ProofContinuationId"));
export type ProofContinuationId = typeof ProofContinuationId.Type;
export const ProofVersion = BoundedId.pipe(Schema.brand("effect-auth/ProofVersion"));
export type ProofVersion = typeof ProofVersion.Type;
export const ProofPurpose = BoundedId.pipe(Schema.brand("effect-auth/ProofPurpose"));
export type ProofPurpose = typeof ProofPurpose.Type;

export const ProofInstant = Schema.Int.check(
  Schema.isBetween({ minimum: -8640000000000000, maximum: 8640000000000000 }),
);

const BoundedIdentifier = Schema.Struct({
  namespace: LoginIdentifier.fields.namespace.check(Schema.isMaxLength(256)),
  value: LoginIdentifier.fields.value.check(Schema.isMaxLength(2048)),
}).pipe(Schema.decodeTo(LoginIdentifier));

const BoundedRevision = Schema.Struct({
  ...AuthenticationRevision.fields,
  subjectId: AuthenticationRevision.fields.subjectId.check(Schema.isMaxLength(256)),
  securityRevision: AuthenticationRevision.fields.securityRevision.check(Schema.isMaxLength(256)),
  credentials: Schema.Array(
    Schema.Struct({
      credentialId: CredentialRevision.fields.credentialId.check(Schema.isMaxLength(256)),
      revision: CredentialRevision.fields.revision.check(Schema.isMaxLength(256)),
    }),
  ).check(Schema.isMaxLength(32)),
});

const FlowBinding = {
  flowId: BoundedId,
  contextDigest: TokenDigest.check(Schema.isMaxLength(256)),
};

export const IdentifierProofBinding = Schema.TaggedStruct("Identifier", {
  ...FlowBinding,
  identifier: BoundedIdentifier,
});

export const SubjectProofBinding = Schema.TaggedStruct("Subject", {
  ...FlowBinding,
  revision: BoundedRevision,
  identifier: BoundedIdentifier,
});

export const IdentifierChangeProofBinding = Schema.TaggedStruct("IdentifierChange", {
  ...FlowBinding,
  revision: BoundedRevision,
  identifier: BoundedIdentifier,
});

export const ProofBinding = Schema.Union([
  IdentifierProofBinding,
  SubjectProofBinding,
  IdentifierChangeProofBinding,
]);

export type ProofBinding = typeof ProofBinding.Type;

/** Same public shape for issued, duplicate, ineligible, and throttled requests. */
export const ProofReference = Schema.Struct({
  proofId: ProofId,
  purpose: ProofPurpose,
  keyId: BoundedId,
});

export type ProofReference = typeof ProofReference.Type;

export const ProofRequestReceipt = Schema.Struct({
  requestId: ProofRequestId,
  reference: ProofReference,
});

export type ProofRequestReceipt = typeof ProofRequestReceipt.Type;

export const ProofContinuation = Schema.Struct({
  continuationId: ProofContinuationId,
  purpose: ProofPurpose,
  expiresAtMillis: ProofInstant,
});

export type ProofContinuation = typeof ProofContinuation.Type;

export const ProofAttemptDecision = Schema.Union([
  Schema.TaggedStruct("Accepted", { continuation: ProofContinuation }),
  Schema.TaggedStruct("Rejected", {}),
]);

export type ProofAttemptDecision = typeof ProofAttemptDecision.Type;
export const ProofCompletionDecision = Schema.Literals(["completed", "rejected"]);
export type ProofCompletionDecision = typeof ProofCompletionDecision.Type;

export const ProofDeliveryOutcome = Schema.Union([
  Schema.TaggedStruct("Accepted", {}),
  Schema.TaggedStruct("DefiniteFailure", {
    reason: Schema.Literals(["recipient", "policy", "unavailable"]),
  }),
  Schema.TaggedStruct("Ambiguous", {}),
]);

export type ProofDeliveryOutcome = typeof ProofDeliveryOutcome.Type;

export const ProofDeliveryStatus = Schema.Literals([
  "accepted",
  "failed",
  "ambiguous",
  "unavailable",
  "not-dispatched",
]);

export type ProofDeliveryStatus = typeof ProofDeliveryStatus.Type;

export const ProofCleanupResult = Schema.Struct({
  removed: Schema.Natural,
  hasMore: Schema.Boolean,
});

export type ProofCleanupResult = typeof ProofCleanupResult.Type;
