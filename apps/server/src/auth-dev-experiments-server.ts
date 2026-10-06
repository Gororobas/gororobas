import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
// oxlint-disable-next-line effect/use-http-client-service -- NodeHttpServer requires the Node HTTP server factory.
// oxlint-disable-next-line custom-lint-rules/no-node-apis -- NodeHttpServer.layer requires the Node HTTP server factory.
import * as Http from "node:http"

import { AuthenticationLive } from "./authentication/authentication-live.js"
import { ServerServicesLive } from "./server-services.js"
import { AppSqlLive } from "./sql.js"

const HttpLive = HttpRouter.serve(AuthenticationLive).pipe(
  Layer.provide(ServerServicesLive),
  Layer.provide(AppSqlLive),
  Layer.provide(NodeHttpServer.layer(Http.createServer, { port: 4000 })),
)

NodeRuntime.runMain(Layer.launch(HttpLive))
