export {
  AssuranceAlternative,
  AuthenticationEvidence,
  AuthenticationFlowId,
  AuthenticationProof,
  AuthenticationRequirement,
  AuthenticationCapture,
  AuthenticationRevision,
  CredentialRevision,
  PendingConsumption,
  PendingAuthenticationKind,
  SecurityRevision,
  SessionAuthenticationProvenance,
  SessionCapabilities,
  SessionCredentialVersion,
  SessionId,
  type SessionInspection,
  SessionGuard,
  type SessionSource,
  SessionMetadata,
  SessionReadOptions,
  SessionSignOut,
} from "./sessions/models";

export { AuthenticationAuthority } from "./sessions/AuthenticationAuthority";

export {
  type PendingAuthentication,
  PendingAuthenticationContext,
  type PendingAuthenticationRecord,
  type PendingAuthenticationSnapshot,
  type PendingAuthenticationState,
  pendingAuthenticationContext,
  snapshotPendingAuthenticationContext,
} from "./sessions/PendingAuthentication";

export {
  PendingAuthenticationInvalid,
  SessionCapabilityUnsupported,
  SessionConfigurationError,
  SessionConflict,
  SessionError,
  SessionInvalid,
  SessionRenewalTooEarly,
  SessionSignOutUnavailable,
  SessionStepUpInvalid,
  SessionUnavailable,
  StaleAuthentication,
} from "./sessions/errors";

export { type PrepareSessionCommit } from "./sessions/commit";

export {
  SessionInvalidationTrigger,
  SessionInvalidationWindow,
  sessionInvalidationWindow,
} from "./sessions/invalidation";

export {
  SessionPolicy,
  stateAssistedCapabilities,
  statefulCapabilities,
  statelessCapabilities,
  validateSessionPolicy,
  validateSessionTimeline,
} from "./sessions/policy";

export {
  type SessionRepository,
  type SessionCleanup,
  type SignedSessionValidity,
  type StatefulSessionPersistence,
  type StatefulSessionRecord,
} from "./sessions/persistence";

export {
  type SessionSigningKeyring,
  SessionSigningKeys,
  makeSessionSecrets,
  makeSessionSigningCodec,
} from "./sessions/crypto";

export {
  type SessionStepUpCompletionPlan,
  SessionStepUpIntent,
  type SessionStepUpPersistence,
  SessionStepUpProfile,
  SessionStepUpProfileId,
  type SessionStepUpReplacement,
  SessionStepUpRequirement,
  SessionStepUpSnapshot,
  StepUpPending,
} from "./sessions/SessionStepUpPersistence";

export {
  assessAuthentication,
  combineAuthenticationEvidence,
  snapshotAuthenticationEvidence,
  snapshotSessionAuthenticationProvenance,
} from "./sessions/assurance";

export { make } from "./sessions/definition";

export {
  stateful,
  stateless,
  stateAssisted,
  type SessionOptions,
  type SessionConfiguration,
  type StatefulConfiguration,
  type StatelessConfiguration,
  type StateAssistedConfiguration,
} from "./sessions/configuration";
