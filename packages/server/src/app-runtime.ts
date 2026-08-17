import { BunServices } from "@effect/platform-bun"
import { Layer, ManagedRuntime } from "effect"

import { ClusterLive, ClusterTest } from "./cluster-live.js"
import { ErrorReporterLive } from "./error-reporter-live.js"
import { AppSqlLive, AppSqlTest } from "./sql.js"

export const AppRuntimeLive = ManagedRuntime.make(
  Layer.provide(Layer.mergeAll(AppSqlLive, ClusterLive, ErrorReporterLive), BunServices.layer),
)

export const AppRuntimeTest = ManagedRuntime.make(
  Layer.provide(Layer.mergeAll(AppSqlTest, ClusterTest, ErrorReporterLive), BunServices.layer),
)

export type AppRuntime = typeof AppRuntimeLive
