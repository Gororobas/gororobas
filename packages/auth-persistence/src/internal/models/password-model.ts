import { type RecoveryReference, type LoginIdentifier } from "@yielded/auth/Identity";
import type {
  PasswordAction,
  PasswordAttemptId,
  PasswordCredentialSnapshot,
  PasswordReplacement,
  PasswordRegistrationDecision,
  EncodedPasswordHash,
} from "@yielded/auth/Password";
import type { AuthenticationRequirement, SecurityRevision } from "@yielded/auth/Sessions";
import type { Effect, Redacted } from "effect";

import type { AnyTableModel, TableModel as Table, SqlExpression } from "../query-operations";
import type { PersistenceMappingError, SubjectIdCodec } from "./common";

type ColumnKey<T extends Table> = T["column"];

export type PasswordAttemptAction = "sign-in" | "change";

export type PasswordAttemptState = "pending" | "verified" | "rejected";

export type PasswordRateScopeKind = "action" | "identifier" | "subject";

export interface PasswordScopeKeys {
  readonly action: string;
  readonly identifier: string;
  readonly subject?: string;
}

export interface PasswordSubjectTable<Subject extends Table, _NativeSubjectId> {
  readonly table: Subject["table"];
  readonly id: ColumnKey<Subject>;
  readonly status: ColumnKey<Subject>;
  readonly securityRevision: ColumnKey<Subject>;
  readonly isActiveStatus: (value: unknown) => boolean;
  readonly decodeRequirement: (
    row: Subject["select"],
  ) => Effect.Effect<AuthenticationRequirement, PersistenceMappingError>;
  /** Current policy for this exact credential mutation, decoded under the subject lock. */
  readonly decodeActionRequirement: (
    row: Subject["select"],
    action: PasswordAction,
  ) => Effect.Effect<AuthenticationRequirement, PersistenceMappingError>;
  readonly nextSecurityRevision?: (
    current: SecurityRevision,
  ) => Effect.Effect<SecurityRevision, PersistenceMappingError>;
  readonly nextSecurityRevisionSync?: (current: SecurityRevision) => SecurityRevision;
  /** Required only by D1 conditional statements. */
  readonly d1ActiveStatusValue?: unknown;
}

export interface PasswordIdentifierTable<
  Identifier extends Table,
  NativeSubjectId,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: Identifier["table"];
  readonly namespace: ColumnKey<Identifier>;
  readonly value: ColumnKey<Identifier>;
  readonly subjectId: ColumnKey<Identifier>;
  readonly verifiedAt: ColumnKey<Identifier>;
  readonly bindingRevision: ColumnKey<Identifier>;
  /** Consumer-owned current login/recovery eligibility, including row status. */
  readonly isCurrent: (row: Identifier["select"]) => boolean;
  /** Required by D1 so current ownership/eligibility is rechecked in the batch. */
  readonly d1CurrentCondition?: (input: {
    readonly identifier: LoginIdentifier;
    readonly nativeSubjectId: NativeSubjectId;
  }) => Expression;
  readonly encodeInitialInsert: (
    identifier: LoginIdentifier,
    subjectId: NativeSubjectId,
    bindingRevision: SecurityRevision,
  ) => Identifier["insert"];
}

export interface PasswordAuthorityCredentialTable<Credential extends Table, NativeSubjectId> {
  readonly table: Credential["table"];
  readonly subjectId: ColumnKey<Credential>;
  readonly credentialId: ColumnKey<Credential>;
  readonly revision: ColumnKey<Credential>;
  readonly status?: ColumnKey<Credential>;
  readonly isActiveStatus?: (value: unknown) => boolean;
  readonly d1ActiveStatusValue?: unknown;
  readonly encodeInsert: (input: {
    readonly subjectId: NativeSubjectId;
    readonly credentialId: string;
    readonly revision: SecurityRevision;
  }) => Credential["insert"];
  readonly encodeRevision: (revision: SecurityRevision) => Partial<Credential["insert"]>;
}

