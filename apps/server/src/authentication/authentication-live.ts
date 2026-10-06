import { AuthenticationHttp } from "@gororobas/domain"
import { Auth } from "@yielded/auth"
import { Config, Effect, Layer, Redacted } from "effect"

import { makeAuthentication } from "./app-auth.js"
import { AuthStorageLive } from "./auth-storage.js"
import { magicLinkPageRoutes } from "./magic-link-page.js"
import { AuthenticationOrigin } from "./magic-link.js"
import { OAuthProtocol, oauthProtocolLayer } from "./oauth-protocol.js"
import { oauthCallbackRoutes } from "./oauth.js"

export const authenticationOrigin = Config.String("AUTH_ORIGIN").pipe(
  Config.withDefault("https://localhost:4443"),
)

export const authenticationLayer = (options: {
  readonly origin: string
  readonly oauthProtocol?: Layer.Layer<OAuthProtocol>
  readonly requestBindingKey: Redacted.Redacted<string>
}) => {
  const { http } = makeAuthentication(options.origin)

  const dependencies = Layer.mergeAll(
    AuthStorageLive,
    options.oauthProtocol ?? oauthProtocolLayer(options.origin),
    Layer.succeed(AuthenticationOrigin, options.origin),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 600_000,
      keyring: {
        activeKeyId: "binding-v1",
        keys: [{ id: "binding-v1", material: options.requestBindingKey }],
      },
    }),
  )

  return Layer.mergeAll(
    http.routes(),
    magicLinkPageRoutes,
    oauthCallbackRoutes,
    http.securityLayer(AuthenticationHttp),
  ).pipe(http.middleware, Layer.provideMerge(http.layer), Layer.provide(dependencies))
}

export const AuthenticationLive = Layer.unwrap(
  Effect.gen(function* () {
    const origin = yield* authenticationOrigin

    const requestBindingKey = yield* Config.Redacted("AUTH_BINDING_KEY")

    return authenticationLayer({
      origin,
      requestBindingKey,
    })
  }),
)
