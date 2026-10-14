import * as OAuth from "@yielded/oauth/OAuth";
import type * as Oidc from "@yielded/oauth/Oidc";
import { type Crypto, Effect, type Redacted, type Scope } from "effect";
import type { HttpClient } from "effect/http";

import { OAuthUnavailable } from "../../signInErrors";
import { makeEmailEnrichment } from "../github/email";
import { OpenIdConnectConfigurationError } from "./models";

/** Provider construction captures explicit platform/crypto services within its Scope. */
export type Requirements = Crypto.Crypto | HttpClient.HttpClient | Scope.Scope;

export interface NativeProvider {
  readonly client: OAuth.Client;
  readonly enrichIdentity?: Effect.Success<ReturnType<typeof makeEmailEnrichment>>;
  readonly verifier?: {
    readonly verify: (
      token: Redacted.Redacted<string>,
      input: Oidc.VerificationInput,
    ) => Effect.Effect<Oidc.Verified, Effect.Error<ReturnType<Oidc.Verifier["verify"]>>>;
  };
}

export const install = Effect.fn("OpenIdConnect.installNative")(function* (
  options: OAuth.ClientOptions,
  githubVerifiedPrimaryEmail = false,
) {
  const client = yield* OAuth.make(options).pipe(
    Effect.mapError((error) =>
      error._tag === "OAuthConfigurationError"
        ? OpenIdConnectConfigurationError.make({ reason: "metadata" })
        : OAuthUnavailable.make({}),
    ),
  );

  return {
    client,
    ...(githubVerifiedPrimaryEmail
      ? { enrichIdentity: yield* makeEmailEnrichment(options.timeoutMs) }
      : {}),
  };
});
