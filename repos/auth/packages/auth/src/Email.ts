export {
  EmailRejected,
  EmailUnavailable,
  EmailActionRequired,
  EmailMethodUnsupported,
  EmailConfigurationError,
} from "./email/errors";

export {
  EmailCommandId,
  SafeReturnTarget,
  EmailCredentialSnapshot,
  EmailAction,
  EmailActionChallenge,
  type EmailAddressDecision,
  type EmailRegistrationDecision,
} from "./email/models";

export { EmailSignInTargets } from "./email/EmailSignInTargets";

export {
  EmailAddressPersistence,
  type PrepareEmailCommit,
  type EmailAddressTarget,
  type EmailAddressMutation,
} from "./email/EmailAddressPersistence";

export { EmailActionEvidence, type EmailActionAuthorization } from "./email/EmailActionEvidence";
export { EmailReturnTargets } from "./email/EmailReturnTargets";

export {
  EmailIdentifierNotifier,
  emailIdentifierNotifications,
} from "./email/EmailIdentifierNotifier";

export { makeEmailMethod as makeModule } from "./email/module";

export {
  type EmailCodeOptions,
  type EmailLinkOptions,
  type EmailRegistrationOptions,
  type EmailAddressOptions,
  makeCode,
  makeLink,
  makeRegistration,
  makeAddresses,
} from "./email/definition";

export type { EmailAddressPolicy } from "./email/addresses";

export {
  snapshotEmailCredential,
  snapshotEmailRequirement,
  snapshotEmailRevision,
} from "./email/snapshot";
