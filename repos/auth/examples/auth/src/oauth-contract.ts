import { AuthContract } from "@yielded/auth/contracts";
import { HookDenied } from "@yielded/auth/Hooks";
import {
  OAuthConnectedList,
  OAuthConnectedListResult,
  OAuthRejected,
  OAuthUnavailable,
  OAuthMethodUnsupported,
} from "@yielded/auth/OAuth";
import { AuthenticationRequired } from "@yielded/auth/Operations";
import { Schema } from "effect";

/** Browser sign-in contract shared by direct and proxied providers. */
export const OAuthSignInApi = AuthContract.make("example/oauth", {
  claims: Schema.Struct({ role: Schema.Literal("owner") }),
  actions: (sessions) => ({
    signIn: AuthContract.oauthSignIn(),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
  }),
});

export const OAuthApi = AuthContract.make("example/oauth", {
  claims: OAuthSignInApi.claims,
  actions: (sessions) => ({
    signIn: AuthContract.oauthSignIn(),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
    listAccountConnections: AuthContract.action({
      payload: OAuthConnectedList,
      success: OAuthConnectedListResult,
      error: Schema.Union([
        AuthenticationRequired,
        HookDenied,
        OAuthRejected,
        OAuthUnavailable,
        OAuthMethodUnsupported,
      ]),
      mode: "query",
    }),
  }),
});
