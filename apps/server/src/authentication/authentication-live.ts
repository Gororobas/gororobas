import {
  ApiAuthentication,
  SessionContext,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
} from "@gororobas/domain"
import { Auth, Email, Proofs, WebCrypto } from "@yielded/auth"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/sql"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { environmentConfig, type Environment } from "../environment-config.js"
import { resolveSession } from "../session-service.js"
import { AppAuth, makeAuthentication } from "./app-auth.js"
import { AuthStorageLive } from "./auth-storage.js"
import { AuthenticationEmailsLive } from "./authentication-emails.js"
import { authenticationOrigin } from "./authentication-origin.js"
import { EmailSignInTargetsLive, claimEmailAccount } from "./email-sign-in.js"
import { UnclaimedAccountsCleanupLive } from "./unclaimed-accounts.js"

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

const EmailSessionClaimsLive = Layer.effect(
  AppAuth.strategies.email.SessionClaims,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      resolve: ({ subjectId }) =>
        claimEmailAccount(subjectId).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.mapError(() => Email.EmailUnavailable.make({})),
        ),
    }
  }),
)

const keyring = (id: string, material: Redacted.Redacted<string>) => ({
  activeKeyId: id,
  keys: [{ id, material }],
})

export const authenticationLayer = (options: {
  readonly origin: string
  readonly environment: Environment
  readonly requestBindingKey: Redacted.Redacted<string>
  readonly proofKey: Redacted.Redacted<string>
}) => {
  const { http, securityLayer } = makeAuthentication(options.origin, options.environment)

  const dependencies = Layer.mergeAll(
    AuthStorageLive,
    EmailSignInTargetsLive,
    EmailSessionClaimsLive,
    Email.EmailReturnTargets.exactRoutes([DEFAULT_AUTHENTICATION_RETURN_TARGET]),
    AuthenticationEmailsLive(options.origin),
    Proofs.ProofKeys.layer(keyring("proof-v1", options.proofKey)),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 600_000,
      keyring: keyring("binding-v1", options.requestBindingKey),
    }),
  )

  // Auth routes admit requests themselves; extra middleware consumes native POST streams twice.
  return Layer.mergeAll(
    http.routes(),
    securityLayer,
    ApiAuthenticationLive,
    UnclaimedAccountsCleanupLive,
  ).pipe(
    Layer.provideMerge(http.layer),
    Layer.provide(dependencies),
    Layer.provide(WebCrypto.layerWebCrypto),
  )
}

export const AuthenticationLive = Layer.unwrap(
  Effect.gen(function* () {
    return authenticationLayer({
      origin: yield* authenticationOrigin,
      environment: yield* environmentConfig,
      requestBindingKey: yield* Config.Redacted("AUTH_BINDING_KEY"),
      proofKey: yield* Config.Redacted("AUTH_PROOF_KEY"),
    })
  }),
)
