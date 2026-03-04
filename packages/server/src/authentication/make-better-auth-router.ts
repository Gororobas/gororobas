import { HttpApiBuilder, HttpApp } from "@effect/platform"
import { Effect } from "effect"

import type { Auth } from "./better-auth.js"

export const makeBetterAuthRouter = (auth: Auth) =>
  HttpApiBuilder.Router.use((router) =>
    Effect.gen(function* () {
      const app = HttpApp.fromWebHandler(auth.handler)
      yield* router.mountApp("/api/auth", app, { includePrefix: true })
    }),
  )
