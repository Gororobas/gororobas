import { Schema } from 'effect'

import { SliderBlock } from '@foldkit/ui'

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })

export const Particle = Schema.Struct({
  id: Schema.Number,
  trail: Schema.Array(Point),
  baseHue: Schema.Number,
  hueDriftPerSecond: Schema.Number,
  ageMs: Schema.Number,
  lifespanMs: Schema.Number,
  speed: Schema.Number,
  bornAtSeconds: Schema.Number,
  initialAngle: Schema.Option(Schema.Number),
  initialSpeedScale: Schema.Number,
})

export const Model = Schema.Struct({
  particles: Schema.Array(Particle),
  nextId: Schema.Number,
  elapsedSeconds: Schema.Number,
  maybeMousePosition: Schema.Option(Point),
  isRunning: Schema.Boolean,
  flowStrength: Schema.Number,
  flowStrengthSlider: SliderBlock.Model,
  noiseScale: Schema.Number,
  noiseScaleSlider: SliderBlock.Model,
})
