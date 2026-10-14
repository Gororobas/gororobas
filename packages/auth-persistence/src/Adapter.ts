/** Adapter integration has two levels: typed table mappings, or NativeSqlTables
 * with the shared strategy factories. Drivers supply physical codecs, SQL
 * expressions and transaction/batch capabilities to one commit owner. */
export {
  type EmailSubjectReadTable,
  type EmailSubjectTable,
  type EmailIdentifierReadTable,
  type EmailIdentifierTable,
  type EmailCredentialReadTable,
  type EmailCredentialTable,
  type EmailAuthorityCredentialTable,
  type RequiredEmailSignInConstraints,
  requiredEmailSignInConstraints,
  type EmailSignInMapping,
  type RequiredEmailAddressConstraints,
  requiredEmailAddressConstraints,
  type EmailAddressMapping,
  type EmailRegistrationIntent,
  type EmailRegistrationProvisioning,
  type EmailRegistrationIdentifierTable,
  type EmailRegistrationCredentialTable,
  type EmailRegistrationAuthorityCredentialTable,
  type RequiredEmailRegistrationConstraints,
  requiredEmailRegistrationConstraints,
  type EmailRegistrationMapping,
  type AnyEmailSignInMapping,
  type AnyEmailAddressMapping,
  type AnyEmailRegistrationMapping,
} from "./internal/models/email-model";

export {
  type PasskeyColumn,
  type PasskeyMappingSource,
  type PasskeyCredentialServices,
  type PasskeyPersistenceServices,
  passkeyCredentialsLayer,
  passkeyPersistenceLayer,
  type PasskeySubjectIdCodec,
  type PasskeyClock,
  type PasskeySubjectReadTable,
  type PasskeyFactorReadTable,
  type PasskeyCredentialReadTable,
  requiredPasskeyCredentialConstraints,
  type PasskeyCredentialMapping,
  type PasskeyFlowInsert,
  type PasskeyFlowTable,
  requiredPasskeyPersistenceConstraints,
  type PasskeyCeremonyMapping,
  type PasskeyPersistenceMapping,
  type D1PasskeyMapping,
} from "./internal/models/passkey-model";

export {
  type PasskeyRegistrationCeremonyCapabilities,
  type PasskeyRegistrationCeremonyServices,
  type PasskeyRegistrationCeremonyMapping,
} from "./internal/models/passkey-registration-ceremony-model";

export {
  type PasskeyCredentialInsert,
  type PasskeyWriteTables,
  type PasskeyInvalidationInput,
  type PasskeyInvalidationMutation,
  passkeyInvalidationMutation,
  type PasskeyManagementMapping,
  type PasskeyManagementServices,
  type PasskeyRegistrationWriter,
  type PasskeyRegistrationServices,
  type PasskeyRegistrationMapping,
} from "./internal/models/passkey-write-model";

export {
  type PasswordSubjectTable,
  type PasswordIdentifierTable,
  type PasswordAuthorityCredentialTable,
  type PasswordCredentialTable,
  type RequiredPasswordConstraints,
  requiredPasswordConstraints,
  type PasswordPersistenceMapping,
  type PasswordRegistrationIntent,
  type PasswordRegistrationProvisioning,
  type RequiredPasswordRegistrationConstraints,
  requiredPasswordRegistrationConstraints,
  type PasswordRegistrationConstraintClassifier,
  type PasswordRegistrationMapping,
  type AnyPasswordPersistenceMapping,
  type AnyPasswordRegistrationMapping,
} from "./internal/models/password-model";

export {
  type ProofTable,
  type ProofClock,
  type RequiredProofConstraints,
  requiredProofConstraints,
  type ProofPersistenceMapping,
  type AnyProofPersistenceMapping,
} from "./internal/models/proof-model";

