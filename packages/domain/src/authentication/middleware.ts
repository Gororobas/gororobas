import { HttpApiMiddleware, HttpApiSecurity } from "@effect/platform"
import { Context } from "effect"

import { CurrentAuthenticationData } from "./domain.js"

// Service tag for the current authenticated user
export class CurrentAuthenticationContext extends Context.Tag("CurrentAuthenticationContext")<
  CurrentAuthenticationContext,
  CurrentAuthenticationData
>() {}

// Middleware that validates BetterAuth sessions
export class AuthenticationMiddleware extends HttpApiMiddleware.Tag<AuthenticationMiddleware>()(
  "AuthMiddleware",
  {
    provides: CurrentAuthenticationContext,

    security: {
      // BetterAuth uses cookies for session management
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        // Working, but hard coded
        key: "better-auth.session_token",
        // Derived from .env, but not working
        // key: Config.string("PUBLIC_BETTER_AUTH_COOKIE_NAME")
      }),
    },
  },
) {}
