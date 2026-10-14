import { Config, Effect, Schema } from "effect"

import { environmentConfig } from "../environment-config.js"

/** Emailed links and CSRF checks share this origin; only development permits HTTP. */
export const authenticationOrigin = Effect.gen(function* () {
  const environment = yield* environmentConfig

  const origin = Config.schema(
    Schema.String.check(
      Schema.makeFilter((value) => environment === "development" || value.startsWith("https:"), {
        identifier: "SecureAuthenticationOrigin",
        title: "Secure authentication origin",
        description: "Authentication origins must use HTTPS outside development.",
        message: "AUTH_ORIGIN must use HTTPS outside development",
      }),
    ),
    "AUTH_ORIGIN",
  )

  return yield* environment === "development"
    ? origin.pipe(Config.withDefault("http://localhost:4443"))
    : origin
})