export {
  type SessionIdCodec,
  type SessionExecution,
  type SessionPendingTables,
  type SessionPendingInsert,
  type SessionCleanupMapping,
  type SessionSubjectTables,
  type SessionAuthorityTables,
  type StatefulSessionTables,
  type PendingAuthenticationTables,
  type SignedSessionValidityTables,
  type RequiredSessionConstraints,
  type RequiredPendingAuthenticationConstraints,
  type RequiredStatefulPendingConstraints,
  type RequiredSignedValidityConstraints,
  requiredSessionConstraints,
  requiredPendingAuthenticationConstraints,
  requiredStatefulPendingConstraints,
  requiredSignedValidityConstraints,
  type AuthenticationAuthorityMapping,
  type StatefulSessionMapping,
  type PendingAuthenticationMapping,
  type SignedSessionValidityMapping,
} from "./internal/models/session-model";

export {
  type RequiredSessionStepUpConstraints,
  requiredSessionStepUpConstraints,
  type SessionStepUpSourceTables,
  type SessionStepUpMapping,
} from "./internal/models/step-up-model";

export { requireStandalone } from "./internal/standalone";

export { makeOAuthProxyPersistence, type OAuthProxySqlTable } from "./internal/oauth-proxy";

export { PersistenceMappingError, isMappedConstraintConflict } from "./internal/mapping-error";
export type { TableModel, SqlExpression } from "./internal/table-model";

export { PersistenceConfigurationError } from "./internal/configuration";
export { createPersistence } from "./internal/persistence";
export { makeMappings as makeStorageMappings } from "./internal/storage-mapping";
export { storageTables, type StorageRole, type StorageTable } from "./internal/storage-tables";
export type { SubjectIdCodec } from "./internal/models/common";
export type { PasswordRegistrationAuthority } from "./internal/registration-contract";

export type {
  BoundPersistence,
  ClaimsCodec,
  Definition,
  PersistenceApi,
} from "./internal/configuration";

export {
  validateStorage,
  validateStorageBatch,
  withStorageValidation,
  type PhysicalStorageTable,
  type StorageValidation,
} from "./internal/storage-validation";

export type { MappingInput } from "./internal/configuration";

export type { Backend } from "./internal/persistence";

export {
  makeNativeSqlTables,
  nativeSqlAlias,
  type NativeSqlTables,
  type SqlTable,
} from "./internal/native-sql-table";

export {
  makeNativePasskeyServices,
  makeBatchPasskeyServices,
  makeNativePasskeyCredentialServices,
} from "./internal/passkey-native";

export {
  makeNativePasskeyCeremonyServices,
  type NativePasskeyCeremonyMapping,
} from "./internal/passkey-native-ceremony";

export {
  makePasskeyNativeManagement,
  type NativePasskeyManagementMapping,
} from "./internal/passkey-native-write";

export {
  makePasskeyNativeRegistration,
  type NativePasskeyRegistrationMapping,
} from "./internal/passkey-native-registration";

export { type PasskeyNativeRead, type PasskeyNativeMapping } from "./internal/passkey-native-state";

export {
  makeSqlCommitExecutor,
  SqlBatchCommit,
  SqlNativeCommit,
  captureSqlBatchStatements,
} from "./internal/sql-commit";

export { storageKeyPlans } from "./internal/storage-plans";

export {
  type OAuthAction,
  type OAuthClock,
  type OAuthSubjectReadTable,
  type OAuthSubjectTable,
  type OAuthOwnershipReadTable,
  type OAuthOwnershipTable,
  type OAuthCredentialReadTable,
  type OAuthCredentialTable,
  type OAuthAuthorityReadTable,
  type OAuthAuthorityTable,
  type OAuthFlowTable,
  type OAuthEligibilityFact,
  type OAuthEligibilityTable,
  type OAuthCleanupTable,
  type OAuthRegistrationGuardTable,
  type OAuthRegistrationGuardDescriptor,
  oauthRegistrationGuardTable,
  type OAuthEligibilityDescriptor,
  oauthEligibilityTable,
  type OAuthCleanupDescriptor,
  oauthCleanupTable,
  type OAuthRegistrationIntentTable,
  type OAuthD1Mapping,
  requiredOAuthSignInConstraints,
  requiredOAuthRegistrationConstraints,
  type OAuthSignInMapping,
  type OAuthRegistrationIntentMapping,
  type OAuthRegistrationMapping,
  type OAuthAccountsMapping,
  type OAuthRegistrationAuthority,
} from "./internal/models/oauth-model";

