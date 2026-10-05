import { Schema } from "effect";

import { RequestBindingFlowId, RequestBindingCredential } from "../operations/requestBinding";
import { SecurityRevision } from "../sessions/models";
import {
  OAuthAccountRevision,
  OAuthActionAuthorization,
  OAuthActionDigest,
} from "./accountsModels";
import {
  OAuthGrantId,
  OAuthPermissionProfileKey,
  OAuthConnectedScopes,
  OAuthConnectedResources,
  OAuthConnectedProfile,
} from "./permissionProfile";
import { OAuthProviderKey } from "./schema";
import {
  OAuthCallbackId,
  OAuthClaimId,
  OAuthCommandId,
  OAuthDisplayProfile,
  OAuthExternalIdentity,
  OAuthGeneration,
  OAuthInstant,
  OAuthModuleId,
  OAuthProtocolConfiguration,
  OAuthSealedTransaction,
  OAuthSignInComplete,
  OAuthSignInPolicy,
  OAuthSignInTransactionContext,
  OAuthTransactionSecrets,
  OAuthAuthorizationUrl,
} from "./signInModels";

const revision = SecurityRevision.check(Schema.isMaxLength(256));

export { OAuthGrantId } from "./permissionProfile";

export {
  OAuthPermissionProfileKey,
  OAuthConnectedScopes,
  OAuthConnectedResources,
  OAuthConnectedProfile,
} from "./permissionProfile";

/** Durable authority-issued total order, comparable with cohort cutoffs. Never caller time. */
export const OAuthConnectedOrder = Schema.String.check(Schema.isPattern(/^[0-9]{1,128}$/));

export const OAuthConnectedPolicy = Schema.Struct({
  ...OAuthSignInPolicy.fields,
  maximumEvidenceAgeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300000 })),
  refreshClaimLifetimeMillis: OAuthSignInPolicy.fields.claimLifetimeMillis,
  useAdmissionLifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30000 })),
  profiles: Schema.NonEmptyArray(OAuthConnectedProfile).check(Schema.isMaxLength(64)),
});

export type OAuthConnectedPolicy = typeof OAuthConnectedPolicy.Type;

export class OAuthConnectedBusy extends Schema.TaggedError<OAuthConnectedBusy>()(
  "OAuthConnectedBusy",
  {},
) {}

export class OAuthConnectedReauthorizationRequired extends Schema.TaggedError<OAuthConnectedReauthorizationRequired>()(
  "OAuthConnectedReauthorizationRequired",
  {},
) {}

export class OAuthConnectedActionRequired extends Schema.TaggedError<OAuthConnectedActionRequired>()(
  "OAuthConnectedActionRequired",
  {},
) {}

export const OAuthConnectedConfiguration = Schema.Struct({
  ...OAuthProtocolConfiguration.fields,
  profile: OAuthConnectedProfile,
});

export type OAuthConnectedConfiguration = typeof OAuthConnectedConfiguration.Type;

export const OAuthConnectedIntent = Schema.Union([
  Schema.TaggedStruct("Connect", {
    provider: OAuthProviderKey,
    profileKey: OAuthPermissionProfileKey,
  }),
  Schema.TaggedStruct("Reconnect", {
    grantId: OAuthGrantId,
    profileKey: OAuthPermissionProfileKey,
  }),
]);

export const OAuthConnectedPrepareBegin = Schema.Struct({
  flowId: RequestBindingFlowId,
  commandId: OAuthCommandId,
  callbackId: OAuthCallbackId,
  intent: OAuthConnectedIntent,
  returnTarget: Schema.String.check(Schema.isMaxLength(2048)),
});

export const OAuthConnectedBegin = Schema.Struct({
  ...OAuthConnectedPrepareBegin.fields,
  preparationCredential: RequestBindingCredential,
  actionProof: Schema.optionalKey(
    Schema.RedactedFromValue(Schema.NonEmptyString.check(Schema.isMaxLength(16384))),
  ),
});

export const OAuthConnectedComplete = Schema.Struct({
  ...OAuthSignInComplete.fields,
  actionProof: OAuthConnectedBegin.fields.actionProof,
});

