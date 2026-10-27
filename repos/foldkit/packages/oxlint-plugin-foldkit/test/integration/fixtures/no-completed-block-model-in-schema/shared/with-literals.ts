import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

export const description = `${`Nested documentation`}`
export const closingBrace = /}/
const ChildComposition = Block.makeDefinition('Child', {
  Model: Schema.Struct({ count: Schema.Number }),
  Message: defineMessageUnion({ ClickedIncrement: {} }),
}).makeComposition()
const prepare = () => ChildComposition.prepareBlock({})
export const ChildBlock = Block.assemble(prepare)
