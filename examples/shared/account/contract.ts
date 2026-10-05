import {
  AuthContract,
  Email,
  Operations,
  PasskeyContract,
  Password,
  Proofs,
  Schema as AuthSchema,
  Sessions,
} from "@yielded/auth";
import { Schema } from "effect";

export const minimumPasswordLength = 8;
export const emailProofPolicy = Proofs.defaultProofPolicy;

export const Registration = Schema.Struct({
  displayName: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
});

export const Claims = Schema.Struct({
  displayName: Schema.String,
  email: AuthSchema.Email,
  emailVerified: Schema.Boolean,
});

const email = Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(AuthSchema.Email));
const password = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));
const secret = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));

export const PasswordFailure = Schema.Union([
  Password.PasswordRejected,
  Password.PasswordUnavailable,
  Password.PasswordActionRequired,
  Password.PasswordMethodUnsupported,
  Password.NewPasswordRejected,
  Password.PasswordCheckUnavailable,
]);

const EmailFailure = Schema.Union([
  Email.EmailRejected,
  Email.EmailUnavailable,
  Email.EmailActionRequired,
  Email.EmailMethodUnsupported,
]);

const mutationResult = Schema.Struct({ invalidation: Sessions.SessionInvalidationWindow });
const continuationResult = Schema.Struct({ continuation: Proofs.ProofContinuation });
const resetBase = { flowId: Sessions.AuthenticationFlowId, email };

const verifyBase = {
  flowId: Operations.RequestBindingFlowId,
  commandId: Email.EmailCommandId,
  email,
};

const passkeys = PasskeyContract.makeManagement("customers/passkeys").operations;

export const RegisterInput = Schema.Struct({
  requestId: Password.PasswordCommandId,
  email,
  newPassword: password,
  registration: Registration,
});

export const RegisterResult = Schema.Union([
  Schema.TaggedStruct("RegistrationAccepted", {}),
  Schema.TaggedStruct("ProvisioningPending", { reference: Schema.String }),
]);

type Completion =
  | { readonly _tag: "Authenticated"; readonly session: { readonly subjectId: string } }
  | { readonly _tag: "PendingAuthentication" };

// Reuse the actions with the caller's session schemas, including any additional claims.
export const accountActions = <
  Session extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Result extends Schema.Codec<Completion, unknown, unknown, unknown>,
>(sessions: {
  readonly Session: Session;
  readonly CompletionResult: Result;
}) => ({
  passwordSignIn: AuthContract.passwordSignIn(sessions, { strategy: "password" }),
  passkeySignIn: AuthContract.fromOperation(
    PasskeyContract.make("customers/passkey", sessions).operations.Begin,
    {
      strategy: "passkey",
      method: "signIn",
    },
  ),
  completePasskeySignIn: AuthContract.fromOperation(
    PasskeyContract.make("customers/passkey", sessions).operations.Complete,
    {
      strategy: "passkey",
      method: "completeSignIn",
      requestFields: { bindingCredential: "request-binding" },
      subject: {
        fromSuccess: (result) =>
          result._tag === "Authenticated" ? result.session.subjectId : undefined,
      },
    },
  ),
  enrollPasskey: AuthContract.fromOperation(passkeys.Begin, { strategy: "passkeys" }),
  completePasskeyEnrollment: AuthContract.fromOperation(passkeys.Complete, {
    strategy: "passkeys",
    requestFields: { bindingCredential: "request-binding" },
  }),
  listPasskeys: AuthContract.fromOperation(passkeys.List, {
    strategy: "passkeys",
    mode: "query",
  }),
  renamePasskey: AuthContract.fromOperation(passkeys.Rename, { strategy: "passkeys" }),
  register: AuthContract.action({
    payload: RegisterInput,
    success: RegisterResult,
    error: PasswordFailure,
    mode: "mutation",
    replay: "idempotent",
    strategy: "password",
  }),
  requestReset: AuthContract.action({
    payload: Schema.Struct({
      ...resetBase,
      requestId: Proofs.ProofRequestId,
      locale: Schema.String,
    }),
    success: Proofs.ProofRequestReceipt,
    error: PasswordFailure,
    mode: "mutation",
    replay: "idempotent",
    strategy: "password",
  }),
  verifyReset: AuthContract.action({
    payload: Schema.Struct({ ...resetBase, reference: Proofs.ProofReference, secret }),
    success: continuationResult,
    error: PasswordFailure,
    mode: "mutation",
    replay: "single-use",
    credentials: true,
    strategy: "password",
  }),
  completeReset: AuthContract.action({
    payload: Schema.Struct({
      ...resetBase,
      commandId: Password.PasswordCommandId,
      continuationId: Proofs.ProofContinuationId,
      newPassword: password,
    }),
    success: mutationResult,
    error: PasswordFailure,
    mode: "mutation",
    replay: "single-use",
    credentials: true,
    strategy: "password",
    requestFields: { credential: "proof-continuation" },
  }),
  beginEmailAddress: AuthContract.action({
    payload: Schema.Struct({ flowId: Operations.RequestBindingFlowId }),
    success: Operations.RequestBindingPublic,
    error: EmailFailure,
    mode: "mutation",
    credentials: true,
    strategy: "email",
  }),
  requestEmailVerification: AuthContract.action({
    payload: Schema.Struct({
      ...verifyBase,
      requestId: Proofs.ProofRequestId,
      locale: Schema.String,
    }),
    success: Proofs.ProofRequestReceipt,
    error: EmailFailure,
    mode: "mutation",
    replay: "idempotent",
    strategy: "email",
    requestFields: { requestBinding: "request-binding" },
  }),
  resendEmailVerification: AuthContract.action({
    payload: Schema.Struct({
      ...verifyBase,
      requestId: Proofs.ProofRequestId,
      locale: Schema.String,
      supersedes: Proofs.ProofId,
    }),
    success: Proofs.ProofRequestReceipt,
    error: EmailFailure,
    mode: "mutation",
    replay: "idempotent",
    strategy: "email",
    requestFields: { requestBinding: "request-binding" },
  }),
  verifyEmailAddress: AuthContract.action({
    payload: Schema.Struct({ ...verifyBase, reference: Proofs.ProofReference, secret }),
    success: continuationResult,
    error: EmailFailure,
    mode: "mutation",
    replay: "single-use",
    credentials: true,
    strategy: "email",
    requestFields: { requestBinding: "request-binding" },
  }),
  completeEmailVerification: AuthContract.action({
    payload: Schema.Struct({ ...verifyBase, continuationId: Proofs.ProofContinuationId }),
    success: Schema.Struct({
      invalidation: Schema.optionalKey(Sessions.SessionInvalidationWindow),
    }),
    error: EmailFailure,
    mode: "mutation",
    replay: "single-use",
    credentials: true,
    strategy: "email",
    requestFields: { requestBinding: "request-binding", credential: "proof-continuation" },
  }),
});

export const AuthApi = AuthContract.make("customers", {
  claims: Claims,
  actions: accountActions,
});