export const OAuthConnectedDisconnect = Schema.Struct({
  commandId: OAuthCommandId,
  grantId: OAuthGrantId,
  actionProof: OAuthConnectedBegin.fields.actionProof,
});

export const OAuthConnectedList = Schema.Struct({
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  cursor: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(1024))),
});

export const OAuthConnectedUse = Schema.Struct({
  grantId: OAuthGrantId,
  profileKey: OAuthPermissionProfileKey,
});

export const OAuthConnectedTarget = Schema.Struct({
  grantId: OAuthGrantId,
  grantVersion: revision,
  tokenVersion: revision,
  cohortGeneration: revision,
  identity: OAuthExternalIdentity,
  configuration: OAuthConnectedConfiguration,
});

export type OAuthConnectedTarget = typeof OAuthConnectedTarget.Type;

export const OAuthConnectedTransactionContext = Schema.Struct({
  ...OAuthSignInTransactionContext.fields,
  namespace: Schema.Literal("effect-auth/oauth-connected-context/v1"),
  revision: OAuthAccountRevision,
  profile: OAuthConnectedProfile,
  grantId: OAuthGrantId,
  reconnect: Schema.optionalKey(OAuthConnectedTarget),
  maximumEvidenceAgeMillis: OAuthConnectedPolicy.fields.maximumEvidenceAgeMillis,
});

export type OAuthConnectedTransactionContext = typeof OAuthConnectedTransactionContext.Type;

/** The authorization URL contains state and remains encrypted during preparation. */
export const OAuthConnectedTransactionSecrets = Schema.Struct({
  ...OAuthTransactionSecrets.fields,
  authorizationUrl: OAuthAuthorizationUrl,
});

export type OAuthConnectedTransactionSecrets = typeof OAuthConnectedTransactionSecrets.Type;

/** 100 KiB plaintext covers the URL's worst-case JSON escaping plus transaction
 * secrets. Include the 16-byte authentication tag in the base64url bound. */
export const OAuthConnectedSealedTransaction = Schema.Struct({
  ...OAuthSealedTransaction.fields,
  ciphertext: Schema.RedactedFromValue(
    Schema.String.check(
      Schema.isMinLength(22),
      Schema.isMaxLength(Math.ceil(((100 * 1024 + 16) * 4) / 3)),
      Schema.isPattern(/^[A-Za-z0-9_-]+$/),
    ),
  ),
});

export type OAuthConnectedSealedTransaction = typeof OAuthConnectedSealedTransaction.Type;

export const OAuthConnectedPendingFlow = Schema.Struct({
  context: OAuthConnectedTransactionContext,
  sealed: OAuthConnectedSealedTransaction,
  retentionUntilMillis: OAuthInstant,
});

export type OAuthConnectedPendingFlow = typeof OAuthConnectedPendingFlow.Type;

export const OAuthConnectedClaim = Schema.Struct({
  flow: OAuthConnectedPendingFlow,
  claimId: OAuthClaimId,
  claimedAtMillis: OAuthInstant,
  claimExpiresAtMillis: OAuthInstant,
  order: OAuthConnectedOrder,
});

export type OAuthConnectedClaim = typeof OAuthConnectedClaim.Type;

export const OAuthConnectedActionChallenge = Schema.Struct({
  moduleId: OAuthModuleId,
  action: Schema.Literals(["connected-begin", "connected-complete", "connected-disconnect"]),
  flowId: RequestBindingFlowId,
  commandId: OAuthCommandId,
  revision: OAuthAccountRevision,
  intentDigest: OAuthActionDigest,
  bindingDigest: OAuthActionDigest,
});

export type OAuthConnectedActionChallenge = typeof OAuthConnectedActionChallenge.Type;

export const OAuthConnectedActionAuthorization = Schema.Struct({
  ...OAuthActionAuthorization.fields,
  challenge: OAuthConnectedActionChallenge,
});

export type OAuthConnectedActionAuthorization = typeof OAuthConnectedActionAuthorization.Type;

export const OAuthConnectedUseAuthorization = Schema.Struct({
  moduleId: OAuthModuleId,
  revision: OAuthAccountRevision,
  policyRevision: revision,
  expiresAtMillis: OAuthInstant,
  purpose: Schema.Literals(["metadata", "use"]),
  grantId: Schema.optionalKey(OAuthGrantId),
  profileKey: Schema.optionalKey(OAuthPermissionProfileKey),
});