export {
  type OAuthConnectedAction,
  type OAuthConnectedGrantTable,
  type OAuthConnectedRevocationJobTable,
  type OAuthConnectedPolicyInput,
  type OAuthConnectedSqlPolicy,
  requiredOAuthConnectedConstraints,
  requiredOAuthConnectedRevocationConstraints,
  type OAuthConnectedMapping,
  type OAuthConnectedRevocationMapping,
} from "./internal/models/oauth-connected-model";

export { makeNativeOAuthSignInServices } from "./internal/oauth/native-sign-in";
export type { OAuthNativeReadMapping } from "./internal/oauth/native-state";

export {
  makeNativeOAuthAccountsServices,
  type OAuthNativeAccountsMapping,
} from "./internal/oauth/native-accounts";

export {
  makeNativeOAuthRegistrationIntentServices,
  makeNativeOAuthRegistrationServices,
  type OAuthNativeRegistrationIntentMapping,
  type OAuthNativeRegistrationMapping,
} from "./internal/oauth/native-registration";

export { makeNativeOAuthConnectedServices } from "./internal/oauth/native-connected";
export type { OAuthNativeConnectedMapping } from "./internal/oauth/native-connected-state";

export {
  makeNativeOAuthRevocationServices,
  type OAuthNativeRevocationMapping,
} from "./internal/oauth/native-revocations";

export { captureOAuthMapping } from "./internal/oauth/state";

export {
  oauthAccountsPersistenceLayer,
  oauthSignInPersistenceLayer,
  oauthRegistrationIntentsLayer,
  oauthConnectedPersistenceLayer,
  oauthConnectedRevocationsLayer,
  oauthRegistrationAuthorityLayer,
} from "./internal/oauth/native-layers";

export { makeNativeProofServices } from "./internal/proof-native";

export { makeNativePasswordServices } from "./internal/password-native";

export { makeNativePasswordRegistrationServices } from "./internal/password-registration-native";

export {
  type PhoneMapping,
  type AnyPhoneMapping,
  requiredPhoneConstraints,
} from "./internal/models/phone-model";

export { makeNativePhoneServices } from "./internal/phone-native";

export {
  makeNativeEmailSignInServices,
  makeNativeEmailAddressServices,
} from "./internal/email-native";

export {
  makeNativeEmailRegistrationServices,
  type EmailRegistrationAuthority,
} from "./internal/email-registration-native";

export {
  makeNativeAuthenticationAuthorityServices,
  type NativeAuthenticationAuthorityMapping,
} from "./internal/session-native-authority";

export {
  makeNativePendingAuthenticationServices,
  type NativePendingAuthenticationMapping,
} from "./internal/session-native-login";

export {
  makeNativeStatefulSessionServices,
  type NativeStatefulSessionMapping,
} from "./internal/session-native-stateful";

export {
  makeNativeSignedSessionValidityServices,
  type NativeSignedSessionValidityMapping,
} from "./internal/session-native-validity";

export {
  makeNativeSessionStepUpServices,
  type NativeSessionStepUpMapping,
} from "./internal/session-native-step-up";

export { makeNativeSessionCleanupServices } from "./internal/session-native-cleanup";

export {
  type TotpMapping,
  type TotpMappingSource,
  requiredTotpConstraints,
} from "./internal/models/totp-model";

export { makeNativeTotpServices, type NativeTotpMapping } from "./internal/totp-native";
