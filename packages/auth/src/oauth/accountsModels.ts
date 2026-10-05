import { Schema } from "effect";

import { RequestBindingFlowId } from "../operations/requestBinding";
import { TokenDigest } from "../Schema";
import { SessionInvalidationWindow } from "../sessions/invalidation";
import {
  AuthenticationEvidence,
  AuthenticationRequirement,
  AuthenticationProof,
  AssuranceAlternative,
} from "../sessions/models";
import {
  OAuthClaimId,
  OAuthCredentialSnapshot,
  OAuthInstant,
  OAuthModuleId,
  OAuthSealedTransaction,
  OAuthSignInBegin,
  OAuthSignInComplete,
  OAuthSignInPolicy,
  OAuthSignInTransactionContext,
  OAuthCommandId,
  OAuthVerifiedExternalIdentity,
} from "./signInModels";

export class OAuthActionRequired extends Schema.TaggedError<OAuthActionRequired>()(
  "OAuthActionRequired",
  {},
) {}

export const OAuthAccountsPolicy = Schema.Struct({
  ...OAuthSignInPolicy.fields,
  maximumEvidenceAgeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300000 })),
  requireImmediateInvalidation: Schema.Boolean,
});

export type OAuthAccountsPolicy = typeof OAuthAccountsPolicy.Type;

export const OAuthActionDigest = TokenDigest.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
);

export const OAuthAccountRevision = OAuthCredentialSnapshot.fields.revision;
export type OAuthAccountRevision = typeof OAuthAccountRevision.Type;

export const OAuthLinkTransactionContext = Schema.Struct({
  ...OAuthSignInTransactionContext.fields,
  namespace: Schema.Literal("effect-auth/oauth-link-context/v1"),
  revision: OAuthAccountRevision,
  maximumEvidenceAgeMillis: OAuthAccountsPolicy.fields.maximumEvidenceAgeMillis,
});

export type OAuthLinkTransactionContext = typeof OAuthLinkTransactionContext.Type;

export const OAuthLinkPendingFlow = Schema.Struct({
  context: OAuthLinkTransactionContext,
  sealed: OAuthSealedTransaction,
  retentionUntilMillis: OAuthInstant,
});

export type OAuthLinkPendingFlow = typeof OAuthLinkPendingFlow.Type;

export const OAuthLinkClaim = Schema.Struct({
  flow: OAuthLinkPendingFlow,
  claimId: OAuthClaimId,
  claimedAtMillis: OAuthInstant,
  claimExpiresAtMillis: OAuthInstant,
});

export type OAuthLinkClaim = typeof OAuthLinkClaim.Type;

const proof = Schema.optionalKey(
  Schema.RedactedFromValue(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16384))),
);

export const OAuthLinkBegin = Schema.Struct({ ...OAuthSignInBegin.fields, actionProof: proof });

export const OAuthLinkComplete = Schema.Struct({
  ...OAuthSignInComplete.fields,
  actionProof: proof,
});

export const OAuthUnlink = Schema.Struct({
  commandId: OAuthCommandId,
  credentialId: OAuthCredentialSnapshot.fields.credentialId,
  actionProof: proof,
});

export const OAuthActionChallenge = Schema.Struct({
  moduleId: OAuthModuleId,
  action: Schema.Literals(["link-begin", "link-complete", "unlink"]),
  flowId: RequestBindingFlowId,
  commandId: OAuthCommandId,
  revision: OAuthAccountRevision,
  /** Hash of the exact link context or unlink credential; no client authority. */
  intentDigest: OAuthActionDigest,
  bindingDigest: OAuthActionDigest,
});

export type OAuthActionChallenge = typeof OAuthActionChallenge.Type;