export interface PasswordCredentialTable<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  NativeSubjectId,
> {
  readonly table: Credential["table"];
  readonly moduleId: ColumnKey<Credential>;
  readonly subjectId: ColumnKey<Credential>;
  readonly credentialId: ColumnKey<Credential>;
  readonly credentialRevision: ColumnKey<Credential>;
  readonly verifierVersion: ColumnKey<Credential>;
  readonly verifier: ColumnKey<Credential>;
  readonly normalization: ColumnKey<Credential>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly subjectId: NativeSubjectId;
    readonly credentialId: string;
    readonly credentialRevision: SecurityRevision;
    readonly verifierVersion: SecurityRevision;
    readonly replacement: PasswordReplacement;
  }) => Credential["insert"];
  readonly encodeVerifier: (
    verifier: Redacted.Redacted<EncodedPasswordHash>,
    verifierVersion: SecurityRevision,
  ) => Partial<Credential["insert"]>;
  readonly encodeReplacement: (input: {
    readonly replacement: PasswordReplacement;
    readonly credentialRevision: SecurityRevision;
    readonly verifierVersion: SecurityRevision;
  }) => Partial<Credential["insert"]>;
  readonly decode: (input: {
    readonly moduleId: string;
    readonly subject: Subject["select"];
    readonly identifier: Identifier["select"];
    readonly credential: Credential["select"];
  }) => Effect.Effect<PasswordCredentialSnapshot, PersistenceMappingError>;
}

export interface PasswordAttemptRecord {
  readonly moduleId: string;
  readonly action: PasswordAttemptAction;
  readonly attemptId: PasswordAttemptId;
  readonly identifier: LoginIdentifier;
  readonly subjectId?: string;
  readonly credentialId?: string;
  readonly securityRevision?: SecurityRevision;
  readonly credentialRevision?: SecurityRevision;
  readonly verifierVersion?: SecurityRevision;
  readonly identifierBindingRevision?: SecurityRevision;
  readonly admittedAtMillis: number;
  readonly deadlineMillis: number;
  readonly retentionUntilMillis: number;
}

export interface PasswordAttemptTable<Attempt extends Table, NativeSubjectId> {
  readonly table: Attempt["table"];
  readonly moduleId: ColumnKey<Attempt>;
  readonly action: ColumnKey<Attempt>;
  readonly attemptId: ColumnKey<Attempt>;
  readonly identifierNamespace: ColumnKey<Attempt>;
  readonly identifierValue: ColumnKey<Attempt>;
  readonly subjectId: ColumnKey<Attempt>;
  readonly credentialId: ColumnKey<Attempt>;
  readonly securityRevision: ColumnKey<Attempt>;
  readonly credentialRevision: ColumnKey<Attempt>;
  readonly verifierVersion: ColumnKey<Attempt>;
  readonly identifierBindingRevision: ColumnKey<Attempt>;
  readonly admittedAt: ColumnKey<Attempt>;
  readonly deadline: ColumnKey<Attempt>;
  readonly retentionUntil: ColumnKey<Attempt>;
  readonly state: ColumnKey<Attempt>;
  readonly encodeInsert: (
    record: PasswordAttemptRecord,
    input: {
      readonly nativeSubjectId?: NativeSubjectId;
      readonly state: "pending";
    },
  ) => Attempt["insert"];
}

export interface PasswordRateScopeTable<RateScope extends Table> {
  readonly table: RateScope["table"];
  readonly moduleId: ColumnKey<RateScope>;
  readonly action: ColumnKey<RateScope>;
  readonly scopeKind: ColumnKey<RateScope>;
  readonly scopeKey: ColumnKey<RateScope>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly action: PasswordAttemptAction;
    readonly scopeKind: PasswordRateScopeKind;
    readonly scopeKey: string;
  }) => RateScope["insert"];
}

export interface PasswordChargeTable<Charge extends Table> {
  readonly table: Charge["table"];
  readonly moduleId: ColumnKey<Charge>;
  readonly action: ColumnKey<Charge>;
  readonly scopeKind: ColumnKey<Charge>;
  readonly scopeKey: ColumnKey<Charge>;
  readonly attemptId: ColumnKey<Charge>;
  readonly occurredAt: ColumnKey<Charge>;
  readonly retentionUntil: ColumnKey<Charge>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly action: PasswordAttemptAction;
    readonly scopeKind: PasswordRateScopeKind;
    readonly scopeKey: string;
    readonly attemptId: PasswordAttemptId;
    readonly occurredAtMillis: number;
    readonly retentionUntilMillis: number;
  }) => Charge["insert"];
}

