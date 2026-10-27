import { Schema } from 'effect'
import * as Framework from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Composition = Framework.Block.makeDefinition('Inline', {
  Model: Schema.Struct({ count: Schema.Number }),
  Message: defineMessageUnion({ ClickedIncrement: {} }),
}).makeComposition()
const prepare = () => Composition.prepareBlock({})
export const inline = Framework.Block.assemble(prepare)
