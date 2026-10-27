import { Schema } from 'effect'
import * as Feature from 'foldkit/block'
import { defineMessageUnion } from 'foldkit/message'

const ChildDefinition = Feature.makeDefinition('Child', {
  Model: Schema.Struct({ count: Schema.Number }),
  Message: defineMessageUnion({ ClickedIncrement: {} }),
})
const ChildComposition = ChildDefinition.makeComposition()
const prepare = () => ChildComposition.prepareBlock({})
const value = Feature.assemble(prepare)
const alias = value
export const Parent = Schema.Struct({ child: alias['Model'] })

export const description = `${`Local nested template`}`
export const closingBrace = /}/
export const LocalWithLiterals = Schema.Struct({ child: value.Model })