export interface PasswordCommandTable<Command extends Table> {
  readonly table: Command["table"];
  readonly moduleId: ColumnKey<Command>;
  readonly commandId: ColumnKey<Command>;
  readonly action: ColumnKey<Command>;
  readonly bindingDigest: ColumnKey<Command>;
  readonly decision: ColumnKey<Command>;
  readonly retentionUntil: ColumnKey<Command>;
  readonly encodeInsert: (input: {
    readonly moduleId: string;
    readonly commandId: string;
    readonly action: string;
    readonly bindingDigest: string;
    readonly decision: "changed";
    readonly retentionUntilMillis: number;
  }) => Command["insert"];
}

export interface RequiredPasswordConstraints {
  readonly identifier: "unique(identifier.namespace,identifier.value)";
  readonly authorityCredential: "unique(authorityCredential.subjectId,authorityCredential.credentialId)";
  readonly credentialSubject: "unique(credential.moduleId,credential.subjectId)";
  readonly credentialId: "unique(credential.moduleId,credential.credentialId)";
  readonly attempt: "unique(attempt.moduleId,attempt.attemptId)";
  readonly rateScope: "unique(rateScope.moduleId,rateScope.action,rateScope.scopeKind,rateScope.scopeKey)";
  readonly charge: "unique(charge.moduleId,charge.action,charge.scopeKind,charge.scopeKey,charge.attemptId)";
  readonly command: "unique(command.moduleId,command.commandId)";
}

export const requiredPasswordConstraints: RequiredPasswordConstraints = {
  identifier: "unique(identifier.namespace,identifier.value)",
  authorityCredential: "unique(authorityCredential.subjectId,authorityCredential.credentialId)",
  credentialSubject: "unique(credential.moduleId,credential.subjectId)",
  credentialId: "unique(credential.moduleId,credential.credentialId)",
  attempt: "unique(attempt.moduleId,attempt.attemptId)",
  rateScope: "unique(rateScope.moduleId,rateScope.action,rateScope.scopeKind,rateScope.scopeKey)",
  charge: "unique(charge.moduleId,charge.action,charge.scopeKind,charge.scopeKey,charge.attemptId)",
  command: "unique(command.moduleId,command.commandId)",
};

export interface PasswordConstraintClassifier {
  /** Match only the mapped command uniqueness constraint. */
  readonly isCommandConflict: (cause: unknown) => boolean;
  /** Match only the mapped rate-scope uniqueness constraint. */
  readonly isRateScopeConflict: (cause: unknown) => boolean;
}

export interface PasswordD1Clock<Expression extends SqlExpression = SqlExpression> {
  readonly engineNow: Expression;
  readonly engineNowMillis: Expression;
  readonly engineInstantMinus: (millis: number) => Expression;
  readonly engineInstantPlus: (millis: number) => Expression;
}

export interface PasswordPersistenceMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Attempt extends Table,
  RateScope extends Table,
  Charge extends Table,
  Command extends Table,
  NativeSubjectId,
  Expression extends SqlExpression = SqlExpression,
