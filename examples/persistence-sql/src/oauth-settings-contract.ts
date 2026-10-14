import { AuthContract, Hooks, Identity, OAuth, Operations } from "@yielded/auth";
import { Schema } from "effect";

const failure = Schema.Union([
  Operations.AuthenticationRequired,
  OAuth.OAuthActionRequired,
  OAuth.OAuthRejected,
  OAuth.OAuthUnavailable,
  OAuth.OAuthMethodUnsupported,
  Identity.IdentityConflict,
  Identity.LastSignInMethod,
  Hooks.HookDenied,
]);

export const SettingsApi = AuthContract.make("oauth-settings", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({
    signIn: AuthContract.oauthSignIn({ strategy: "oauth" }),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions, { strategy: "oauth" }),
    listLinkedAccounts: AuthContract.oauthListLinkedAccounts({ strategy: "accounts" }),
    linkAccount: AuthContract.action({
      payload: OAuth.OAuthLinkBegin,
      success: OAuth.OAuthSignInAuthorization,
      error: failure,
      mode: "mutation",
      credentials: true,
      strategy: "accounts",
    }),
    completeAccountLink: AuthContract.action({
      payload: Schema.Struct({
        flowId: OAuth.OAuthLinkComplete.fields.flowId,
        provider: OAuth.OAuthLinkComplete.fields.provider,
        callbackId: OAuth.OAuthLinkComplete.fields.callbackId,
        response: OAuth.OAuthLinkComplete.fields.response,
      }),
      success: OAuth.OAuthLinkResult,
      error: failure,
      mode: "mutation",
      replay: "single-use",
      credentials: true,
      requestFields: { requestBinding: "request-binding" },
      strategy: "accounts",
    }),
    unlinkAccount: AuthContract.action({
      payload: OAuth.OAuthUnlink,
      success: OAuth.OAuthUnlinked,
      error: failure,
      mode: "mutation",
      replay: "single-use",
      credentials: true,
      strategy: "accounts",
    }),
  }),
});

// Only public attempt metadata survives a redirect; no code, state, or bearer.
export const Attempt = Schema.Struct({
  kind: Schema.Literals(["sign-in", "link"]),
  callbackId: Schema.Literals(["github", "github-select"]),
  flowId: Operations.RequestBindingFlowId,
  expiresAtMillis: Schema.Int,
});

export class CallbackExpired extends Schema.TaggedError<CallbackExpired>()("CallbackExpired", {}) {}
