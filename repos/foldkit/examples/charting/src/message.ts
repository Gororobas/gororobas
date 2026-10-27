import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Telemetry } from './domain'
export const Message = defineMessageUnion({
  ClickedRefresh: {},
  ClickedRetry: {},
  ClickedChartDatum: { datumId: Schema.String },
  SucceededFetchTelemetry: { telemetry: Telemetry },
  FailedFetchTelemetry: { error: Schema.String },
  SucceededMountChart: { hostId: Schema.String },
  FailedMountChart: { reason: Schema.String },
  SucceededSyncChart: {},
  FailedSyncChart: { reason: Schema.String },
})
