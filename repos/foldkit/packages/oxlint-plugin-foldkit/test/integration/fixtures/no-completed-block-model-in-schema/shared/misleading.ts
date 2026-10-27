import { Schema } from 'effect'

const quoted = `
import { Block } from 'foldkit'
export const FakeDefinition = Block.makeDefinition('Fake', {})
export const FakeComposition = FakeDefinition.makeComposition()
export const FakeBlock = FakeComposition.prepareBlock({})
`

export const FakeBlock = { Model: Schema.String }
export const quotedSource = quoted
