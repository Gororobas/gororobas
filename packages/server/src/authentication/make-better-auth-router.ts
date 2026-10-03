import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { fromWebHandler } from "effect/http/HttpEffect"

import type { Auth } from "./better-auth.js"

export const makeBetterAuthRouter = (auth: Auth) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const app = fromWebHandler(auth.handler)
      yield* router.prefixed("/api/auth").add("*", "*", app)
    }),
  )
