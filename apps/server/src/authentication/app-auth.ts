import { AuthenticationApi, sessionCookieName } from "@gororobas/domain"
import { Auth, Http } from "@yielded/auth"

import { sessionConfiguration } from "./auth-storage.js"
import { magicLinkStrategy } from "./magic-link.js"
import { oauthStrategy } from "./oauth.js"

export const AppAuth = Auth.make(AuthenticationApi, {
  sessions: sessionConfiguration,
  strategies: { oauth: oauthStrategy, magicLink: magicLinkStrategy },
  defaultStrategy: "magicLink",
})

export const makeAuthentication = (origin: string) => {
  const http = Http.make(AppAuth, {
    origin,
    cookie: { name: sessionCookieName, prefix: "__Host-gororobas-" },
  })
  return { AppAuth, http }
}
