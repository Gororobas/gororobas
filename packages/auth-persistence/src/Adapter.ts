/** Shared storage contracts and kernels for persistence adapter authors.
 * Supply the captured root through NativeDatabase for catalog validation and
 * standalone execution, alongside each constructor's matching Current*Sql service.
 * Provide a coordinator's exact transaction through Current*Sql when constructing
 * bound services; do not provide the root around their later operations, where
 * Current*Sql identifies an active transaction. */
export {
  type EmailSubjectReadTable,
  type EmailSubjectTable,
  type EmailIdentifierReadTable,
  type EmailIdentifierTable,
  type EmailCredentialReadTable,
  type EmailCredentialTable,
  type EmailAuthorityCredentialTable,
  type EmailCommandTable,
  type RequiredEmailSignInConstraints,
  requiredEmailSignInConstraints,
  type EmailSignInMapping,
  type RequiredEmailAddressConstraints,
  requiredEmailAddressConstraints,
  type EmailD1Clock,
  type EmailAddressMapping,
  type D1EmailAddressMapping,
  type EmailRegistrationState,
  type EmailRegistrationIntent,
  type EmailRegistrationTable,
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
  type D1EmailRegistrationMapping,
} from "./internal/models/email-model";

export {
  type PasskeyColumn,
  type PasskeyMappingSource,
  type PasskeyCredentialServices,
  type PasskeyPersistenceServices,
  type PasskeyEnrollmentContextServices,
  passkeyCredentialsLayer,
  passkeyPersistenceLayer,
  passkeyEnrollmentContextLayer,
  type PasskeySubjectIdCodec,
  type PasskeyClock,
  type PasskeySubjectReadTable,
  type PasskeyFactorReadTable,
  type PasskeyCredentialReadTable,
  type PasskeyCredentialOwnershipTable,
  type PasskeyHandleReadTable,
  type PasskeyHandleReservationTable,
  type PasskeyHandleOwnershipTable,
  requiredPasskeyCredentialConstraints,
  type PasskeyCredentialMapping,
  type PasskeyPolicyGuard,
  passkeyPolicyGuard,
  type PasskeyModuleTable,
  type PasskeyFlowState,
  type PasskeyFlowInsert,
  type PasskeyFlowTable,
  type PasskeyAdmissionTable,
  type PasskeyChargeKind,
  type PasskeyChargeInsert,
  type PasskeyChargeTable,
  requiredPasskeyPersistenceConstraints,
  type PasskeyCeremonyMapping,
  type PasskeyPersistenceMapping,
  type PasskeyEnrollmentContextMapping,
  type D1PasskeyMapping,
} from "./internal/models/passkey-model";

export {
  type PasskeyRegistrationCeremonyCapabilities,
  type PasskeyRegistrationCeremonyServices,
  type PasskeyRegistrationIntentReadTable,
  requiredPasskeyRegistrationCeremonyConstraints,
  type PasskeyRegistrationCeremonyMapping,
} from "./internal/models/passkey-registration-ceremony-model";

export {
  type PasskeyCredentialInsert,
  type PasskeyWriteTables,
  type PasskeyInvalidationInput,
  type PasskeyInvalidationMutation,
  passkeyInvalidationMutation,
  type PasskeyCommandTable,
  type PasskeyManagementMapping,
  requiredPasskeyManagementConstraints,
  type PasskeyManagementServices,
  type PasskeyRegistrationWriter,
  type PasskeyRegistrationServices,
  type PasskeyRegistrationMapping,
  requiredPasskeyRegistrationWriteConstraints,
} from "./internal/models/passkey-write-model";

export {
  type PasswordAttemptAction,
  type PasswordAttemptState,
  type PasswordRateScopeKind,
  type PasswordScopeKeys,
  type PasswordSubjectTable,
  type PasswordIdentifierTable,
  type PasswordAuthorityCredentialTable,
  type PasswordCredentialTable,
  type PasswordAttemptRecord,
  type PasswordAttemptTable,
  type PasswordRateScopeTable,
  type PasswordChargeTable,
  type PasswordCommandTable,
  type RequiredPasswordConstraints,
  requiredPasswordConstraints,
  type PasswordConstraintClassifier,
  type PasswordD1Clock,
  type PasswordPersistenceMapping,
  type D1PasswordPersistenceMapping,
  type PasswordRegistrationState,
  type PasswordRegistrationIntent,
  type PasswordRegistrationTable,
  type PasswordRegistrationProvisioning,
  type RequiredPasswordRegistrationConstraints,
  requiredPasswordRegistrationConstraints,
  type PasswordRegistrationConstraintClassifier,
  type PasswordRegistrationMapping,
  type AnyPasswordPersistenceMapping,
  type AnyPasswordRegistrationMapping,
} from "./internal/models/password-model";

