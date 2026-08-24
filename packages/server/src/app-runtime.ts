import { NodeServices } from "@effect/platform-node"
import { Layer, ManagedRuntime } from "effect"

import { ClusterLive, ClusterTest } from "./cluster-live.js"
import { ErrorReporterLive } from "./error-reporter-live.js"
import { AppSqlLive, AppSqlTest } from "./sql.js"

export const AppRuntimeLive = ManagedRuntime.make(
  Layer.provide(Layer.mergeAll(AppSqlLive, ClusterLive, ErrorReporterLive), NodeServices.layer),
)

export const AppRuntimeTest = ManagedRuntime.make(
  Layer.provide(Layer.mergeAll(AppSqlTest, ClusterTest, ErrorReporterLive), NodeServices.layer),
)

export type AppRuntime = typeof AppRuntimeLive
