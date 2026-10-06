import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
// oxlint-disable-next-line effect/use-http-client-service -- NodeHttpServer requires the Node HTTP server factory.
import * as Http from "node:http"

import { ApiLive } from "./api-live.js"
import { AppRuntimeLive } from "./app-runtime.js"
import { makeAuthentication } from "./authentication/app-auth.js"
import { AuthenticationLive, authenticationOrigin } from "./authentication/authentication-live.js"
import { ProfilesRepository } from "./profiles/repository.js"
import { runMainWithCustomRuntime } from "./run-main-with-custom-runtime.js"
import { ServerServicesLive } from "./server-services.js"
import { TranslationServiceDeepl } from "./translation/translation-service-deepl.js"
import { WorkflowsLive } from "./workflows-live.js"

const Services = Layer.mergeAll(WorkflowsLive).pipe(
  Layer.provideMerge(
    Layer.unwrap(
      Effect.map(authenticationOrigin, (origin) =>
        ApiLive.pipe(makeAuthentication(origin).http.middleware),
      ),
    ),
  ),
  Layer.provideMerge(TranslationServiceDeepl),
  Layer.provideMerge(AuthenticationLive),
  Layer.provideMerge(Layer.effect(ProfilesRepository, ProfilesRepository.make)),
)

const HttpLive = HttpRouter.serve(Services).pipe(
  Layer.provide(ServerServicesLive),
  Layer.provide(
    Layer.unwrap(
      Effect.map(authenticationOrigin, (origin) =>
        HttpRouter.cors({
          allowedOrigins: [origin],
          credentials: true,
        }),
      ),
    ),
  ),
  Layer.provide(NodeHttpServer.layer(Http.createServer, { port: 4000 })),
)

const program = Layer.launch(HttpLive)

runMainWithCustomRuntime(AppRuntimeLive, program)
