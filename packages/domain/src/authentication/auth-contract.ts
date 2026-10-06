import {
  AuthContract,
  Schema as AuthSchema,
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

export const MagicLinkIdentity = Schema.Struct({
  flowId: Operations.RequestBindingFlowId,
  email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(AuthSchema.Email)),
  name: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
})

export const MagicLinkFailure = Schema.Union([
  Proofs.ProofError,
  Operations.RequestBindingInvalid,
  Operations.RequestBindingUnavailable,
  Sessions.SessionError,
  Hooks.HookDenied,
])

export const OAuthProvider = Schema.Literals(["apple", "google", "microsoft"])
export const OAuthBeginPayload = Schema.Struct({
  flowId: Operations.RequestBindingFlowId,
  provider: OAuthProvider,
})

export const OAuthCompletePayload = Schema.Struct({
  flowId: Operations.RequestBindingFlowId,
  provider: OAuthProvider,
  state: Schema.String.check(Schema.isMaxLength(128)),
  code: Schema.RedactedFromValue(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  ),
})

export class OAuthLoginRejected extends Schema.TaggedError<OAuthLoginRejected>()(
  "OAuthLoginRejected",
  {
    reason: Schema.Literals([
      "provider-disabled",
      "invalid-flow",
      "email-verification-required",
      "account-conflict",
    ]),
  },
) {}

export const OAuthLoginFailure = Schema.Union([OAuthLoginRejected, MagicLinkFailure])

export const AuthenticationApi = AuthContract.make(authenticationNamespace, {
  claims: AuthenticationClaims,
  basePath: "/api/auth",
  actions: (sessions) => ({
    beginOAuth: AuthContract.action({
      strategy: "oauth",
      payload: OAuthBeginPayload,
      success: Schema.Struct({ authorizationUrl: Schema.String }),
      error: OAuthLoginFailure,
      mode: "mutation",
      credentials: true,
    }),
    completeOAuth: AuthContract.action({
      strategy: "oauth",
      payload: OAuthCompletePayload,
      success: sessions.CompletionResult,
      error: OAuthLoginFailure,
      mode: "mutation",
      credentials: true,
      replay: "single-use",
      requestFields: { requestBinding: "request-binding" },
      subject: {
        fromSuccess: (value) =>
          value._tag === "Authenticated" ? value.session.subjectId : undefined,
      },
    }),
    beginMagicLink: AuthContract.action({
      payload: Schema.Struct({ flowId: Operations.RequestBindingFlowId }),
      success: Operations.RequestBindingPublic,
      error: MagicLinkFailure,
      mode: "mutation",
      credentials: true,
    }),
    requestMagicLink: AuthContract.action({
      payload: Schema.Struct({
        ...MagicLinkIdentity.fields,
        requestId: Proofs.ProofRequestId,
        locale: AuthSchema.Locale,
      }),
      success: Proofs.ProofRequestReceipt,
      error: MagicLinkFailure,
      mode: "mutation",
      credentials: true,
      requestFields: { requestBinding: "request-binding" },
    }),
    verifyMagicLink: AuthContract.action({
      payload: Schema.Struct({
        ...MagicLinkIdentity.fields,
        reference: Proofs.ProofReference,
        secret: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096))),
      }),
      success: Schema.Struct({ continuation: Proofs.ProofContinuation }),
      error: MagicLinkFailure,
      mode: "mutation",
      credentials: true,
      replay: "single-use",
      requestFields: { requestBinding: "request-binding" },
    }),
    completeMagicLink: AuthContract.action({
      payload: Schema.Struct({
        ...MagicLinkIdentity.fields,
        continuationId: Proofs.ProofContinuationId,
      }),
      success: sessions.CompletionResult,
      error: MagicLinkFailure,
      mode: "mutation",
      credentials: true,
      replay: "single-use",
      requestFields: { requestBinding: "request-binding", credential: "proof-continuation" },
      subject: {
        fromSuccess: (value) =>
          value._tag === "Authenticated" ? value.session.subjectId : undefined,
      },
    }),
  }),
})
