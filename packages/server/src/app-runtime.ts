import { Layer, ManagedRuntime } from "effect"

import { ClusterLive, ClusterTest } from "./cluster-live.js"
import { ErrorReporterLive } from "./error-reporter-live.js"
import { AppSqlLive, AppSqlTest } from "./sql.js"

export const AppRuntimeLive = ManagedRuntime.make(
  Layer.mergeAll(AppSqlLive, ClusterLive, ErrorReporterLive),
)

export const AppRuntimeTest = ManagedRuntime.make(
  Layer.mergeAll(AppSqlTest, ClusterTest, ErrorReporterLive),
)

export type AppRuntime = typeof AppRuntimeLive
