import { Schema } from "effect";

import {
  OAuthConnectedConfiguration,
  OAuthConnectedOrder,
  OAuthConnectedStoredGrant,
  OAuthConnectedRevocationJob,
  OAuthConnectedTarget,
  OAuthGrantId,
} from "./connectedModels";
import { OAuthClaim, OAuthCredentialSnapshot } from "./signInModels";

/** A durable grant reservation is made before the sole provider exchange.
 * Its order participates in the same client/cohort ledger as connected flows.
 * There is no subject until sign-in resolves a verified local credential. */
export const OAuthSignInAccessClaim = Schema.Struct({
  claim: OAuthClaim,
  configuration: OAuthConnectedConfiguration,
  order: OAuthConnectedOrder,
});

export type OAuthSignInAccessClaim = typeof OAuthSignInAccessClaim.Type;

export const OAuthSignInAccessInspection = Schema.Union([
  Schema.TaggedStruct("Target", {
    grantId: OAuthGrantId,
    cohortGeneration: OAuthConnectedTarget.fields.cohortGeneration,
    previous: Schema.optionalKey(OAuthConnectedTarget),
  }),
  Schema.TaggedStruct("Quarantine", {
    grantId: OAuthGrantId,
    cohortGeneration: OAuthConnectedTarget.fields.cohortGeneration,
    previous: Schema.optionalKey(OAuthConnectedTarget),
  }),
  Schema.TaggedStruct("Rejected", {}),
]);

export type OAuthSignInAccessInspection = typeof OAuthSignInAccessInspection.Type;

export const OAuthSignInAccessOutcome = Schema.Union([
  Schema.TaggedStruct("Verified", {
    credential: OAuthCredentialSnapshot,
    grant: OAuthConnectedStoredGrant,
    previous: Schema.optionalKey(OAuthConnectedTarget),
    cleanup: Schema.optionalKey(OAuthConnectedRevocationJob),
    quarantine: Schema.Boolean,
  }),
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Unissued", {}),
  Schema.TaggedStruct("Ambiguous", {}),
]);

export type OAuthSignInAccessOutcome = typeof OAuthSignInAccessOutcome.Type;
