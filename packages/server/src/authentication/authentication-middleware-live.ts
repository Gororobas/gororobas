import {
  AuthenticationMiddleware,
  CurrentAuthenticationContext,
  CurrentAuthenticationData,
  UnauthorizedError,
} from "@gororobas/domain"
import { Effect, Layer, Redacted, Schema } from "effect"

import { AuthService } from "./auth-service.js"

export const AuthenticationMiddlewareLive = Layer.effect(
  AuthenticationMiddleware,
  Effect.gen(function* () {
    const auth = yield* AuthService
    return AuthenticationMiddleware.of({
      cookie: Effect.fn(function* (httpEffect, { credential }) {
        const result = yield* Effect.promise(async () =>
          auth.api.getSession({
            headers: new Headers({
              cookie: `better-auth.session_token=${Redacted.value(credential)}`,
            }),
          }),
        ).pipe(Effect.catchCause(() => Effect.succeed(null)))

        const data = yield* Schema.decodeUnknownEffect(CurrentAuthenticationData)(result).pipe(
          Effect.catchCause(() => Effect.succeed(null)),
        )

        if (data === null) {
          return yield* new UnauthorizedError({
            session: { type: "VISITOR" },
          })
        }

        return yield* Effect.provideService(httpEffect, CurrentAuthenticationContext, data)
      }),
    })
  }),
)
