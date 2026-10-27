import { Schema } from 'effect'
import { Block } from 'foldkit'

const Model = Schema.Null
const Message = Schema.Never

export const ImportedDefinition = Block.makeDefinition('Imported', {
  Model,
  Message,
})
