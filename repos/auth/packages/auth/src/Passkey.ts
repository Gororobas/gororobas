export {
  PasskeyAccess,
  PasskeyActionAuthorization,
  PasskeyActionChallenge,
  PasskeyAssertion,
  PasskeyAssertionVerified,
  PasskeyAttestation,
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationStarted,
  PasskeyBegin,
  PasskeyCeremony,
  PasskeyChallenge,
  PasskeyClaim,
  PasskeyClaimDecision,
  PasskeyCleanupResult,
  PasskeyCommandId,
  PasskeyComplete,
  PasskeyContext,
  PasskeyCounter,
  PasskeyCredential,
  PasskeyCredentialId,
  PasskeyCredentialSummary,
  PasskeyDescriptor,
  PasskeyEnrolled,
  PasskeyEnrollmentSnapshot,
  PasskeyEvidence,
  PasskeyGeneration,
  PasskeyInstant,
  PasskeyIssueDecision,
  PasskeyLabel,
  PasskeyModuleId,
  PasskeyProfile,
  PasskeyProfileId,
  PasskeyProtocolCredentialId,
  PasskeyPublicKey,
  PasskeyPurpose,
  PasskeyRegistrationComplete,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResult,
  PasskeyRegistrationStarted,
  PasskeyRegistrationVerified,
  PasskeyRemoved,
  PasskeyRequirement,
  PasskeyRevision,
  PasskeyRpId,
  PasskeySettlement,
  PasskeyTarget,
  PasskeyUserHandle,
} from "./passkey/models";

export { PasskeyActionEvidence } from "./passkey/PasskeyActionEvidence";

export {
  PasskeyActionRequired,
  PasskeyConfigurationError,
  PasskeyFailure,
  PasskeyMethodUnsupported,
  PasskeyProtocolRejected,
  PasskeyRejected,
  PasskeyUnavailable,
} from "./passkey/errors";

export { PasskeyCredentials } from "./passkey/PasskeyCredentials";
export { PasskeyEnrollmentContext } from "./passkey/PasskeyEnrollmentContext";
export { PasskeyManagementPersistence } from "./passkey/PasskeyManagementPersistence";
export { PasskeyManagementPolicy, PasskeyMethodPolicy } from "./passkey/policy";
export { PasskeyPersistence, type PreparePasskeyCommit } from "./passkey/PasskeyPersistence";
export { PasskeyProtocol } from "./passkey/PasskeyProtocol";

export {
  type PasskeyOptions,
  type PasskeyRegistrationConfiguration,
  type PasskeyManagementOptions,
  make,
  makeRegistration,
  makeManagement,
  makePending,
  makeStepUp,
} from "./passkey/definition";

export { makePasskeyMethod as makeModule } from "./passkey/module";

export { PasskeyConfig } from "./passkey/PasskeyConfig";

export { validatePasskeyPolicy } from "./passkey/policy";

export { snapshotPasskey, snapshotPasskeySync, samePasskey } from "./passkey/snapshot";
