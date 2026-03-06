import { Effect } from "effect"
import { fromWebHandler } from "effect/unstable/http/HttpEffect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import type { Auth } from "./better-auth.js"

export const makeBetterAuthRouter = (auth: Auth) =>
  HttpApiBuilder.Router.use((router) =>
    Effect.gen(function* () {
      const app = fromWebHandler(auth.handler)
      yield* router.mountApp("/api/auth", app, { includePrefix: true })
    }),
  )
