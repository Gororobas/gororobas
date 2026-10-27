import { Option, Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({
  count: Schema.Number,
  startingCount: Schema.Option(Schema.Number),
})

const Flags = Schema.Struct({
  savedCount: Schema.Option(Schema.Number),
})

const Message = defineMessageUnion({
  ClickedIncrement: {},
})
const ApplicationComposition = Block.makeDefinition('Application', {
  Model,
  Message,
}).makeComposition()

const init = ApplicationComposition.makeInit((flags: typeof Flags.Type) => ({
  model: {
    count: Option.getOrElse(flags.savedCount, () => 0),
    startingCount: flags.savedCount,
  },
}))
