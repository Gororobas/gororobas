import {
  AuthContract,
  Schema as AuthSchema,
  Email,
  Hooks,
  Operations,
  Proofs,
  Sessions,
} from "@yielded/auth"
import { Schema } from "effect"
export const authenticationNamespace = "gororobas/auth"
export const sessionCookieName = "__Host-gororobas-session"
export const AuthenticationClaims = Schema.Struct({})
export const AuthenticationSession = Schema.Struct({
  ...Sessions.SessionMetadata.fields,
  claims: AuthenticationClaims,
})

/** The only return target: sign-in always lands on the app, which routes to onboarding when needed. */
export const DEFAULT_AUTHENTICATION_RETURN_TARGET = "/"

/**
 * Signing in and signing up share one flow: requesting a code for an unknown address
 * reserves an unclaimed account, which the first successful code redemption claims.
 */
export const EmailSignInFailure = Schema.Union([
  Email.EmailRejected,
  Email.EmailUnavailable,
  Email.EmailActionRequired,
  Email.EmailMethodUnsupported,
  Hooks.HookDenied,
])

const EmailSignInFields = {
  flowId: Operations.RequestBindingFlowId,
  email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(AuthSchema.Email)),
  returnTarget: Schema.String.check(Schema.isMaxLength(2048)),
}

export const EmailCodeRequest = Schema.Struct({
  ...EmailSignInFields,
  requestId: Proofs.ProofRequestId,
  locale: AuthSchema.Locale,
})

export const EmailCodeCompletion = Schema.Struct({
  ...EmailSignInFields,
  reference: Proofs.ProofReference,
  secret: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096))),
})

export const AuthenticationApi = AuthContract.make(authenticationNamespace, {
  claims: AuthenticationClaims,
  basePath: "/api/auth",
  actions: (sessions) => ({
    beginEmailSignIn: AuthContract.action({
      payload: Schema.Struct({ flowId: Operations.RequestBindingFlowId }),
      success: Operations.RequestBindingPublic,
      error: EmailSignInFailure,
      mode: "mutation",
      credentials: true,
      method: "beginSignIn",
      strategy: "email",
    }),
    requestEmailCode: AuthContract.action({
      payload: EmailCodeRequest,
      success: Proofs.ProofRequestReceipt,
      error: EmailSignInFailure,
      mode: "mutation",
      credentials: true,
      method: "signIn",
      strategy: "email",
      requestFields: { requestBinding: "request-binding" },
    }),
    completeEmailSignIn: AuthContract.action({
      payload: EmailCodeCompletion,
      success: Schema.Struct({
        completion: sessions.CompletionResult,
        returnTarget: Email.SafeReturnTarget,
      }),
      error: EmailSignInFailure,
      mode: "mutation",
      credentials: true,
      replay: "single-use",
      method: "completeSignIn",
      strategy: "email",
      requestFields: { requestBinding: "request-binding" },
      subject: {
        fromSuccess: (value) =>
          value.completion._tag === "Authenticated"
            ? value.completion.session.subjectId
            : undefined,
      },
    }),
  }),
})
