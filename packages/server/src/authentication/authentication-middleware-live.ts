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
        const data = yield* Effect.tryPromise({
          try: async () =>
            auth.api.getSession({
              headers: new Headers({
                cookie: `better-auth.session_token=${Redacted.value(credential)}`,
              }),
            }),
          catch: (error) =>
            new UnauthorizedError({
              session: { type: "VISITOR" },
              message: String(error),
            }),
        }).pipe(
          Effect.flatMap((result) =>
            result
              ? Schema.decodeEffect(CurrentAuthenticationData)({
                  // @ts-expect-error @todo check on better auth's generation
                  account: { ...result.user, isEmailVerified: result.user.emailVerified },
                  // @ts-expect-error @todo check on better auth's generation
                  session: { ...result.session, accountId: result.session.userId },
                })
              : Effect.succeed(null),
          ),
          Effect.catchTag(
            "SchemaError",
            (error) =>
              new UnauthorizedError({ session: { type: "VISITOR" }, message: error.message }),
          ),
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
