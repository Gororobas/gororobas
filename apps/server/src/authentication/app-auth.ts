import { AuthenticationApi, AuthenticationHttp, sessionCookieName } from "@gororobas/domain"
import { Auth, Email, Http } from "@yielded/auth"
import { makeSessionHttpContract } from "@yielded/auth/SessionContract"

import type { Environment } from "../environment-config.js"
import { sessionConfiguration } from "./auth-storage.js"

export const AppAuth = Auth.make(AuthenticationApi, {
  sessions: sessionConfiguration,
  strategies: { email: Email.makeCode() },
  defaultStrategy: "email",
})

export const makeAuthentication = (origin: string, environment: Environment) => {
  const secure = environment !== "development" || origin.startsWith("https:")
  const cookieName = secure ? sessionCookieName : "gororobas-session"

  const http = Http.make(AppAuth, {
    origin,
    cookie: {
      name: cookieName,
      prefix: secure ? "__Host-gororobas-" : "gororobas-",
      secure,
    },
  })

  const securityLayer = http.securityLayer(
    makeSessionHttpContract(AuthenticationHttp.id, AuthenticationHttp.session, { cookieName }),
  )
  return { AppAuth, http, securityLayer }
}