> extends PasswordConstraintClassifier {
  readonly subject: PasswordSubjectTable<Subject, NativeSubjectId>;
  readonly identifier: PasswordIdentifierTable<Identifier, NativeSubjectId, Expression>;
  readonly credential: PasswordCredentialTable<Subject, Identifier, Credential, NativeSubjectId>;
  /** Every factor revision named by action evidence, including non-password factors. */
  readonly authorityCredential: PasswordAuthorityCredentialTable<
    AuthorityCredential,
    NativeSubjectId
  >;
  readonly attempt: PasswordAttemptTable<Attempt, NativeSubjectId>;
  readonly rateScope: PasswordRateScopeTable<RateScope>;
  readonly charge: PasswordChargeTable<Charge>;
  readonly command: PasswordCommandTable<Command>;
  readonly subjectId: SubjectIdCodec<NativeSubjectId>;
  readonly constraints: RequiredPasswordConstraints;
  readonly scopeKeys: (input: {
    readonly moduleId: string;
    readonly action: PasswordAttemptAction;
    readonly identifier: LoginIdentifier;
    readonly subjectId?: string;
  }) => PasswordScopeKeys;
  readonly encodeInstant: (epochMillis: number) => unknown;
  readonly decodeInstant: (native: unknown) => Effect.Effect<number, PersistenceMappingError>;
  readonly allocateAttemptId?: Effect.Effect<PasswordAttemptId, PersistenceMappingError>;
  readonly allocateAttemptIdSync?: () => PasswordAttemptId;
  readonly allocateCredentialId?: Effect.Effect<string, PersistenceMappingError>;
  readonly allocateCredentialIdSync?: () => string;
  readonly allocateRevision?: Effect.Effect<SecurityRevision, PersistenceMappingError>;
  readonly allocateRevisionSync?: () => SecurityRevision;
  readonly commandRetentionMillis: number;
  /** All semantic replacements still bump subject revision. This flag only declares bearer invalidation latency. */
  readonly sessionInvalidation: "same-authority-immediate" | "original-absolute-expiry";
  readonly d1?: PasswordD1Clock<Expression>;
}

export type D1PasswordPersistenceMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Attempt extends Table,
  RateScope extends Table,
  Charge extends Table,
  Command extends Table,
  NativeSubjectId,
  Expression extends SqlExpression = SqlExpression,
> = PasswordPersistenceMapping<
  Subject,
  Identifier,
  Credential,
  AuthorityCredential,
  Attempt,
  RateScope,
  Charge,
  Command,
  NativeSubjectId,
  Expression
> & {
  readonly d1: PasswordD1Clock<Expression>;
  readonly subject: PasswordSubjectTable<Subject, NativeSubjectId> & {
    readonly d1ActiveStatusValue: unknown;
  };
  readonly identifier: PasswordIdentifierTable<Identifier, NativeSubjectId, Expression> & {
    readonly d1CurrentCondition: (input: {
      readonly identifier: LoginIdentifier;
      readonly nativeSubjectId: NativeSubjectId;
    }) => Expression;
  };
  readonly authorityCredential: PasswordAuthorityCredentialTable<
    AuthorityCredential,
    NativeSubjectId
  > & {
    readonly d1ActiveStatusValue: unknown;
  };
};

export type PasswordRegistrationState = "pending" | "created";

export interface PasswordRegistrationIntent<Registration> {
  readonly moduleId: string;
  readonly requestId: string;
  readonly identifier: LoginIdentifier;
  readonly registration: Registration;
  readonly replacement: PasswordReplacement;
}

export interface PasswordRegistrationTable<Registration, Request extends Table, NativeSubjectId> {
  readonly table: Request["table"];
  readonly moduleId: ColumnKey<Request>;
  readonly requestId: ColumnKey<Request>;
  readonly state: ColumnKey<Request>;
  readonly subjectId: ColumnKey<Request>;
  readonly recoveryReference: ColumnKey<Request>;
  readonly encodeInsert: (
    input: PasswordRegistrationIntent<Registration>,
    state: {
      readonly state: PasswordRegistrationState;
      readonly nativeSubjectId?: NativeSubjectId;
      readonly recoveryReference?: typeof RecoveryReference.Type;
    },
  ) => Request["insert"];
  /** Replay projection must never expose a stored subject or decode protected intent. */
  readonly decodeReplay: (row: Request["select"]) => Effect.Effect<
    Exclude<
      PasswordRegistrationDecision,
      {
        readonly _tag: "Created";
      }
    >,
    PersistenceMappingError
  >;
}

export interface PasswordRegistrationProvisioning<
  Registration,
  Subject extends Table,
  NativeSubjectId,
> {
  readonly encodeSubjectInsert: (
    input: PasswordRegistrationIntent<Registration>,
    values: {
      readonly nativeSubjectId: NativeSubjectId | undefined;
      readonly securityRevision: SecurityRevision;
    },
  ) => Subject["insert"];
  readonly allocateSubjectId?: Effect.Effect<NativeSubjectId, PersistenceMappingError>;
  readonly allocateSubjectIdSync?: () => NativeSubjectId;
  /** Interactive targets use this for database-generated/autoincrement keys. */
  readonly decodeGeneratedId?: (
    rows: ReadonlyArray<unknown>,
  ) => Effect.Effect<NativeSubjectId, PersistenceMappingError>;
}

