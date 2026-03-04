import { Layer, ManagedRuntime } from "effect"

import { ClusterLive, ClusterTest } from "./cluster-live.js"
import { AppSqlLive, AppSqlTest } from "./sql.js"

export const AppRuntimeLive = ManagedRuntime.make(Layer.merge(AppSqlLive, ClusterLive))

export const AppRuntimeTest = ManagedRuntime.make(Layer.merge(AppSqlTest, ClusterTest))

export type AppRuntime = typeof AppRuntimeLive
