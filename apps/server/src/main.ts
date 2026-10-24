import { NodeHttpServer } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
// oxlint-disable-next-line effect/use-http-client-service, custom-lint-rules/no-node-apis -- NodeHttpServer.layer requires the Node HTTP server factory.
import * as Http from "node:http"

import { ApiLive } from "./api-live.js"
import { AppRuntimeLive } from "./app-runtime.js"
import { makeAuthentication } from "./authentication/app-auth.js"
import { AuthenticationLive } from "./authentication/authentication-live.js"
import { authenticationOrigin } from "./authentication/authentication-origin.js"
import { WikiArticleClassifierLangExtract } from "./classification/wiki-article-classifier-langextract.js"
import { environmentConfig } from "./environment-config.js"
import { ProfilesRepository } from "./profiles/repository.js"
import { runMainWithCustomRuntime } from "./run-main-with-custom-runtime.js"
import { SeedOnStartupLive } from "./seed/seed-on-startup.js"
import { ServerServicesLive } from "./server-services.js"
import { LanguageDetectionServiceStub } from "./translation/language-detection-service.js"
import { TranslationServiceDeepl } from "./translation/translation-service-deepl.js"
import { WorkflowsLive } from "./workflows-live.js"

const Services = Layer.mergeAll(WorkflowsLive, SeedOnStartupLive).pipe(
  Layer.provide(WikiArticleClassifierLangExtract),
  Layer.provideMerge(
    Layer.unwrap(
      Effect.gen(function* () {
        const origin = yield* authenticationOrigin
        const environment = yield* environmentConfig
        return ApiLive.pipe(makeAuthentication(origin, environment).http.middleware)
      }),
    ),
  ),
  Layer.provideMerge(TranslationServiceDeepl),
  Layer.provideMerge(LanguageDetectionServiceStub),
  Layer.provideMerge(AuthenticationLive),
  Layer.provideMerge(Layer.effect(ProfilesRepository, ProfilesRepository.make)),
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
)

const HttpLive = HttpRouter.serve(Services).pipe(
  Layer.provide(ServerServicesLive),

  Layer.provide(
    Layer.unwrap(
      Effect.map(Config.Port("API_PORT").pipe(Config.withDefault(4000)), (port) =>
        NodeHttpServer.layer(Http.createServer, { port }),
      ),
    ),
  ),
)

const program = Layer.launch(HttpLive)

runMainWithCustomRuntime({ runtime: AppRuntimeLive, program: program })
