import {
  AuthContract,
  Email,
  Hooks,
  Identity,
  OAuth,
  Operations,
  Proofs,
  Schema as AuthSchema,
} from "@yielded/auth";
import { Schema } from "effect";

// Browser-safe shared contract. No provider configuration or credentials here.
export const Registration = Schema.Struct({
  acceptedTerms: Schema.Literal(true),
  displayName: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
});

const Failure = Schema.Union([
  OAuth.OAuthRejected,
  OAuth.OAuthUnavailable,
  OAuth.OAuthMethodUnsupported,
  Hooks.HookDenied,
]);

const EmailFailure = Schema.Union([
  Email.EmailRejected,
  Email.EmailUnavailable,
  Email.EmailActionRequired,
  Email.EmailMethodUnsupported,
  Hooks.HookDenied,
]);

const emailBase = {
  flowId: Operations.RequestBindingFlowId,
  email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(AuthSchema.Email)),
};

const emailSignIn = { ...emailBase, returnTarget: Schema.String.check(Schema.isMaxLength(2048)) };
const emailRegistration = { ...emailBase, registration: Registration };

const request = {
  requestId: Proofs.ProofRequestId,
  locale: Schema.NonEmptyString.check(Schema.isMaxLength(64)),
};

const attempt = {
  reference: Proofs.ProofReference,
  secret: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096))),
};

const verified = Schema.Struct({ continuation: Proofs.ProofContinuation });

export const LoginApi = AuthContract.make("example/social-auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({
    beginEmailSignIn: AuthContract.action({
      payload: Schema.Struct({ flowId: Operations.RequestBindingFlowId }),
      success: Operations.RequestBindingPublic,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      method: "beginSignIn",
      strategy: "email",
    }),
    requestEmailCode: AuthContract.action({
      payload: Schema.Struct({ ...emailSignIn, ...request }),
      success: Proofs.ProofRequestReceipt,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      method: "signIn",
      strategy: "email",
      requestFields: { requestBinding: "request-binding" },
    }),
    verifyEmailCode: AuthContract.action({
      payload: Schema.Struct({ ...emailSignIn, ...attempt }),
      success: verified,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      method: "verifySignIn",
      strategy: "email",
      requestFields: { requestBinding: "request-binding" },
    }),
    completeEmailSignIn: AuthContract.action({
      payload: Schema.Struct({ ...emailSignIn, continuationId: Proofs.ProofContinuationId }),
      success: Schema.Struct({
        completion: sessions.CompletionResult,
        returnTarget: Email.SafeReturnTarget,
      }),
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      replay: "single-use",
      method: "completeSignIn",
      strategy: "email",
      requestFields: { requestBinding: "request-binding", credential: "proof-continuation" },
      subject: {
        fromSuccess: (value) =>
          value.completion._tag === "Authenticated"
            ? value.completion.session.subjectId
            : undefined,
      },
    }),
    beginEmailRegistration: AuthContract.action({
      payload: Schema.Struct({ flowId: Operations.RequestBindingFlowId }),
      success: Operations.RequestBindingPublic,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      method: "beginRegistration",
      strategy: "emailRegistration",
    }),
    registerEmail: AuthContract.action({
      payload: Schema.Struct({ ...emailRegistration, ...request }),
      success: Proofs.ProofRequestReceipt,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      method: "register",
      strategy: "emailRegistration",
      requestFields: { requestBinding: "request-binding" },
    }),
    verifyEmailRegistration: AuthContract.action({
      payload: Schema.Struct({ ...emailRegistration, ...attempt }),
      success: verified,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      method: "verifyRegistration",
      strategy: "emailRegistration",
      requestFields: { requestBinding: "request-binding" },
    }),
    completeEmailRegistration: AuthContract.action({
      payload: Schema.Struct({
        ...emailRegistration,
        continuationId: Proofs.ProofContinuationId,
        commandId: Email.EmailCommandId,
      }),
      success: OAuth.OAuthRegistrationResult,
      error: EmailFailure,
      mode: "mutation",
      credentials: true,
      replay: "single-use",
      method: "completeRegistration",
      strategy: "emailRegistration",
      requestFields: { requestBinding: "request-binding", credential: "proof-continuation" },
    }),
    signIn: AuthContract.oauthSignIn(),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
    register: AuthContract.action({
      payload: Schema.Struct({
        reference: OAuth.OAuthRegistrationReference,
        flowId: OAuth.OAuthSignInBegin.fields.flowId,
        commandId: OAuth.OAuthCommandId,
        registration: Registration,
      }),
      success: OAuth.OAuthRegistrationResult,
      error: Schema.Union([Failure, Identity.IdentityConflict]),
      mode: "mutation",
      replay: "single-use",
      credentials: true,
      requestFields: { requestBinding: "request-binding", credential: "registration" },
    }),
  }),
});
