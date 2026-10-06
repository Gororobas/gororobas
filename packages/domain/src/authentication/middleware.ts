import { makeSessionHttpContract } from "@yielded/auth/SessionContract"

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
