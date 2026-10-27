import { Schema } from 'effect'
import { Runtime } from 'foldkit'

export const Workload = Schema.Literals([
  'Idle',
  'Update',
  'View',
  'Patch',
  'SubscriptionDependencies',
])

export type SlowPhase = Runtime.SlowPhase

export const SlowWarningReport = Schema.Struct({
  phase: Runtime.SlowPhase,
  durationMs: Schema.Number,
  thresholdMs: Schema.Number,
  trigger: Schema.String,
  details: Schema.String,
})

export const SlowWarning = Schema.Struct({
  id: Schema.Number,
  ...SlowWarningReport.fields,
})

export const Model = Schema.Struct({
  activeWorkload: Workload,
  nextWarningId: Schema.Number,
  warnings: Schema.Array(SlowWarning),
  patchRows: Schema.Number,
  patchRun: Schema.Number,
})
