import { AuthenticationMiddleware, CurrentAuthenticationData } from "@gororobas/domain"
import { Effect, Layer, Redacted, Schema } from "effect"

import { AuthService } from "./auth-service.js"

export const AuthenticationMiddlewareLive = Layer.effect(
  AuthenticationMiddleware,
  Effect.gen(function* () {
    const auth = yield* AuthService
    return AuthenticationMiddleware.of({
      cookie: (token) =>
        Effect.promise(async () =>
          auth.api.getSession({
            headers: new Headers({
              cookie: `better-auth.session_token=${Redacted.value(token)}`,
            }),
          }),
        ).pipe(
          Effect.andThen(Schema.decodeUnknownSync(CurrentAuthenticationData)),
          Effect.catchCause(() => Effect.succeed(null)),
        ),
    })
  }),
)
