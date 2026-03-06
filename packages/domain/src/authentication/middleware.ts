import { ServiceMap } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi"

import { UnauthorizedError } from "../authorization/session.js"
import { CurrentAuthenticationData } from "./domain.js"

export class CurrentAuthenticationContext extends ServiceMap.Service<
  CurrentAuthenticationContext,
  CurrentAuthenticationData
>()("CurrentAuthenticationContext") {}

export class AuthenticationMiddleware extends HttpApiMiddleware.Service<
  AuthenticationMiddleware,
  {
    provides: CurrentAuthenticationContext
  }
>()("AuthMiddleware", {
  error: UnauthorizedError,
  security: {
    cookie: HttpApiSecurity.apiKey({
      in: "cookie",
      key: "better-auth.session_token",
    }),
  },
}) {}
