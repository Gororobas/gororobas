import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({})
const Message = defineMessageUnion({ Rendered: {} })
const ContextualViewNamespace = Block.makeNamespace('ContextualView')
const feature = ContextualViewNamespace.makeDefinition({ Model, Message })

const ContextualViewComposition = feature.makeComposition()

export const view = ContextualViewComposition.makeView((_model, h) =>
  h.div([], []),
)

export const viewWithInputs = ContextualViewComposition.makeView.withInputs<
  Readonly<{ label: string }>
>((_model, h) => h.span([], []))
