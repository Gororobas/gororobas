import { NodeServices } from "@effect/platform-node"
import { Maple } from "@maple-dev/effect-sdk/server"
import { Layer, ManagedRuntime } from "effect"

import { ClusterLive, ClusterTest } from "./cluster-live.js"
import { ErrorReporterLive } from "./error-reporter-live.js"
import { GazetteerFixture } from "./places/gazetteer-fixture.js"
import { GazetteerLive } from "./places/gazetteer-live.js"
import { AppSqlLive, AppSqlTest } from "./sql.js"

export const AppRuntimeLive = ManagedRuntime.make(
  Layer.provide(
    Layer.mergeAll(
      AppSqlLive,
      GazetteerLive,
      ClusterLive,
      ErrorReporterLive,
      Maple.layer({
        serviceName: "gororobas-server",
        serviceVersion: "0.0.0",
        endpoint: "http://127.0.0.1:4318",
        environment: "development",
      }),
    ),
    NodeServices.layer,
  ),
)

export const AppRuntimeTest = ManagedRuntime.make(
  Layer.provide(
    Layer.mergeAll(AppSqlTest, GazetteerFixture, ClusterTest, ErrorReporterLive),
    NodeServices.layer,
  ),
)

export type AppRuntime = typeof AppRuntimeLive
