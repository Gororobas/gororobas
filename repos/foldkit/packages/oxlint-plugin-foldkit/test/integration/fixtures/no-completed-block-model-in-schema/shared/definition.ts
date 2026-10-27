import { Schema } from 'effect'
import { Block as Feature } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

export const Model = Schema.Struct({ count: Schema.Number })
export const ChildDefinition = Feature.makeDefinition('Child', {
  Model,
  Message: defineMessageUnion({ ClickedIncrement: {} }),
})
