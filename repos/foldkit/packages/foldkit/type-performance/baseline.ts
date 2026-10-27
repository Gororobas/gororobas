import { Context, Effect, Layer, Option, Schema } from 'effect'
import * as Block from 'foldkit/block'
import { defineMessageUnion } from 'foldkit/message'
import type { Element as ElementProgram } from 'foldkit/program'
import type * as Update from 'foldkit/update'

const WarmupModel = Schema.Struct({ value: Schema.Number })
const WarmupMessage = defineMessageUnion({ CompletedWarmup: {} })

// oxlint-disable-next-line effecttsgo/floating-effect
Effect.void
Layer.empty
Option.none()
Block.makeDefinition('Application', {
  Model: WarmupModel,
  Message: WarmupMessage,
})
Context.Service
Block.makeDefinition('TypePerformanceWarmup', {
  Model: WarmupModel,
  Message: WarmupMessage,
})

export type WarmupStep = Update.Step<
  typeof WarmupModel.Type,
  typeof WarmupMessage.Type
>
export type WarmupElement = ElementProgram
