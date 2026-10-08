import { Sessions, Operations, Hooks } from "@yielded/auth"
import { makeSessionHttpContract } from "@yielded/auth/SessionContract"
import { HttpApiMiddleware } from "effect/http-api"

import { SessionContext } from "../authorization/session.js"
import {
  AuthenticationSession,
  authenticationNamespace,
  sessionCookieName,
} from "./auth-contract.js"

export const AuthenticationHttp = makeSessionHttpContract(
  authenticationNamespace,
  AuthenticationSession,
  { cookieName: sessionCookieName },
)

export class ApiAuthentication extends HttpApiMiddleware.Service<
  ApiAuthentication,
  { provides: SessionContext }
>()("ApiAuthentication", {
  error: [Sessions.SessionError, Operations.OperationBoundaryError, Hooks.HookDenied],
}) {}
