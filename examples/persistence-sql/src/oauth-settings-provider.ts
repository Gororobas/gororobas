import { GitHub, OAuth } from "@yielded/auth";
import { Effect, Layer, Redacted } from "effect";

export const providerLayer = (options: {
  readonly origin: URL;
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
}) =>
  Layer.effect(
    OAuth.OAuthProtocol,
    Effect.gen(function* () {
      const protocol = yield* GitHub.provider({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
      }).configure({
        provider: OAuth.OAuthProviderKey.make("github"),
        callbacks: ["github", "github-select"].map((callbackId) => ({
          callbackId: OAuth.OAuthCallbackId.make(callbackId),
          redirectUri: OAuth.OAuthRedirectUri.make(
            `${options.origin.origin}/oauth-settings/callback`,
          ),
        })),
      });

      return {
        ...protocol,
        prepareAuthorization: (input) =>
          protocol.prepareAuthorization(input).pipe(
            Effect.map((prepared) => {
              const url = new URL(Redacted.value(prepared.authorizationUrl));

              // Account selection is explicit, including when linking a new identity.
              if (input.callbackId === "github-select")
                url.searchParams.set("prompt", "select_account");

              return { ...prepared, authorizationUrl: Redacted.make(url.href) };
            }),
          ),
      } satisfies OAuth.OAuthProtocol["Service"];
    }),
  );