export const OAuthActionAuthorization = Schema.Struct({
  challenge: OAuthActionChallenge,
  evidence: Schema.Struct({
    ...AuthenticationEvidence.fields,
    revision: OAuthAccountRevision,
    flowId: AuthenticationEvidence.fields.flowId.check(Schema.isMaxLength(256)),
    bindingDigest: OAuthActionDigest,
    proofs: Schema.NonEmptyArray(
      Schema.Struct({
        ...AuthenticationProof.fields,
        method: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
        credentialId: OAuthCredentialSnapshot.fields.credentialId,
        factors: AuthenticationProof.fields.factors.check(Schema.isMaxLength(8)),
      }),
    ).check(Schema.isMaxLength(64)),
  }),
  requirement: Schema.Struct({
    ...AuthenticationRequirement.fields,
    alternatives: Schema.NonEmptyArray(
      Schema.Struct({
        ...AssuranceAlternative.fields,
        factors: AssuranceAlternative.fields.factors.check(Schema.isMaxLength(8)),
        minimumCredentials: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
      }),
    ).check(Schema.isMaxLength(64)),
  }),
});

export type OAuthActionAuthorization = typeof OAuthActionAuthorization.Type;

export const OAuthLinked = Schema.Union([
  Schema.TaggedStruct("Linked", {
    credentialId: OAuthCredentialSnapshot.fields.credentialId,
    changed: Schema.Literal(true),
    returnTarget: OAuthLinkTransactionContext.fields.returnTarget,
    invalidation: SessionInvalidationWindow,
  }),
  Schema.TaggedStruct("Linked", {
    credentialId: OAuthCredentialSnapshot.fields.credentialId,
    changed: Schema.Literal(false),
    returnTarget: OAuthLinkTransactionContext.fields.returnTarget,
    invalidation: Schema.optionalKey(Schema.Never),
  }),
]);

export const OAuthUnlinked = Schema.TaggedStruct("Unlinked", {
  credentialId: OAuthCredentialSnapshot.fields.credentialId,
  invalidation: SessionInvalidationWindow,
});

export const OAuthLinkResult = Schema.Union([
  OAuthLinked,
  Schema.TaggedStruct("Cancelled", {
    returnTarget: OAuthLinkTransactionContext.fields.returnTarget,
  }),
]);

export const OAuthLinkAccess = Schema.Struct({
  moduleId: OAuthModuleId,
  generation: OAuthAccountsPolicy.fields.generation,
  subjectId: OAuthAccountRevision.fields.subjectId,
  flowId: RequestBindingFlowId,
  provider: OAuthSignInComplete.fields.provider,
  callbackId: OAuthSignInComplete.fields.callbackId,
  stateDigest: OAuthLinkTransactionContext.fields.stateDigest,
  requestBindingVerifier: OAuthLinkTransactionContext.fields.requestBindingVerifier,
  requestBindingExpiresAtMillis: OAuthInstant,
  responseIssuer: Schema.optionalKey(OAuthLinkTransactionContext.fields.issuer),
  nowMillis: OAuthInstant,
});

export type OAuthLinkAccess = typeof OAuthLinkAccess.Type;

export const OAuthLinkIssueDecision = Schema.Union([
  Schema.TaggedStruct("Issued", { flow: OAuthLinkPendingFlow }),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthLinkClaimDecision = Schema.Union([
  Schema.TaggedStruct("Claimed", { claim: OAuthLinkClaim }),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthLinkOutcome = Schema.Union([
  Schema.TaggedStruct("Verified", { identity: OAuthVerifiedExternalIdentity }),
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Ambiguous", {}),
]);

export type OAuthLinkOutcome = typeof OAuthLinkOutcome.Type;

export const OAuthLinkDecision = Schema.Union([
  Schema.TaggedStruct("Linked", { credential: OAuthCredentialSnapshot, changed: Schema.Boolean }),
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
  Schema.TaggedStruct("Ambiguous", {}),
]);

export const OAuthUnlinkInspection = Schema.Union([
  Schema.TaggedStruct("Target", { credential: OAuthCredentialSnapshot }),
  Schema.TaggedStruct("Replay", { result: OAuthUnlinked }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
]);

export const OAuthUnlinkDecision = Schema.Union([
  Schema.TaggedStruct("Unlinked", { result: OAuthUnlinked, replayed: Schema.Boolean }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
  Schema.TaggedStruct("LastSignInMethod", {}),
]);
