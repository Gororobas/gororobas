import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

const generatedParticleFields = {
  x: Schema.Number,
  y: Schema.Number,
  baseHue: Schema.Number,
  hueDriftPerSecond: Schema.Number,
  lifespanMs: Schema.Number,
  speed: Schema.Number,
  initialAngle: Schema.Option(Schema.Number),
  initialSpeedScale: Schema.Number,
}

export const Message = defineMessageUnion({
  TickedFrame: { deltaTimeMs: Schema.Number },
  CompletedGenerateAmbientParticle: generatedParticleFields,
  CompletedGenerateBurstParticle: generatedParticleFields,
  PressedCanvas: {
    x: Schema.Number,
    y: Schema.Number,
  },
  MovedPointer: {
    x: Schema.Number,
    y: Schema.Number,
  },
  ClickedTogglePlay: {},
  ClickedReset: {},
})
