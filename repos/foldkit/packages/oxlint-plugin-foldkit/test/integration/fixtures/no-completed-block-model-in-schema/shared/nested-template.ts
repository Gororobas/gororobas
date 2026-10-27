import { Schema } from 'effect'
import { Block } from 'foldkit'

export const Registry = { Model: Schema.String }
export const documentation = `${`
export const Registry = Block.makeDefinition('Fake', {}).makeComposition().prepareBlock({});
`}`