export {
  type ProofAction,
  type ProofScopeKind,
  type ProofGenerationState,
  type ProofDeliveryState,
  type ProofCommandKind,
  type ProofCommandDecision,
  type ProofScopeKeys,
  type ProofAuthorityInput,
  type ProofAuthorityTables,
  type ProofRequestTable,
  type ProofSeriesTable,
  type ProofGenerationTable,
  type ProofContinuationRecord,
  type ProofContinuationTable,
  type ProofRateScopeTable,
  type ProofAbuseEventTable,
  type ProofFailureEventTable,
  type ProofCommandTable,
  type RequiredProofConstraints,
  requiredProofConstraints,
  type ProofConstraintClassifier,
  type ProofD1Clock,
  type ProofPersistenceMapping,
  type D1ProofPersistenceMapping,
  type AnyProofPersistenceMapping,
} from "./internal/models/proof-model";

export {
  type SessionIdCodec,
  type SessionSubjectTables,
  type SessionAuthorityTables,
  type SessionFlowTables,
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
  type SessionConstraintClassifier,
  type AuthenticationAuthorityMapping,
  type StatefulSessionMapping,
  type PendingAuthenticationMapping,
  type SignedSessionValidityMapping,
  type D1SessionClockMapping,
  type D1AuthenticationAuthorityMapping,
  type D1PendingAuthenticationMapping,
  type D1StatefulSessionMapping,
  type D1SignedSessionValidityMapping,
} from "./internal/models/session-model";

export {
  type SessionStepUpIntentTables,
  type RequiredSessionStepUpConstraints,
  requiredSessionStepUpConstraints,
  type SessionStepUpSourceTables,
  type SessionStepUpMapping,
  type D1SessionStepUpMapping,
} from "./internal/models/step-up-model";

export { requireStandalone } from "./internal/standalone";

export {
  decodeStepUpIntent,
  encodeStepUpIntent,
  stepUpIntentLive,
  validateStepUpPlan,
} from "./internal/step-up-state";

export {
  type CurrentAddress,
  CurrentEmailSql,
  type EmailSqlConfiguration,
  type EmailSqlDatabase,
  type EmailSqlQuery,
  makeEmailKernel,
} from "./internal/email-kernel";

export { PersistenceMappingError, isMappedConstraintConflict } from "./internal/mapping-error";
export { type PasskeyKernel, makePasskeyKernel } from "./internal/passkey-kernel";
export { type PasskeyOwner, CurrentPasskeyTransaction } from "./internal/passkey/state";

export {
  type PasskeyCoordinatorError,
  type PasskeyExecution,
  type PasskeyTargetConfiguration,
} from "./internal/passkey/target";

export {
  CurrentPasswordPreparedTransaction,
  PasswordPreparedJournalGuards,
  type PasswordPreparedPostcondition,
  PasswordPreparedPostconditions,
} from "./internal/PasswordPreparedPostconditions";

export {
  CurrentPasswordSql,
  type PasswordSqlConfiguration,
  type PasswordSqlDatabase,
  type PasswordSqlQuery,
  makePasswordKernel,
} from "./internal/password-kernel";

export { CurrentPhoneTransaction, makePhoneKernel } from "./internal/phone-kernel";

export {
  CurrentProofSql,
  type ProofSqlConfiguration,
  type ProofSqlDatabase,
  type ProofSqlQuery,
  makeProofKernel,
} from "./internal/proof-kernel";

export {
  type QueryFailure,
  type QueryOperations,
  type SqlColumn,
  type SqlExpression,
  type SqlFragment,
  type TableModel,
} from "./internal/query-operations";

export {
  CurrentSessionSql,
  type SessionSqlDatabase,
  type SessionSqlOptions,
  makeSessionKernel,
} from "./internal/session-kernel";

export {
  type TransactionBound,
  type TransactionCoordinatorError,
  type TransactionExecution,
  type TransactionTargetConfiguration,
  makeTransactionExecutionKernel,
} from "./internal/transaction-execution-kernel";

export {
  type GuardedUpdate,
  type Observation,
  type Row,
  NativeDatabase,
  type TransactionNativeDatabase,
  type TransactionOwner,
  makeTransactionKernel,
} from "./internal/transaction-kernel";

export { PersistenceConfigurationError } from "./internal/configuration";
export { makeComposedPasskeys } from "./internal/passkeys";
export { createPersistence } from "./internal/persistence";
export { makeMappings as makeStorageMappings } from "./internal/storage-mapping";
export { type StorageTable } from "./internal/storage-tables";
export type { SubjectIdCodec } from "./internal/models/common";
export type { PasswordRegistrationAuthority } from "./internal/registration-contract";

export type {
  BoundPersistence,
  ClaimsCodec,
  Definition,
  PersistenceApi,
} from "./internal/configuration";

export { validateStorage, type PhysicalStorageTable } from "./internal/storage-validation";