export type OAuthConnectedUseAuthorization = typeof OAuthConnectedUseAuthorization.Type;

const token = Schema.RedactedFromValue(Schema.NonEmptyString.check(Schema.isMaxLength(16384)));
const numericDate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 8640000000000 }));

export const OAuthConnectedContinuation = Schema.Union([
  Schema.TaggedStruct("Oidc", {
    clientId: Schema.NonEmptyString.check(Schema.isMaxLength(1024)),
    nonce: OAuthTransactionSecrets.fields.oidcNonce,
    authTime: Schema.optionalKey(numericDate),
  }),
  Schema.TaggedStruct("OAuth", {}),
]);

export const OAuthConnectedTokenMaterial = Schema.Struct({
  namespace: Schema.Literal("effect-auth/oauth-connected-token-material/v1"),
  accessToken: token,
  refreshToken: Schema.optionalKey(token),
  continuation: OAuthConnectedContinuation,
});

export type OAuthConnectedTokenMaterial = typeof OAuthConnectedTokenMaterial.Type;

export const OAuthConnectedGrantResponse = Schema.Struct({
  identity: OAuthExternalIdentity,
  profile: Schema.optionalKey(OAuthDisplayProfile),
  scopes: OAuthConnectedScopes,
  resources: OAuthConnectedResources,
  accessExpiresAtMillis: Schema.optionalKey(OAuthInstant),
  refreshExpiresAtMillis: Schema.optionalKey(OAuthInstant),
  material: OAuthConnectedTokenMaterial,
});

export type OAuthConnectedGrantResponse = typeof OAuthConnectedGrantResponse.Type;

export const OAuthConnectedTokenMetadata = Schema.Struct({
  scopes: OAuthConnectedScopes,
  resources: OAuthConnectedResources,
  accessExpiresAtMillis: Schema.optionalKey(OAuthInstant),
  refreshExpiresAtMillis: Schema.optionalKey(OAuthInstant),
  useUntilMillis: OAuthInstant,
  refreshUseUntilMillis: Schema.optionalKey(OAuthInstant),
  obtainedAtMillis: OAuthInstant,
  profile: Schema.optionalKey(OAuthDisplayProfile),
});

export const OAuthConnectedTokenContext = Schema.Struct({
  namespace: Schema.Literal("effect-auth/oauth-connected-token-context/v1"),
  /** Order reserved before this token exchange, including refresh. */
  exchangeOrder: OAuthConnectedOrder,
  moduleId: OAuthModuleId,
  subjectId: OAuthAccountRevision.fields.subjectId,
  identity: OAuthExternalIdentity,
  configuration: OAuthConnectedConfiguration,
  grantId: OAuthGrantId,
  grantVersion: revision,
  tokenVersion: revision,
  cohortGeneration: revision,
  metadata: OAuthConnectedTokenMetadata,
});

export type OAuthConnectedTokenContext = typeof OAuthConnectedTokenContext.Type;

export const OAuthConnectedRevocationContext = Schema.Struct({
  namespace: Schema.Literal("effect-auth/oauth-connected-revocation-context/v1"),
  jobId: OAuthClaimId,
  token: OAuthConnectedTokenContext,
});

export type OAuthConnectedRevocationContext = typeof OAuthConnectedRevocationContext.Type;

export const OAuthConnectedProtectionContext = Schema.Union([
  OAuthConnectedTokenContext,
  OAuthConnectedRevocationContext,
]);

export type OAuthConnectedProtectionContext = typeof OAuthConnectedProtectionContext.Type;

export const OAuthConnectedSealedTokens = Schema.Struct({
  format: Schema.Literal("oauth-connected-xchacha20poly1305-v1"),
  keyId: OAuthSealedTransaction.fields.keyId,
  nonce: OAuthSealedTransaction.fields.nonce,
  ciphertext: Schema.RedactedFromValue(
    Schema.String.check(
      Schema.isMinLength(22),
      Schema.isMaxLength(131094),
      Schema.isPattern(/^[A-Za-z0-9_-]+$/),
    ),
  ),
});

