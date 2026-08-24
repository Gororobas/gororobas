import { NodeHttpServer } from "@effect/platform-node"
import { GororobasApi } from "@gororobas/domain"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
// oxlint-disable-next-line effect/use-http-client-service -- NodeHttpServer requires the Node HTTP server factory.
import * as Http from "node:http"

import { ApiLive } from "./api-live.js"
import { AppRuntimeLive } from "./app-runtime.js"
import { AuthService } from "./authentication/auth-service.js"
import { createAuth } from "./authentication/better-auth.js"
import { makeBetterAuthRouter } from "./authentication/make-better-auth-router.js"
import { IdGenLive } from "./id-gen-live.js"
import { runMainWithCustomRuntime } from "./run-main-with-custom-runtime.js"
import { TranslationServiceDeepl } from "./translation/translation-service-deepl.js"
import { WorkflowsLive } from "./workflows-live.js"

// @TODO finish configuring createAuth with Effect.Config-based secret and baseURL
const auth = createAuth(AppRuntimeLive)

const Services = Layer.mergeAll(WorkflowsLive).pipe(
  Layer.provideMerge(ApiLive),
  Layer.provideMerge(IdGenLive),
  Layer.provideMerge(TranslationServiceDeepl),
  Layer.provideMerge(AuthService.make(auth)),
)

const HttpLive = HttpRouter.serve(
  HttpApiBuilder.layer(GororobasApi).pipe(
    Layer.provide(makeBetterAuthRouter(auth)),
    Layer.provide(Services),
  ),
).pipe(
  Layer.provide(
    HttpRouter.cors({
      allowedOrigins: ["http://localhost:5173"],
      credentials: true,
    }),
  ),
  Layer.provide(NodeHttpServer.layer(Http.createServer, { port: 4000 })),
)

const program = Layer.launch(HttpLive)

runMainWithCustomRuntime(AppRuntimeLive, program)
