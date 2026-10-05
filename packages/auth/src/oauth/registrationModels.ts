import { Schema } from "effect";

import { RequestBindingCredential, RequestBindingFlowId } from "../operations/requestBinding";
import { TokenDigest } from "../Schema";
import {
  OAuthClaimId,
  OAuthCommandId,
  OAuthDisplayProfile,
  OAuthExternalIdentity,
  OAuthInstant,
  OAuthModuleId,
  OAuthSignInTransactionContext,
} from "./signInModels";

export const OAuthRegistrationFingerprint = TokenDigest.check(Schema.isMaxLength(256));

export const OAuthRegistrationBearerDigest = TokenDigest.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
);

export const OAuthRegistrationReference = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{43}$/),
).pipe(Schema.brand("effect-auth/OAuthRegistrationReference"));

export type OAuthRegistrationReference = typeof OAuthRegistrationReference.Type;

export const OAuthRegistrationCredential = Schema.RedactedFromValue(
  Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
);

export const OAuthRegistrationPolicy = Schema.Struct({
  lifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 1800000 })),
  maximumVerificationAgeMillis: Schema.Int.check(
    Schema.isBetween({ minimum: 1000, maximum: 1800000 }),
  ),
  retentionMillis: Schema.Int.check(Schema.isBetween({ minimum: 120000, maximum: 2592000000 })),
});

export type OAuthRegistrationPolicy = typeof OAuthRegistrationPolicy.Type;

/** Immutable restricted capability. Application data is first bound by register,
 * never by the OAuth callback; this record contains no plaintext bearer or tokens. */
export const OAuthRegistrationIntent = Schema.Struct({
  namespace: Schema.Literal("effect-auth/oauth-registration-intent/v1"),
  reference: OAuthRegistrationReference,
  context: OAuthSignInTransactionContext,
  claimId: OAuthClaimId,
  claimedAtMillis: OAuthInstant,
  identity: OAuthExternalIdentity,
  /** Original authenticated provider snapshot, available only to server-side
   * provisioning authority. It is not caller-supplied registration data. */
  profile: Schema.optionalKey(OAuthDisplayProfile),
  verifiedAtMillis: OAuthInstant,
  credentialDigest: OAuthRegistrationBearerDigest,
  issuedAtMillis: OAuthInstant,
  expiresAtMillis: OAuthInstant,
  retentionUntilMillis: OAuthInstant,
});

export type OAuthRegistrationIntent = typeof OAuthRegistrationIntent.Type;

export const OAuthRegistrationRequired = Schema.TaggedStruct("RegistrationRequired", {
  reference: OAuthRegistrationReference,
  expiresAtMillis: OAuthInstant,
  returnTarget: OAuthSignInTransactionContext.fields.returnTarget,
});

export const OAuthRegistrationAccess = Schema.Struct({
  moduleId: OAuthModuleId,
  reference: OAuthRegistrationReference,
  flowId: RequestBindingFlowId,
  requestBindingVerifier: OAuthSignInTransactionContext.fields.requestBindingVerifier,
  requestBindingExpiresAtMillis: OAuthInstant,
  credentialDigest: OAuthRegistrationBearerDigest,
  nowMillis: OAuthInstant,
});

export type OAuthRegistrationAccess = typeof OAuthRegistrationAccess.Type;

export const OAuthRegistrationPrivateInput = Schema.Struct({
  reference: OAuthRegistrationReference,
  flowId: RequestBindingFlowId,
  requestBinding: RequestBindingCredential,
  credential: OAuthRegistrationCredential,
  commandId: OAuthCommandId,
});

const applicationBinding = { commandId: OAuthCommandId, fingerprint: OAuthRegistrationFingerprint };
const recovery = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));

/** A first accepted command atomically reaches one bound outcome. There is no
 * resettable intermediate state that permits a second provisioning attempt. */
export const OAuthRegistrationApplication = Schema.Union([
  Schema.TaggedStruct("Unbound", {}),
  Schema.TaggedStruct("Registered", applicationBinding),
  Schema.TaggedStruct("ProvisioningPending", { ...applicationBinding, reference: recovery }),
  Schema.TaggedStruct("Rejected", applicationBinding),
]);

export const OAuthRegistrationInspection = Schema.Struct({
  intent: OAuthRegistrationIntent,
  application: OAuthRegistrationApplication,
});

export type OAuthRegistrationInspection = typeof OAuthRegistrationInspection.Type;

export const OAuthRegistrationDecision = Schema.Union([
  Schema.TaggedStruct("Registered", { replayed: Schema.Boolean }),
  Schema.TaggedStruct("ProvisioningPending", { reference: recovery, replayed: Schema.Boolean }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
]);

export type OAuthRegistrationDecision = typeof OAuthRegistrationDecision.Type;

export const OAuthRegistrationResult = Schema.Union([
  Schema.TaggedStruct("RegistrationAccepted", {}),
  Schema.TaggedStruct("ProvisioningPending", { reference: recovery }),
]);