export type OAuthConnectedSealedTokens = typeof OAuthConnectedSealedTokens.Type;

export const OAuthConnectedStoredGrant = Schema.Struct({
  context: OAuthConnectedTokenContext,
  sealed: OAuthConnectedSealedTokens,
});

export type OAuthConnectedStoredGrant = typeof OAuthConnectedStoredGrant.Type;

export const OAuthConnectedDisconnectGrant = Schema.Struct({
  context: OAuthConnectedTokenContext,
  sealed: Schema.optionalKey(OAuthConnectedSealedTokens),
});

export type OAuthConnectedDisconnectGrant = typeof OAuthConnectedDisconnectGrant.Type;

export const OAuthConnectedRevocationJob = Schema.Struct({
  context: OAuthConnectedRevocationContext,
  sealed: OAuthConnectedSealedTokens,
});

export type OAuthConnectedRevocationJob = typeof OAuthConnectedRevocationJob.Type;

export const OAuthConnectedRefreshClaim = Schema.Struct({
  grant: OAuthConnectedStoredGrant,
  order: OAuthConnectedOrder,
  claimId: OAuthClaimId,
  claimedAtMillis: OAuthInstant,
  claimExpiresAtMillis: OAuthInstant,
  nextTokenVersion: revision,
});

export type OAuthConnectedRefreshClaim = typeof OAuthConnectedRefreshClaim.Type;

export const OAuthConnectedSummary = Schema.Struct({
  grantId: OAuthGrantId,
  provider: OAuthProviderKey,
  issuer: OAuthExternalIdentity.fields.issuer,
  profileKey: OAuthPermissionProfileKey,
  status: Schema.Literals(["Active", "Refreshing", "ReauthorizationRequired", "Disconnected"]),
  scopes: OAuthConnectedScopes,
  accessExpiresAtMillis: Schema.optionalKey(OAuthInstant),
  useUntilMillis: OAuthInstant,
  profile: Schema.optionalKey(OAuthDisplayProfile),
  remoteRevocation: Schema.Literals(["Pending", "Confirmed", "Unsupported", "Unknown"]),
});

export const OAuthConnectedListResult = Schema.Struct({
  items: Schema.Array(OAuthConnectedSummary).check(Schema.isMaxLength(100)),
  cursor: OAuthConnectedList.fields.cursor,
});

export const OAuthConnectedResult = Schema.Union([
  Schema.TaggedStruct("Connected", {
    grantId: OAuthGrantId,
    profileKey: OAuthPermissionProfileKey,
    status: Schema.Literal("Active"),
    returnTarget: OAuthConnectedTransactionContext.fields.returnTarget,
  }),
  Schema.TaggedStruct("Cancelled", {
    returnTarget: OAuthConnectedTransactionContext.fields.returnTarget,
  }),
]);

export const OAuthConnectedDisconnected = Schema.TaggedStruct("Disconnected", {
  grantId: OAuthGrantId,
  remoteRevocation: OAuthConnectedSummary.fields.remoteRevocation,
  affectedGrantCount: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  replayed: Schema.Boolean,
});

export const OAuthConnectedAccess = Schema.Struct({
  moduleId: OAuthModuleId,
  generation: OAuthGeneration,
  subjectId: OAuthAccountRevision.fields.subjectId,
  flowId: RequestBindingFlowId,
  provider: OAuthProviderKey,
  callbackId: OAuthCallbackId,
  stateDigest: OAuthConnectedTransactionContext.fields.stateDigest,
  requestBindingVerifier: OAuthConnectedTransactionContext.fields.requestBindingVerifier,
  requestBindingExpiresAtMillis: OAuthInstant,
  responseIssuer: Schema.optionalKey(OAuthExternalIdentity.fields.issuer),
  nowMillis: OAuthInstant,
});

export type OAuthConnectedAccess = typeof OAuthConnectedAccess.Type;

