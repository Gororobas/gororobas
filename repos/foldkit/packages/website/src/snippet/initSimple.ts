import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({
  count: Schema.Number,
})

const Message = defineMessageUnion({
  ClickedIncrement: {},
  ClickedDecrement: {},
})
const ApplicationComposition = Block.makeDefinition('Application', {
  Model,
  Message,
}).makeComposition()

const init = ApplicationComposition.makeInit(() => ({
  model: { count: 0 },
}))
