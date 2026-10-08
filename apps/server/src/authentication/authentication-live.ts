import { ApiAuthentication, SessionContext } from "@gororobas/domain"
import { AuthenticationHttp } from "@gororobas/domain"
import { Auth } from "@yielded/auth"
import { Option } from "effect"
import { Config, Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { resolveSession } from "../session-service.js"
import { AppAuth, makeAuthentication } from "./app-auth.js"
import { AuthStorageLive } from "./auth-storage.js"
import { magicLinkPageRoutes } from "./magic-link-page.js"
import { AuthenticationOrigin } from "./magic-link.js"
import { OAuthProtocol, oauthProtocolLayer } from "./oauth-protocol.js"
import { oauthCallbackRoutes } from "./oauth.js"

export const ApiAuthenticationLive = Layer.effect(
  ApiAuthentication,
  Effect.gen(function* () {
    const authentication = yield* AppAuth
    const sql = yield* SqlClient.SqlClient

    return ApiAuthentication.of((httpEffect) =>
      Effect.gen(function* () {
        // The auth HTTP boundary installs credentials per request; never capture them when building the layer.
        const request = yield* Effect.serviceOption(Auth.AuthRequest)
        if (Option.isNone(request)) {
          return yield* Effect.die("Authentication HTTP request context is missing")
        }

        const session = yield* resolveSession.pipe(
          Effect.provideService(Auth.AuthRequest, request.value),
          Effect.provideService(AppAuth, authentication),
          Effect.provideService(SqlClient.SqlClient, sql),
        )

        return yield* httpEffect.pipe(Effect.provideService(SessionContext, session))
      }).pipe(withApiInfrastructureErrors({ group: "authentication", endpoint: "getSession" })),
    )
  }),
)

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
    ApiAuthenticationLive,
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