export const OAuthConnectedPreparedAccess = Schema.Struct({
  moduleId: OAuthModuleId,
  generation: OAuthGeneration,
  subjectId: OAuthAccountRevision.fields.subjectId,
  flowId: RequestBindingFlowId,
  commandId: OAuthCommandId,
  requestBindingVerifier: OAuthConnectedTransactionContext.fields.requestBindingVerifier,
  requestBindingExpiresAtMillis: OAuthInstant,
  nowMillis: OAuthInstant,
});

export type OAuthConnectedPreparedAccess = typeof OAuthConnectedPreparedAccess.Type;

export const OAuthConnectedIssueDecision = Schema.Union([
  Schema.TaggedStruct("Issued", { flow: OAuthConnectedPendingFlow }),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthConnectedClaimDecision = Schema.Union([
  Schema.TaggedStruct("Claimed", { claim: OAuthConnectedClaim }),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthConnectedGrantInspection = Schema.Union([
  Schema.TaggedStruct("Target", { cohortGeneration: revision }),
  Schema.TaggedStruct("Quarantine", { cohortGeneration: revision }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
]);

export const OAuthConnectedOutcome = Schema.Union([
  Schema.TaggedStruct("Verified", {
    grant: OAuthConnectedStoredGrant,
    cleanup: Schema.optionalKey(OAuthConnectedRevocationJob),
  }),
  Schema.TaggedStruct("Quarantined", {
    grant: OAuthConnectedStoredGrant,
    cleanup: Schema.optionalKey(OAuthConnectedRevocationJob),
  }),
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Unissued", {}),
  Schema.TaggedStruct("Conflict", {}),
  Schema.TaggedStruct("Ambiguous", {}),
]);

export type OAuthConnectedOutcome = typeof OAuthConnectedOutcome.Type;

export const OAuthConnectedSettlementDecision = Schema.Union([
  Schema.TaggedStruct("Connected", { grant: OAuthConnectedStoredGrant }),
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
  Schema.TaggedStruct("Busy", {}),
  Schema.TaggedStruct("Ambiguous", {}),
]);

export const OAuthConnectedDisconnectInspection = Schema.Union([
  Schema.TaggedStruct("Target", {
    grant: OAuthConnectedDisconnectGrant,
    revision: OAuthAccountRevision,
  }),
  Schema.TaggedStruct("Replay", { result: OAuthConnectedDisconnected }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
]);

export const OAuthConnectedDisconnectDecision = Schema.Union([
  OAuthConnectedDisconnected,
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Conflict", {}),
]);

export const OAuthConnectedAccessInspection = Schema.Union([
  Schema.TaggedStruct("Target", { grant: OAuthConnectedStoredGrant }),
  Schema.TaggedStruct("Busy", {}),
  Schema.TaggedStruct("ReauthorizationRequired", {}),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthConnectedRefreshDecision = Schema.Union([
  Schema.TaggedStruct("Claimed", { claim: OAuthConnectedRefreshClaim }),
  Schema.TaggedStruct("Busy", {}),
  Schema.TaggedStruct("ReauthorizationRequired", {}),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthConnectedRefreshOutcome = Schema.Union([
  Schema.TaggedStruct("Refreshed", {
    grant: OAuthConnectedStoredGrant,
    cleanup: Schema.optionalKey(OAuthConnectedRevocationJob),
  }),
  Schema.TaggedStruct("ReauthorizationRequired", {}),
]);

export type OAuthConnectedRefreshOutcome = typeof OAuthConnectedRefreshOutcome.Type;

export const OAuthConnectedRefreshSettlement = Schema.Union([
  Schema.TaggedStruct("Refreshed", { grant: OAuthConnectedStoredGrant }),
  Schema.TaggedStruct("ReauthorizationRequired", {}),
  Schema.TaggedStruct("Rejected", {}),
]);

export const OAuthConnectedUseAdmission = Schema.Union([
  Schema.TaggedStruct("Admitted", {
    admissionId: OAuthClaimId,
    grantId: OAuthGrantId,
    tokenVersion: revision,
    admittedAtMillis: OAuthInstant,
    expiresAtMillis: OAuthInstant,
  }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Busy", {}),
  Schema.TaggedStruct("ReauthorizationRequired", {}),
]);

export const OAuthConnectedCleanupResult = Schema.Struct({
  terminalized: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  removed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  hasMore: Schema.Boolean,
});
