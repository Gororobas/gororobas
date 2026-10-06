import { OAuthLoginRejected, OAuthProvider } from "@gororobas/domain"
import { Config, Context, Effect, Layer, Option, Predicate, Redacted, Schema } from "effect"
import * as OpenIdClient from "openid-client"

export const OAuthIdentity = Schema.Struct({
  issuer: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
  email: Schema.optionalKey(Schema.String),
  isEmailVerified: Schema.Boolean,
  name: Schema.String,
})

export class OAuthProtocol extends Context.Service<
  OAuthProtocol,
  {
    readonly authorize: (input: {
      readonly provider: typeof OAuthProvider.Type
      readonly state: string
      readonly nonce: string
      readonly pkceVerifier: string
    }) => Effect.Effect<string, OAuthLoginRejected>
    readonly exchange: (input: {
      readonly provider: typeof OAuthProvider.Type
      readonly state: string
      readonly code: Redacted.Redacted<string>
      readonly nonce: string
      readonly pkceVerifier: string
    }) => Effect.Effect<typeof OAuthIdentity.Type, OAuthLoginRejected>
  }
>()("OAuthProtocol") {}

const rejected = () => OAuthLoginRejected.make({ reason: "invalid-flow" })

const configuration = Config.all({
  googleId: Config.option(Config.NonEmptyString("GOOGLE_CLIENT_ID")),
  googleSecret: Config.option(Config.Redacted("GOOGLE_CLIENT_SECRET")),
  appleId: Config.option(Config.NonEmptyString("APPLE_CLIENT_ID")),
  appleSecret: Config.option(Config.Redacted("APPLE_CLIENT_SECRET")),
  microsoftId: Config.option(Config.NonEmptyString("MICROSOFT_CLIENT_ID")),
  microsoftSecret: Config.option(Config.Redacted("MICROSOFT_CLIENT_SECRET")),
  microsoftTenant: Config.NonEmptyString("MICROSOFT_TENANT").pipe(Config.withDefault("common")),
})

export const oauthProtocolLayer = (origin: string) =>
  Layer.effect(
    OAuthProtocol,
    Effect.gen(function* () {
      const settings = yield* configuration
      const clients: Partial<Record<typeof OAuthProvider.Type, OpenIdClient.Configuration>> = {}

      const registrations = [
        {
          provider: "google",
          issuer: "https://accounts.google.com",
          id: settings.googleId,
          secret: settings.googleSecret,
        },
        {
          provider: "apple",
          issuer: "https://appleid.apple.com",
          id: settings.appleId,
          secret: settings.appleSecret,
        },
        {
          provider: "microsoft",
          issuer: `https://login.microsoftonline.com/${encodeURIComponent(settings.microsoftTenant)}/v2.0`,
          id: settings.microsoftId,
          secret: settings.microsoftSecret,
        },
      ] as const

      yield* Effect.forEach(
        registrations,
        Effect.fn(function* (registration) {
          if (Option.isNone(registration.id) && Option.isNone(registration.secret)) return
          if (Option.isNone(registration.id) || Option.isNone(registration.secret)) {
            return yield* OAuthLoginRejected.make({ reason: "provider-disabled" })
          }
          const clientId = registration.id.value
          const secret = Redacted.value(registration.secret.value)
          if (secret === "") {
            return yield* OAuthLoginRejected.make({ reason: "provider-disabled" })
          }

          const client = yield* Effect.tryPromise({
            try: () =>
              OpenIdClient.discovery(
                new URL(registration.issuer),
                clientId,
                {
                  id_token_signed_response_alg: "RS256",
                },
                OpenIdClient.ClientSecretPost(secret),
                {
                  timeout: 10,
                  execute: [OpenIdClient.enableNonRepudiationChecks],
                },
              ),
            catch: rejected,
          })

          clients[registration.provider] = client
        }),
        { concurrency: 1, discard: true },
      )

      return makeOAuthProtocol(origin, clients)
    }),
  )

export const makeOAuthProtocol = (
  origin: string,
  clients: Readonly<Partial<Record<typeof OAuthProvider.Type, OpenIdClient.Configuration>>>,
) => {
  const getClient = (provider: typeof OAuthProvider.Type) => {
    const client = clients[provider]
    return client === undefined
      ? Effect.fail(OAuthLoginRejected.make({ reason: "provider-disabled" }))
      : Effect.succeed(client)
  }

  const callback = (provider: typeof OAuthProvider.Type) =>
    `${origin}/api/auth/${provider}/callback`

  return OAuthProtocol.of({
    authorize: Effect.fn(function* (input) {
      const client = yield* getClient(input.provider)
      const challenge = yield* Effect.tryPromise({
        try: () => OpenIdClient.calculatePKCECodeChallenge(input.pkceVerifier),
        catch: rejected,
      })

      return OpenIdClient.buildAuthorizationUrl(client, {
        redirect_uri: callback(input.provider),
        response_type: "code",
        state: input.state,
        nonce: input.nonce,
        scope: input.provider === "apple" ? "openid email" : "openid email profile",
        ...(input.provider === "apple"
          ? { response_mode: "form_post" }
          : { code_challenge: challenge, code_challenge_method: "S256" }),
      }).href
    }),
    exchange: Effect.fn(function* (input) {
      const client = yield* getClient(input.provider)
      const url = new URL(callback(input.provider))
      const parameters = new URLSearchParams({
        state: input.state,
        code: Redacted.value(input.code),
      })
      url.search = parameters.toString()

      // Apple posts its authorization response and does not advertise PKCE.
      const response =
        input.provider === "apple"
          ? new Request(callback(input.provider), {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: parameters,
            })
          : url

      const tokens = yield* Effect.tryPromise({
        try: () =>
          OpenIdClient.authorizationCodeGrant(client, response, {
            expectedState: input.state,
            expectedNonce: input.nonce,
            idTokenExpected: true,
            ...(input.provider === "apple" ? {} : { pkceCodeVerifier: input.pkceVerifier }),
          }),
        catch: rejected,
      })

      const claims = tokens.claims()
      if (claims === undefined) return yield* rejected()

      return yield* Schema.decodeEffect(OAuthIdentity)({
        issuer: claims.iss,
        subject: claims.sub,
        ...(Predicate.isString(claims.email) ? { email: claims.email } : {}),
        isEmailVerified: claims.email_verified === true || claims.email_verified === "true",
        name: Predicate.isString(claims.name) ? claims.name : "Gororobas member",
      }).pipe(Effect.mapError(rejected))
    }),
  })
}