export interface RequiredPasswordRegistrationConstraints {
  readonly request: "unique(registration.moduleId,registration.requestId)";
  readonly recoveryReference: "unique(registration.recoveryReference)";
  readonly identifier: "unique(identifier.namespace,identifier.value)";
  readonly credentialSubject: "unique(credential.moduleId,credential.subjectId)";
  readonly authorityCredential: "unique(authorityCredential.subjectId,authorityCredential.credentialId)";
}

export const requiredPasswordRegistrationConstraints: RequiredPasswordRegistrationConstraints = {
  request: "unique(registration.moduleId,registration.requestId)",
  recoveryReference: "unique(registration.recoveryReference)",
  identifier: "unique(identifier.namespace,identifier.value)",
  credentialSubject: "unique(credential.moduleId,credential.subjectId)",
  authorityCredential: "unique(authorityCredential.subjectId,authorityCredential.credentialId)",
};

export interface PasswordRegistrationConstraintClassifier {
  readonly isRequestConflict: (cause: unknown) => boolean;
  readonly isIdentifierConflict: (cause: unknown) => boolean;
  readonly isCredentialConflict: (cause: unknown) => boolean;
}

export type PasswordRegistrationMapping<
  Registration,
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Request extends Table,
  NativeSubjectId,
  Expression extends SqlExpression = SqlExpression,
> = PasswordRegistrationConstraintClassifier & {
  readonly subject: PasswordSubjectTable<Subject, NativeSubjectId>;
  readonly identifier: PasswordIdentifierTable<Identifier, NativeSubjectId, Expression>;
  readonly credential: PasswordCredentialTable<Subject, Identifier, Credential, NativeSubjectId>;
  readonly authorityCredential: PasswordAuthorityCredentialTable<
    AuthorityCredential,
    NativeSubjectId
  >;
  readonly registration: PasswordRegistrationTable<Registration, Request, NativeSubjectId>;
  readonly subjectId: SubjectIdCodec<NativeSubjectId>;
  readonly constraints: RequiredPasswordRegistrationConstraints;
  readonly allocateCredentialId?: Effect.Effect<string, PersistenceMappingError>;
  readonly allocateCredentialIdSync?: () => string;
  readonly allocateRevision?: Effect.Effect<SecurityRevision, PersistenceMappingError>;
  readonly allocateRevisionSync?: () => SecurityRevision;
} & (
    | {
        readonly mode: "atomic";
        readonly provisioning: PasswordRegistrationProvisioning<
          Registration,
          Subject,
          NativeSubjectId
        > &
          (
            | {
                readonly idMode: "allocated";
                readonly allocateSubjectId: Effect.Effect<NativeSubjectId, PersistenceMappingError>;
              }
            | {
                readonly idMode: "synchronous";
                readonly allocateSubjectIdSync: () => NativeSubjectId;
              }
            | {
                readonly idMode: "generated";
                readonly decodeGeneratedId: (
                  rows: ReadonlyArray<unknown>,
                ) => Effect.Effect<NativeSubjectId, PersistenceMappingError>;
              }
          );
      }
    | {
        readonly mode: "pending";
        readonly allocateRecoveryReference?: Effect.Effect<
          typeof RecoveryReference.Type,
          PersistenceMappingError
        >;
        readonly allocateRecoveryReferenceSync?: () => typeof RecoveryReference.Type;
      }
  );

export type AnyPasswordPersistenceMapping<Expression extends SqlExpression = SqlExpression> =
  PasswordPersistenceMapping<
    AnyTableModel,
    AnyTableModel,
    AnyTableModel,
    AnyTableModel,
    AnyTableModel,
    AnyTableModel,
    AnyTableModel,
    AnyTableModel,
    unknown,
    Expression
  >;

export type AnyPasswordRegistrationMapping<
  Registration = unknown,
  Expression extends SqlExpression = SqlExpression,
> = PasswordRegistrationMapping<
  Registration,
  AnyTableModel,
  AnyTableModel,
  AnyTableModel,
  AnyTableModel,
  AnyTableModel,
  unknown,
  Expression
>;
